import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalibrationPanel } from './components/CalibrationPanel.tsx';
import { ComparePanel } from './components/ComparePanel.tsx';
import { DropZone } from './components/DropZone.tsx';
import { FrameStage, type Overlay, type OverlayLine, type OverlayPoint } from './components/FrameStage.tsx';
import { ResultsPanel } from './components/ResultsPanel.tsx';
import { TagPanel } from './components/TagPanel.tsx';
import { Timeline, type TimelineMarker } from './components/Timeline.tsx';
import { VideoPanel } from './components/VideoPanel.tsx';
import { baseName, buildSessionCsv, buildSessionJson, download } from './lib/export.ts';
import {
  arcIsCcwOnScreen,
  clubLabel,
  computeResults,
  dist,
  effectiveFps,
  elapsed,
  toPx,
  type TimingInput,
} from './lib/physics.ts';
import { DEFAULT_CALIBRATION, loadCalibration, loadPrefs, loadSaved, saveCalibration, savePrefs, storeSaved, type Prefs, type SavedSwing } from './lib/storage.ts';
import type { Calibration, Pt, Tags, Tool } from './lib/types.ts';
import type { FrameImage, FrameSource } from './lib/video.ts';

const COLORS = {
  head: '#38bdf8',
  feet: '#38bdf8',
  center: '#f5b942',
  address: '#94a3b8',
  top: '#c084fc',
  impact: '#a3e635',
  arc: '#a3e635',
};

const EMPTY_TAGS: Tags = { address: null, top: null, impact: null };

const TOOL_TEXT: Record<Tool, string> = {
  head: 'Click the very top of your head',
  feet: 'Click the bottom of your feet — where the shoes meet the ground',
  center: 'Click your swing center — upper chest / sternum',
  top: 'Step to the top of the backswing, then click the clubhead',
  impact: 'Step to impact, zoom in, and click the clubhead (middle of the blur)',
};

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

const looksLikeVideo = (f: File) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm|mkv|3gp)$/i.test(f.name);

/** Loads frames for the requested index, at most one decode in flight; the latest request wins. */
function useFrame(source: FrameSource | null, index: number) {
  const [frame, setFrame] = useState<{ index: number; image: FrameImage } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wanted = useRef(index);
  const runningFor = useRef<FrameSource | null>(null);
  const current = useRef<FrameSource | null>(source);

  useEffect(() => {
    current.current = source;
    setFrame(null);
    setError(null);
  }, [source]);

  useEffect(() => {
    wanted.current = index;
    if (!source || runningFor.current === source) return;
    runningFor.current = source;
    setLoading(true);
    (async () => {
      try {
        for (;;) {
          const target = wanted.current;
          const image = await source.getFrame(target);
          if (current.current !== source) return;
          setFrame({ index: target, image });
          if (wanted.current === target) break;
        }
        setError(null);
      } catch (e) {
        if (current.current === source) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (runningFor.current === source) runningFor.current = null;
        if (current.current === source) setLoading(false);
      }
    })();
  }, [source, index]);

  return { frame, loading, error };
}

