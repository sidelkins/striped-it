import { BlobSource, CanvasSink, EncodedPacketSink, Input, MATROSKA, MP4, MPEG_TS, QTFF, WEBM, type InputVideoTrack } from 'mediabunny';
import type { VideoInfo } from './types.ts';

// Video containers only (keeps the bundle small vs. ALL_FORMATS).
const VIDEO_FORMATS = [MP4, QTFF, WEBM, MATROSKA, MPEG_TS];

export type FrameImage = HTMLCanvasElement | OffscreenCanvas;

export interface FrameSource {
  readonly info: VideoInfo;
  /** Presentation timestamp (seconds) of each frame, sorted, one entry per frame. */
  readonly timestamps: Float64Array;
  getFrame(index: number): Promise<FrameImage>;
  dispose(): void;
}

export interface LoadProgress {
  stage: string;
}

const COMMON_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 119.88, 120, 180, 239.76, 240, 480, 960];

/** Snap to the nearest common rate if within 1.5%, otherwise keep the measured value. */
function snapRate(fps: number): number {
  let best = fps;
  let bestErr = 0.015;
  for (const r of COMMON_RATES) {
    const err = Math.abs(fps - r) / r;
    if (err < bestErr) {
      best = r;
      bestErr = err;
    }
  }
  return best;
}

function hasWebCodecs(): boolean {
  return typeof window !== 'undefined' && 'VideoDecoder' in window && 'VideoFrame' in window;
}

/** Binary search for the frame index whose timestamp is closest to t. */
export function indexForTime(ts: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = ts.length - 1;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(ts[lo - 1] - t) <= Math.abs(ts[lo] - t)) return lo - 1;
  return lo;
}

// ---------------------------------------------------------------------------
// Demuxing (mediabunny) — works without WebCodecs; only decoding needs it.
// ---------------------------------------------------------------------------

interface Demuxed {
  input: Input;
  track: InputVideoTrack;
  timestamps: Float64Array;
  fps: number;
  averageFps: number;
  constant: boolean | null;
  duration: number;
  width: number;
  height: number;
  rotation: number;
  codec: string | null;
  container: string;
  canDecode: boolean;
}

