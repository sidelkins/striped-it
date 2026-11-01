import { useState } from 'react';
import type { VideoInfo } from '../lib/types.ts';

interface Props {
  info: VideoInfo;
  captureFps: number | null;
  onCaptureFps: (v: number | null) => void;
  onChangeVideo: () => void;
}

function fmtBytes(n: number) {
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.round(n / 1e3)} kB`;
}

function fmtFps(f: number) {
  return Math.abs(f - Math.round(f)) < 0.005 ? String(Math.round(f)) : f.toFixed(2);
}

const PRESETS = [60, 120, 240];

export function VideoPanel({ info, captureFps, onCaptureFps, onChangeVideo }: Props) {
  const effective = captureFps ?? info.fps;
  const lowFps = effective < 59;
  const [customMode, setCustomMode] = useState(captureFps !== null && !PRESETS.includes(captureFps));
  const presetValue = customMode ? 'custom' : captureFps === null ? 'auto' : String(captureFps);

  return (
    <section className="card" aria-labelledby="video-h">
      <header className="card-head">
        <span className="step-num done">1</span>
        <h3 id="video-h">Video</h3>
        <button type="button" className="text-btn" onClick={onChangeVideo}>
          Change…
        </button>
      </header>
      <p className="file-name" title={info.fileName}>
        {info.fileName} <span className="muted">· {fmtBytes(info.fileSize)}</span>
      </p>
      <dl className="stats">
        <div>
          <dt>Real FPS</dt>
          <dd>
            {fmtFps(info.fps)}
            {info.fpsSource !== 'timestamps' && <span className="tag tag-warn">{info.fpsSource === 'assumed' ? 'assumed' : 'estimated'}</span>}
          </dd>
        </div>
        <div>
          <dt>Frames</dt>
          <dd>{info.frameCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{info.duration.toFixed(2)} s</dd>
        </div>
        <div>
          <dt>Resolution</dt>
          <dd>
            {info.width}×{info.height}
            {info.rotation ? <span className="tag">↻{info.rotation}°</span> : null}
          </dd>
        </div>
        <div>
          <dt>Codec</dt>
          <dd>{info.codec ?? '—'}</dd>
        </div>
        <div>
          <dt>Decoder</dt>
          <dd>{info.mode === 'webcodecs' ? 'WebCodecs' : <span className="warn-text">&lt;video&gt;</span>}</dd>
        </div>
      </dl>
      {info.constantFrameRate === false && (
        <p className="hint">
          Variable frame rate detected (avg {fmtFps(info.averageFps)} fps). Timing uses each frame's exact timestamp.
        </p>
      )}

      {lowFps && (
        <div className="banner banner-warn" role="status">
          Standard frame rate detected — expect ±15–20% error. 120/240 fps slow-motion video is recommended.
        </div>
      )}
      {info.mode === 'element' && (
        <div className="banner banner-warn" role="status">
          <strong>Reduced accuracy:</strong> {info.fallbackReason} Frames are located with the browser's video player, which can land
          one frame off. For frame-exact stepping use a recent Chrome, Edge or Safari over HTTPS/localhost.
        </div>
      )}

      <div className="field">
        <label htmlFor="capfps">Real capture frame rate</label>
        <div className="row">
          <select
            id="capfps"
            value={presetValue}
            onChange={(e) => {
              const v = e.target.value;
              setCustomMode(v === 'custom');
              if (v === 'auto') onCaptureFps(null);
              else if (v === 'custom') onCaptureFps(captureFps ?? Math.round(info.fps));
              else onCaptureFps(Number(v));
            }}
          >
            <option value="auto">From file ({fmtFps(info.fps)} fps)</option>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {p} fps
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {presetValue === 'custom' && (
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={captureFps ?? ''}
              aria-label="Custom capture fps"
              onChange={(e) => {
                const n = Number(e.target.value);
                onCaptureFps(Number.isFinite(n) && n > 0 ? n : null);
              }}
              className="num"
            />
          )}
        </div>
        <p className="hint">
          Only change this if the clip is an <em>exported/shared</em> slow-mo whose playback was slowed down (e.g. file says 30 fps but
          was shot at 240). Timing then uses frame count ÷ this rate.
        </p>
      </div>
    </section>
  );
}