export default function App() {
  const [source, setSource] = useState<FrameSource | null>(null);
  const sourceRef = useRef<FrameSource | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [frame, setFrameIdx] = useState(0);
  const [tool, setTool] = useState<Tool | null>(null);
  const [tags, setTags] = useState<Tags>(EMPTY_TAGS);
  const [captureFps, setCaptureFps] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loadId, setLoadId] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const initialCal = useMemo(() => loadCalibration(), []);
  const [cal, setCal] = useState<Calibration>(() => {
    const { aspect: _aspect, ...rest } = initialCal;
    return rest;
  });
  const [calAspect, setCalAspect] = useState<number | null>(initialCal.aspect);
  const [restored, setRestored] = useState(!!(initialCal.head || initialCal.feet || initialCal.center));

  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [saved, setSaved] = useState<SavedSwing[]>(() => loadSaved());

  useEffect(() => saveCalibration(cal, calAspect), [cal, calAspect]);
  useEffect(() => savePrefs(prefs), [prefs]);
  useEffect(() => storeSaved(saved), [saved]);
  useEffect(() => () => sourceRef.current?.dispose(), []);

  const info = source?.info ?? null;
  const W = info?.width ?? 0;
  const H = info?.height ?? 0;
  const lastFrame = info ? info.frameCount - 1 : 0;

  const { frame: shown, loading: frameLoading, error: frameError } = useFrame(source, frame);

  const timing: TimingInput | null = useMemo(
    () => (source ? { timestamps: source.timestamps, detectedFps: source.info.fps, captureFpsOverride: captureFps } : null),
    [source, captureFps],
  );
  const timeOf = useCallback((f: number) => (timing ? elapsed(timing, 0, f) : 0), [timing]);

  const seek = useCallback((f: number) => setFrameIdx(Math.max(0, Math.min(lastFrame, Math.round(f)))), [lastFrame]);

  // ---- Loading -------------------------------------------------------------
  const loadFile = useCallback(
    async (file: File) => {
      if (!looksLikeVideo(file)) {
        setLoadError(`"${file.name}" doesn't look like a video file.`);
        return;
      }
      setLoadError(null);
      setBusy('Opening…');
      try {
        // The decoder stack (mediabunny) is loaded on demand to keep first paint fast.
        const { openVideo } = await import('./lib/video.ts');
        const src = await openVideo(file, (p) => setBusy(p.stage));
        sourceRef.current?.dispose();
        sourceRef.current = src;
        setSource(src);
        setFrameIdx(0);
        setTags(EMPTY_TAGS);
        setTool(null);
        setCaptureFps(null);
        setLoadId((n) => n + 1);
        const aspect = src.info.width / src.info.height;
        setCal((c) => {
          let next = { ...c, frameIndex: Math.min(c.frameIndex, src.info.frameCount - 1) };
          if (calAspect !== null && Math.abs(calAspect - aspect) / aspect > 0.02) {
            next = { ...next, head: null, feet: null, center: null, frameIndex: 0 };
            setRestored(false);
          }
          return next;
        });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [calAspect],
  );

  // Window-wide drag and drop.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragOver(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragOver(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void loadFile(f);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [loadFile]);

  // ---- Tagging -------------------------------------------------------------
  const setAddress = useCallback(() => setTags((t) => ({ ...t, address: frame })), [frame]);

  const place = useCallback(
    (p: Pt) => {
      if (!tool || !W || !H) return;
      const n = { x: p.x / W, y: p.y / H };
      if (tool === 'head' || tool === 'feet' || tool === 'center') {
        const next: Calibration = { ...cal, [tool]: n, frameIndex: frame };
        setCal(next);
        setCalAspect(W / H);
        setRestored(false);
        if (tool === 'head') setTool(next.feet ? (next.center ? null : 'center') : 'feet');
        else if (tool === 'feet') setTool(next.center ? null : 'center');
        else setTool(null);
      } else if (tool === 'top') {
        setTags((t) => ({ ...t, top: { frame, point: n } }));
        setTool(tags.impact ? null : 'impact');
      } else {
        setTags((t) => ({ ...t, impact: { frame, point: n } }));
        setTool(null);
      }
    },
    [tool, W, H, cal, frame, tags.impact],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'ArrowLeft':
          seek(frame - step);
          break;
        case 'ArrowRight':
          seek(frame + step);
          break;
        case 'Home':
          seek(0);
          break;
        case 'End':
          seek(lastFrame);
          break;
        case 'a':
        case 'A':
          setAddress();
          break;
        case 't':
        case 'T':
          setTool('top');
          break;
        case 'i':
        case 'I':
          setTool('impact');
          break;
        case 'Escape':
          setTool(null);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [source, frame, lastFrame, seek, setAddress]);

  // ---- Results -------------------------------------------------------------
  const results = useMemo(
    () => (info && timing ? computeResults({ width: W, height: H, timing, calibration: cal, tags }) : null),
    [info, timing, W, H, cal, tags],
  );

  // ---- Overlay -------------------------------------------------------------
  const overlay: Overlay = useMemo(() => {
    const points: OverlayPoint[] = [];
    const lines: OverlayLine[] = [];
    let arc: Overlay['arc'] = null;
    if (!W || !H) return { points, lines, arc };
    const onCal = frame === cal.frameIndex;
    const P = (n: { x: number; y: number }) => toPx(n, W, H);

    if (cal.head && cal.feet) {
      lines.push({
        a: P(cal.head),
        b: P(cal.feet),
        color: COLORS.head,
        active: onCal,
        dashed: true,
        label: cal.heightM ? `${cal.heightM.toFixed(2)} m` : undefined,
      });
    }
    if (cal.head) points.push({ p: P(cal.head), color: COLORS.head, label: 'Head', active: onCal, shape: 'cross' });
    if (cal.feet) points.push({ p: P(cal.feet), color: COLORS.feet, label: 'Feet', active: onCal, shape: 'cross' });

    const c = cal.center ? P(cal.center) : null;
    const top = tags.top ? P(tags.top.point) : null;
    const imp = tags.impact ? P(tags.impact.point) : null;
    if (c && top) lines.push({ a: c, b: top, color: COLORS.top, active: frame === tags.top!.frame });
    if (c && imp) lines.push({ a: c, b: imp, color: COLORS.impact, active: frame === tags.impact!.frame });
    if (c && top && imp && results?.angleRad != null) {
      const r = (dist(c, top) + dist(c, imp)) / 2;
      const deg = (results.angleRad * 180) / Math.PI;
      arc = {
        c,
        r,
        from: Math.atan2(top.y - c.y, top.x - c.x),
        to: Math.atan2(imp.y - c.y, imp.x - c.x),
        ccw: arcIsCcwOnScreen(cal.handedness, cal.mirrored),
        color: COLORS.arc,
        label: `${deg.toFixed(0)}°${results.arcM != null ? ` · ${results.arcM.toFixed(2)} m` : ''}`,
      };
    }
    if (c) points.push({ p: c, color: COLORS.center, label: 'Center', active: onCal, shape: 'ring' });
    if (top) points.push({ p: top, color: COLORS.top, label: `Top #${tags.top!.frame}`, active: frame === tags.top!.frame, shape: 'cross' });
    if (imp) points.push({ p: imp, color: COLORS.impact, label: `Impact #${tags.impact!.frame}`, active: frame === tags.impact!.frame, shape: 'cross' });
    return { points, lines, arc };
  }, [W, H, frame, cal, tags, results]);

  const markers: TimelineMarker[] = useMemo(() => {
    const m: TimelineMarker[] = [];
    if (cal.head || cal.feet || cal.center) m.push({ frame: cal.frameIndex, label: 'C', title: 'Calibration frame', color: COLORS.head });
    if (tags.address !== null) m.push({ frame: tags.address, label: '1', title: 'Address', color: COLORS.address });
    if (tags.top) m.push({ frame: tags.top.frame, label: '2', title: 'Top of backswing', color: COLORS.top });
    if (tags.impact) m.push({ frame: tags.impact.frame, label: '3', title: 'Impact', color: COLORS.impact });
    return m;
  }, [cal.frameIndex, cal.head, cal.feet, cal.center, tags]);

  // ---- Guidance --------------------------------------------------------------
  const nextHint = useMemo(() => {
    if (!info) return '';
    if (!cal.heightM) return 'Next: enter your height in Calibration.';
    if (!cal.head || !cal.feet || !cal.center) return 'Next: click head, feet and swing center on the calibration frame.';
    if (tags.address === null) return 'Next: step to the start of the takeaway and press A (or "Set" under Address).';
    if (!tags.top) return 'Next: step to the top of the backswing and press T, then click the clubhead.';
    if (!tags.impact) return 'Next: step to impact and press I, then click the clubhead.';
    return 'All set — see Results. Re-tag any point to refine.';
  }, [info, cal, tags]);

  // ---- Export / save -------------------------------------------------------
  const snapshot = () => (info && timing && results ? { info, timing, calibration: cal, tags, results } : null);
  const exportJson = () => {
    const s = snapshot();
    if (s) download(`${baseName(s.info.fileName)}-swingspeed.json`, JSON.stringify(buildSessionJson(s), null, 2), 'application/json');
  };
  const exportCsv = () => {
    const s = snapshot();
    if (s) download(`${baseName(s.info.fileName)}-swingspeed.csv`, buildSessionCsv(s), 'text/csv');
  };
  const saveSwing = () => {
    if (!info || !results || !timing) return;
    const n = saved.length + 1;
    const club = clubLabel(cal).replace(/ \(.*\)$/, '');
    const entry: SavedSwing = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      label: `Swing ${n} · ${club}`,
      savedAt: new Date().toISOString(),
      fileName: info.fileName,
      club,
      fps: effectiveFps(timing),
      backswingS: results.backswingS,
      downswingS: results.downswingS,
      tempo: results.tempo,
      radiusM: results.radiusM,
      angleDeg: results.angleRad === null ? null : (results.angleRad * 180) / Math.PI,
      arcM: results.arcM,
      avgSpeedMps: results.avgSpeedMps,
    };
    setSaved((s) => [entry, ...s]);
  };

  const timingBasis =
    captureFps && info
      ? `frame count ÷ ${captureFps} fps (manual capture rate)`
      : info?.fpsSource === 'timestamps'
        ? 'exact frame timestamps from the file (= frame count ÷ FPS for constant-rate video)'
        : `frame count ÷ ${info?.fps.toFixed(2)} fps (estimated)`;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 64 64" className="brand-mark" aria-hidden="true">
            <path d="M14 46 A22 22 0 0 1 46 16" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            <circle cx="46" cy="16" r="6" fill="currentColor" />
            <circle cx="32" cy="38" r="5" fill="var(--amber)" />
          </svg>
          <span className="brand-name">SwingSpeed</span>
          <span className="brand-tag">MVP</span>
        </div>
        <p className="topbar-sub">Average downswing speed &amp; tempo from video</p>
        <span className="pill" title="All processing happens in this browser tab. Nothing is uploaded.">
          <span className="dot" aria-hidden="true" /> 100% on-device
        </span>
      </header>

      <main className="layout">
        <div className="stage-col">
          {source && info ? (
            <>
              <div className={`guide ${tool ? 'guide-active' : ''}`} role="status" aria-live="polite">
                {tool ? (
                  <>
                    <span className="guide-dot" style={{ background: COLORS[tool] }} />
                    <span>{TOOL_TEXT[tool]}</span>
                    <span className="guide-keys">
                      scroll/pinch to zoom · drag to pan · <kbd>Esc</kbd> cancel
                    </span>
                  </>
                ) : (
                  <span className="muted">{nextHint}</span>
                )}
              </div>
              <FrameStage
                image={shown?.image ?? null}
                imageW={W}
                imageH={H}
                overlay={overlay}
                placing={!!tool}
                onPlace={place}
                loading={frameLoading && shown?.index !== frame}
              />
              {frameError && (
                <div className="banner banner-error stage-error" role="alert">
                  Couldn't decode this frame: {frameError}
                </div>
              )}
              <Timeline frame={frame} frameCount={info.frameCount} timeOf={timeOf} markers={markers} onSeek={seek} />
            </>
          ) : (
            <DropZone onFile={loadFile} busy={busy} error={loadError} />
          )}
          {source && busy && <div className="busy-overlay">{busy}</div>}
        </div>

        <aside className="sidebar">
          {source && info && results && timing ? (
            <>
              {loadError && (
                <div className="banner banner-error" role="alert">
                  {loadError}
                </div>
              )}
              <VideoPanel key={loadId} info={info} captureFps={captureFps} onCaptureFps={setCaptureFps} onChangeVideo={() => fileInput.current?.click()} />
              <CalibrationPanel
                cal={cal}
                onChange={(patch) => setCal((c) => ({ ...c, ...patch }))}
                tool={tool}
                onTool={setTool}
                currentFrame={frame}
                onGoToFrame={seek}
                pxPerM={results.pxPerM}
                restoredNotice={restored}
                onReset={() => {
                  setCal({ ...DEFAULT_CALIBRATION, heightUnit: cal.heightUnit });
                  setCalAspect(null);
                  setRestored(false);
                  setTool((t) => (t === 'head' || t === 'feet' || t === 'center' ? null : t));
                }}
                colors={COLORS}
              />
              <TagPanel
                tags={tags}
                tool={tool}
                onTool={setTool}
                currentFrame={frame}
                timeOf={timeOf}
                onSetAddress={setAddress}
                onClear={(k) => {
                  setTags((t) => ({ ...t, [k]: null }));
                  if (tool === k) setTool(null);
                }}
                onGoToFrame={seek}
                colors={COLORS}
              />
              <ResultsPanel
                r={results}
                unit={prefs.speedUnit}
                onUnit={(u) => setPrefs((p) => ({ ...p, speedUnit: u }))}
                showImpact={prefs.showImpactEstimate}
                onShowImpact={(v) => setPrefs((p) => ({ ...p, showImpactEstimate: v }))}
                effectiveFps={effectiveFps(timing)}
                timingBasis={timingBasis}
                onExportJson={exportJson}
                onExportCsv={exportCsv}
                onSave={saveSwing}
                canSave={results.avgSpeedMps !== null && !results.warnings.some((w) => w.level === 'error')}
              />
              <ComparePanel
                saved={saved}
                unit={prefs.speedUnit}
                onDelete={(id) => setSaved((s) => s.filter((x) => x.id !== id))}
                onRename={(id, label) => setSaved((s) => s.map((x) => (x.id === id ? { ...x, label } : x)))}
              />
            </>
          ) : (
            <Intro />
          )}
          <footer className="foot muted">
            Estimates only — not a launch monitor. Your video stays on this device.
          </footer>
        </aside>
      </main>

      <input
        ref={fileInput}
        type="file"
        accept="video/*,.mov,.mp4,.m4v,.webm,.mkv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = '';
        }}
      />
      {dragOver && (
        <div className="drop-overlay" aria-hidden="true">
          <div>Drop video to load</div>
        </div>
      )}
    </div>
  );
}

