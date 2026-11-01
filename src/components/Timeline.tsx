import { useRef } from 'react';

export interface TimelineMarker {
  frame: number;
  label: string;
  title: string;
  color: string;
}

interface Props {
  frame: number;
  frameCount: number;
  timeOf: (frame: number) => number;
  markers: TimelineMarker[];
  onSeek: (frame: number) => void;
}

export function Timeline({ frame, frameCount, timeOf, markers, onSeek }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const last = Math.max(1, frameCount - 1);
  const pct = (f: number) => `${(f / last) * 100}%`;

  const frameAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(t * last);
  };

  const step = (d: number) => onSeek(Math.max(0, Math.min(last, frame + d)));

  return (
    <div className="timeline">
      <div className="timeline-buttons">
        <button type="button" className="icon-btn" onClick={() => onSeek(0)} title="First frame (Home)" aria-label="First frame">
          ⏮
        </button>
        <button type="button" className="icon-btn" onClick={() => step(-10)} title="Back 10 frames (Shift+←)" aria-label="Back 10 frames">
          −10
        </button>
        <button type="button" className="icon-btn primary" onClick={() => step(-1)} title="Previous frame (←)" aria-label="Previous frame">
          ◀
        </button>
        <div className="frame-readout" aria-live="polite">
          <span className="frame-num">
            {frame}
            <span className="muted"> / {last}</span>
          </span>
          <span className="frame-time">{timeOf(frame).toFixed(3)} s</span>
        </div>
        <button type="button" className="icon-btn primary" onClick={() => step(1)} title="Next frame (→)" aria-label="Next frame">
          ▶
        </button>
        <button type="button" className="icon-btn" onClick={() => step(10)} title="Forward 10 frames (Shift+→)" aria-label="Forward 10 frames">
          +10
        </button>
        <button type="button" className="icon-btn" onClick={() => onSeek(last)} title="Last frame (End)" aria-label="Last frame">
          ⏭
        </button>
      </div>
      <div
        className="timeline-track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Frame scrubber"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={frame}
        aria-valuetext={`Frame ${frame}, ${timeOf(frame).toFixed(3)} seconds`}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onSeek(frameAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging.current) onSeek(frameAt(e.clientX));
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className="timeline-rail" />
        <div className="timeline-fill" style={{ width: pct(frame) }} />
        {markers.map((m) => (
          <button
            type="button"
            key={m.label}
            className="timeline-marker"
            style={{ left: pct(m.frame), ['--c' as string]: m.color }}
            title={`${m.title} — frame ${m.frame}`}
            aria-label={`Go to ${m.title} (frame ${m.frame})`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSeek(m.frame)}
          >
            <span>{m.label}</span>
          </button>
        ))}
        <div className="timeline-thumb" style={{ left: pct(frame) }} />
      </div>
    </div>
  );
}