async function demux(file: File, onProgress: (p: LoadProgress) => void): Promise<Demuxed> {
  const input = new Input({ source: new BlobSource(file), formats: VIDEO_FORMATS });
  try {
    onProgress({ stage: 'Reading container…' });
    const format = await input.getFormat();
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('No video track found in this file.');

    const [codec, rotation, width, height] = await Promise.all([
      track.getCodec(),
      track.getRotation(),
      track.getDisplayWidth(),
      track.getDisplayHeight(),
    ]);

    onProgress({ stage: 'Indexing frames…' });
    // Read every packet's metadata (no payload) to get the exact frame count and
    // the true presentation timestamp of every frame.
    const sink = new EncodedPacketSink(track);
    const raw: number[] = [];
    let lastEnd = 0;
    for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
      raw.push(packet.timestamp);
      lastEnd = Math.max(lastEnd, packet.timestamp + packet.duration);
    }
    raw.sort((a, b) => a - b);
    // Drop exact duplicate timestamps (would be indistinguishable frames).
    const uniq: number[] = [];
    for (const t of raw) if (uniq.length === 0 || t - uniq[uniq.length - 1] > 1e-7) uniq.push(t);
    if (uniq.length < 2) throw new Error('This video has fewer than two frames.');
    const timestamps = Float64Array.from(uniq);

    onProgress({ stage: 'Measuring frame rate…' });
    const metrics = await track.computeFrameRateMetrics({ targetPacketCount: Infinity });
    const fps = metrics.underlyingFrameRate ?? metrics.bestGuessFrameRate ?? metrics.medianFrameRate;

    const first = timestamps[0];
    const duration = Math.max(lastEnd - first, timestamps[timestamps.length - 1] - first);
    const canDecode = hasWebCodecs() && (await track.canDecode().catch(() => false));

    return {
      input,
      track,
      timestamps,
      fps,
      averageFps: metrics.averageFrameRate,
      constant: metrics.frameRateIsConstant,
      duration,
      width,
      height,
      rotation,
      codec,
      container: format.name ?? 'unknown',
      canDecode,
    };
  } catch (err) {
    input.dispose();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// WebCodecs frame source (frame-accurate)
// ---------------------------------------------------------------------------

class WebCodecsSource implements FrameSource {
  readonly info: VideoInfo;
  readonly timestamps: Float64Array;
  private input: Input;
  private sink: CanvasSink;
  private cache = new Map<number, FrameImage>();
  private maxCache: number;
  private chain: Promise<unknown> = Promise.resolve();
  private lastIndex = 0;
  private disposed = false;

  constructor(d: Demuxed, info: VideoInfo) {
    this.info = info;
    this.timestamps = d.timestamps;
    this.input = d.input;
    // CanvasSink applies the container's rotation (and flip) metadata for us.
    this.sink = new CanvasSink(d.track);
    const bytesPerFrame = Math.max(1, d.width * d.height * 4);
    this.maxCache = Math.max(8, Math.min(240, Math.floor(450e6 / bytesPerFrame)));
  }

  getFrame(index: number): Promise<FrameImage> {
    const i = Math.max(0, Math.min(this.timestamps.length - 1, index));
    const hit = this.cache.get(i);
    if (hit) {
      this.touch(i, hit);
      this.lastIndex = i;
      return Promise.resolve(hit);
    }
    const job = this.chain.then(() => this.load(i));
    this.chain = job.catch(() => undefined);
    return job;
  }

  private touch(i: number, c: FrameImage) {
    this.cache.delete(i);
    this.cache.set(i, c);
  }

  private async load(i: number): Promise<FrameImage> {
    if (this.disposed) throw new Error('Video was closed.');
    const cached = this.cache.get(i);
    if (cached) return cached;

    // Decode a small window around the requested frame. Decoding has to start
    // from a keyframe anyway, so grabbing neighbours makes frame stepping in
    // the same direction instant.
    const ts = this.timestamps;
    const n = ts.length;
    const win = Math.max(4, Math.min(24, Math.floor(this.maxCache / 2)));
    const backwards = i < this.lastIndex;
    const start = backwards ? Math.max(0, i - win + 1) : i;
    const end = Math.min(n, start + win);
    this.lastIndex = i;

    const startT = ts[start];
    const endT = end < n ? ts[end] : Infinity;
    for await (const wc of this.sink.canvases(startT, endT)) {
      const idx = indexForTime(ts, wc.timestamp);
      this.cache.set(idx, wc.canvas);
    }
    this.evict(i);

    let out = this.cache.get(i);
    if (!out) {
      // Fall back to a direct lookup (e.g. odd timestamp rounding).
      const wc = await this.sink.getCanvas(ts[i]);
      if (!wc) throw new Error(`Could not decode frame ${i}.`);
      out = wc.canvas;
      this.cache.set(i, out);
    }
    return out;
  }

  private evict(keep: number) {
    while (this.cache.size > this.maxCache) {
      const oldest = this.cache.keys().next().value as number;
      if (oldest === keep) {
        const c = this.cache.get(oldest)!;
        this.touch(oldest, c);
        continue;
      }
      this.cache.delete(oldest);
    }
  }

  dispose() {
    this.disposed = true;
    this.cache.clear();
    this.input.dispose();
  }
}

// ---------------------------------------------------------------------------
// <video> element fallback (reduced accuracy)
// ---------------------------------------------------------------------------

function waitFor(el: HTMLMediaElement, ok: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for video (${ok}).`));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('The browser could not play this video. Try an H.264 MP4, or a browser with HEVC support (Safari, Chrome on macOS/Windows).'));
    };
    const cleanup = () => {
      window.clearTimeout(t);
      el.removeEventListener(ok, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(ok, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
};

/** Estimate fps from playback using requestVideoFrameCallback (no demuxer available). */
async function estimateFpsByPlayback(video: RvfcVideo): Promise<number | null> {
  if (!video.requestVideoFrameCallback) return null;
  const times: number[] = [];
  const done = new Promise<void>((resolve) => {
    const step = (_now: number, meta: { mediaTime: number }) => {
      times.push(meta.mediaTime);
      if (times.length >= 40 || video.ended) resolve();
      else video.requestVideoFrameCallback!(step);
    };
    video.requestVideoFrameCallback!(step);
    window.setTimeout(resolve, 2500);
  });
  try {
    video.muted = true;
    video.playbackRate = 0.25; // slow playback so the compositor doesn't skip frames
    await video.play();
    await done;
  } catch {
    return null;
  } finally {
    video.pause();
    video.playbackRate = 1;
  }
  const deltas: number[] = [];
  for (let k = 1; k < times.length; k++) {
    const d = times[k] - times[k - 1];
    if (d > 1e-4) deltas.push(d);
  }
  if (deltas.length < 5) return null;
  // The smallest frequently-seen delta is one frame (larger ones are skipped frames).
  deltas.sort((a, b) => a - b);
  const q = deltas[Math.floor(deltas.length * 0.2)];
  return snapRate(1 / q);
}

class ElementSource implements FrameSource {
  readonly info: VideoInfo;
  readonly timestamps: Float64Array;
  private video: RvfcVideo;
  private url: string;
  private chain: Promise<unknown> = Promise.resolve();
  private manualRotation: number;
  private cache = new Map<number, HTMLCanvasElement>();
  private maxCache: number;

  constructor(video: RvfcVideo, url: string, info: VideoInfo, timestamps: Float64Array, manualRotation: number) {
    this.video = video;
    this.url = url;
    this.info = info;
    this.timestamps = timestamps;
    this.manualRotation = manualRotation;
    this.maxCache = Math.max(4, Math.min(60, Math.floor(200e6 / Math.max(1, info.width * info.height * 4))));
  }

  getFrame(index: number): Promise<FrameImage> {
    const i = Math.max(0, Math.min(this.timestamps.length - 1, index));
    const hit = this.cache.get(i);
    if (hit) {
      this.cache.delete(i);
      this.cache.set(i, hit);
      return Promise.resolve(hit);
    }
    const job = this.chain.then(() => this.seek(i));
    this.chain = job.catch(() => undefined);
    return job;
  }

  private async seek(index: number): Promise<FrameImage> {
    const ts = this.timestamps;
    const i = Math.max(0, Math.min(ts.length - 1, index));
    const frameDur = 1 / this.info.fps;
    // Aim for the middle of the frame's display interval to avoid landing on a neighbour.
    const target = Math.min(this.video.duration - frameDur / 4, ts[i] + frameDur / 2);
    const v = this.video;
    if (Math.abs(v.currentTime - target) > frameDur / 8) {
      const painted = new Promise<void>((resolve) => {
        if (v.requestVideoFrameCallback) {
          v.requestVideoFrameCallback(() => resolve());
          window.setTimeout(resolve, 400);
        } else {
          resolve();
        }
      });
      v.currentTime = Math.max(0, target);
      await waitFor(v, 'seeked', 8000);
      await painted;
    }
    // A fresh canvas per frame: consumers detect frame changes by identity, and it lets us cache.
    const canvas = document.createElement('canvas');
    canvas.width = this.info.width;
    canvas.height = this.info.height;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    if (this.manualRotation) {
      // Browser didn't apply rotation metadata: rotate ourselves.
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((this.manualRotation * Math.PI) / 180);
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      ctx.drawImage(v, -vw / 2, -vh / 2, vw, vh);
    } else {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
    this.cache.set(i, canvas);
    while (this.cache.size > this.maxCache) this.cache.delete(this.cache.keys().next().value as number);
    return canvas;
  }

  dispose() {
    this.cache.clear();
    this.video.removeAttribute('src');
    this.video.load();
    URL.revokeObjectURL(this.url);
  }
}

async function openWithElement(file: File, d: Demuxed | null, reason: string, onProgress: (p: LoadProgress) => void): Promise<FrameSource> {
  onProgress({ stage: 'Opening with the browser video player…' });
  const url = URL.createObjectURL(file);
  const video = document.createElement('video') as RvfcVideo;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.src = url;
  try {
    await waitFor(video, 'loadeddata', 20000);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }

  let vw = video.videoWidth;
  let vh = video.videoHeight;
  let manualRotation = 0;
  if (d && (d.rotation === 90 || d.rotation === 270)) {
    // Container says portrait-rotated; if the element reports unrotated dims, rotate manually.
    const expectPortrait = d.height > d.width;
    if ((vh > vw) !== expectPortrait) {
      manualRotation = d.rotation;
      [vw, vh] = [vh, vw];
    }
  }

  let timestamps: Float64Array;
  let fps: number;
  let fpsSource: VideoInfo['fpsSource'];
  let duration: number;
  if (d) {
    timestamps = d.timestamps;
    fps = d.fps;
    fpsSource = 'timestamps';
    duration = d.duration;
  } else {
    onProgress({ stage: 'Estimating frame rate from playback…' });
    duration = video.duration;
    const est = await estimateFpsByPlayback(video);
    fps = est ?? 30;
    fpsSource = est ? 'playback-estimate' : 'assumed';
    const count = Math.max(2, Math.floor(duration * fps + 1e-6));
    timestamps = new Float64Array(count);
    for (let k = 0; k < count; k++) timestamps[k] = k / fps;
    video.currentTime = 0;
    await waitFor(video, 'seeked', 8000).catch(() => undefined);
  }

  const info: VideoInfo = {
    fileName: file.name,
    fileSize: file.size,
    container: d?.container ?? (file.type || 'unknown'),
    codec: d?.codec ?? null,
    width: vw,
    height: vh,
    rotation: d?.rotation ?? 0,
    fps,
    averageFps: d?.averageFps ?? fps,
    constantFrameRate: d?.constant ?? null,
    fpsSource,
    frameCount: timestamps.length,
    duration,
    mode: 'element',
    fallbackReason: reason,
  };
  d?.input.dispose();
  return new ElementSource(video, url, info, timestamps, manualRotation);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function openVideo(file: File, onProgress: (p: LoadProgress) => void = () => {}): Promise<FrameSource> {
  let d: Demuxed | null = null;
  let demuxError: string | null = null;
  try {
    d = await demux(file, onProgress);
  } catch (e) {
    demuxError = e instanceof Error ? e.message : String(e);
  }

  if (d && d.canDecode) {
    const info: VideoInfo = {
      fileName: file.name,
      fileSize: file.size,
      container: d.container,
      codec: d.codec,
      width: d.width,
      height: d.height,
      rotation: d.rotation,
      fps: d.fps,
      averageFps: d.averageFps,
      constantFrameRate: d.constant,
      fpsSource: 'timestamps',
      frameCount: d.timestamps.length,
      duration: d.duration,
      mode: 'webcodecs',
      fallbackReason: null,
    };
    const src = new WebCodecsSource(d, info);
    try {
      onProgress({ stage: 'Decoding first frame…' });
      await src.getFrame(0);
      return src;
    } catch (e) {
      // Decoder claimed support but failed (driver issue, odd profile…). Re-demux for the fallback
      // since the source's Input has been disposed.
      src.dispose();
      const msg = e instanceof Error ? e.message : String(e);
      let d2: Demuxed | null = null;
      try {
        d2 = await demux(file, onProgress);
      } catch {
        d2 = null;
      }
      return openWithElement(file, d2, `WebCodecs failed to decode this video (${msg}).`, onProgress);
    }
  }

  if (d) {
    const reason = !hasWebCodecs()
      ? window.isSecureContext
        ? 'This browser does not support WebCodecs.'
        : 'WebCodecs needs a secure context (HTTPS or localhost).'
      : `This browser cannot decode the ${d.codec ?? 'unknown'} codec with WebCodecs.`;
    return openWithElement(file, d, reason, onProgress);
  }

  return openWithElement(
    file,
    null,
    `Could not read the container (${demuxError ?? 'unknown error'}). Frame rate is estimated from playback.`,
    onProgress,
  );
}