function Intro() {
  return (
    <>
      <section className="card">
        <header className="card-head">
          <h3>How it works</h3>
        </header>
        <ol className="how">
          <li>
            <strong>Upload</strong> a face-on swing video. We read the real frame rate and every frame's timestamp.
          </li>
          <li>
            <strong>Calibrate</strong>: enter your height and club, then click the top of your head, your feet and your sternum.
          </li>
          <li>
            <strong>Tag</strong> three frames: address, top of backswing (+ clubhead), impact (+ clubhead).
          </li>
          <li>
            <strong>Read</strong> your tempo and <em>average</em> downswing speed: arc length ÷ downswing time.
          </li>
        </ol>
      </section>
      <section className="card">
        <header className="card-head">
          <h3>Filming tips</h3>
        </header>
        <ul className="tips">
          <li>Face-on (camera facing your chest), square to the target line, at about hip height.</li>
          <li>Tripod or propped phone — the camera must not move.</li>
          <li>Whole body and the full club in frame at the top of the backswing.</li>
          <li>Use Slo-mo (120/240 fps) and bright light for a sharper clubhead.</li>
          <li>Prefer the original file (AirDrop "All Photos Data" / cable) over a messaging-app copy.</li>
        </ul>
      </section>
      <section className="card card-note">
        <p>
          This measures the <strong>average</strong> clubhead speed across the whole downswing, not impact speed. Impact speed is roughly
          2.2–2.8× higher and can't be recovered from timing alone.
        </p>
      </section>
    </>
  );
}
