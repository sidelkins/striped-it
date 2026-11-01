import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FrameImage } from '../lib/video.ts';
import type { Pt } from '../lib/types.ts';

export interface OverlayPoint {
  p: Pt;
  color: string;
  label: string;
  /** Belongs to the frame currently shown (drawn solid) vs another frame (ghosted). */
  active: boolean;
  shape: 'cross' | 'ring';
}

export interface OverlayLine {
  a: Pt;
  b: Pt;
  color: string;
  active: boolean;
  dashed?: boolean;
  label?: string;
}

export interface OverlayArc {
  c: Pt;
  r: number;
  /** Canvas (y-down) angles. */
  from: number;
  to: number;
  ccw: boolean;
  color: string;
  label: string;
}

export interface Overlay {
  points: OverlayPoint[];
  lines: OverlayLine[];
  arc: OverlayArc | null;
}

interface View {
  scale: number;
  ox: number;
  oy: number;
}

interface Props {
  image: FrameImage | null;
  imageW: number;
  imageH: number;
  overlay: Overlay;
  /** Crosshair cursor + click-to-place enabled. */
  placing: boolean;
  onPlace: (p: Pt) => void;
  loading: boolean;
}

const MIN_ZOOM_FACTOR = 0.5; // relative to fit
const MAX_SCALE = 16;

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function FrameStage({ image, imageW, imageH, overlay, placing, onPlace, loading }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const [view, setView] = useState<View>({ scale: 1, ox: 0, oy: 0 });
  const fitted = useRef(true);
  const [hover, setHover] = useState<Pt | null>(null);

  const fitView = useCallback((): View => {
    if (!size.w || !size.h || !imageW || !imageH) return { scale: 1, ox: 0, oy: 0 };
    const pad = 12;
    const scale = Math.min((size.w - pad * 2) / imageW, (size.h - pad * 2) / imageH);
    return { scale, ox: (size.w - imageW * scale) / 2, oy: (size.h - imageH * scale) / 2 };
  }, [size.w, size.h, imageW, imageH]);

  const fitScale = fitView().scale;

  // Track container size.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height), dpr: window.devicePixelRatio || 1 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Refit on resize (if the user hasn't zoomed) and whenever the video dimensions change.
  useEffect(() => {
    if (fitted.current) setView(fitView());
  }, [fitView]);
  useEffect(() => {
    fitted.current = true;
    setView(fitView());
  }, [imageW, imageH]);

  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      setView((v) => {
        const minScale = fitScale * MIN_ZOOM_FACTOR;
        const scale = Math.max(minScale, Math.min(MAX_SCALE, v.scale * factor));
        const k = scale / v.scale;
        fitted.current = false;
        return { scale, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k };
      });
    },
    [fitScale],
  );

  const zoomCenter = useCallback((factor: number) => zoomAt(factor, size.w / 2, size.h / 2), [zoomAt, size.w, size.h]);

  const resetFit = useCallback(() => {
    fitted.current = true;
    setView(fitView());
  }, [fitView]);

  const oneToOne = useCallback(() => {
    setView((v) => {
      const k = 1 / v.scale;
      const sx = size.w / 2;
      const sy = size.h / 2;
      fitted.current = false;
      return { scale: 1, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k };
    });
  }, [size.w, size.h]);

  // Keyboard zoom shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') {
        zoomCenter(1.25);
        e.preventDefault();
      } else if (e.key === '-' || e.key === '_') {
        zoomCenter(1 / 1.25);
        e.preventDefault();
      } else if (e.key === '0') {
        resetFit();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomCenter, resetFit]);

  // Wheel zoom (non-passive so we can stop page scroll).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.pow(1.0018, -delta), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ---- Pointer: click to place, drag to pan, pinch to zoom -----------------
  const pointers = useRef(new Map<number, Pt>());
  const drag = useRef<{ start: Pt; view: View; moved: boolean; button: number } | null>(null);
  const pinch = useRef<{ dist: number; mid: Pt; view: View } | null>(null);

  const local = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toImage = (p: Pt, v: View = view): Pt => ({ x: (p.x - v.ox) / v.scale, y: (p.y - v.oy) / v.scale });

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      drag.current = { start: p, view, moved: false, button: e.button };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
      if (drag.current) drag.current.moved = true; // cancel the click
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (e.pointerType === 'mouse') setHover(p);
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, p);

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const pv = pinch.current.view;
      const scale = Math.max(fitScale * MIN_ZOOM_FACTOR, Math.min(MAX_SCALE, pv.scale * (d / pinch.current.dist)));
      // Keep the image point under the original midpoint under the current midpoint.
      const ip = toImage(pinch.current.mid, pv);
      fitted.current = false;
      setView({ scale, ox: mid.x - ip.x * scale, oy: mid.y - ip.y * scale });
      return;
    }

    const dr = drag.current;
    if (!dr) return;
    const dx = p.x - dr.start.x;
    const dy = p.y - dr.start.y;
    const threshold = e.pointerType === 'touch' ? 8 : 4;
    if (!dr.moved && Math.hypot(dx, dy) > threshold) dr.moved = true;
    if (dr.moved) {
      fitted.current = false;
      setView({ scale: dr.view.scale, ox: dr.view.ox + dx, oy: dr.view.oy + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const dr = drag.current;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
    if (wasSingle && dr && !dr.moved && dr.button === 0 && placing && imageW && imageH) {
      const ip = toImage(local(e));
      if (ip.x >= 0 && ip.y >= 0 && ip.x <= imageW && ip.y <= imageH) onPlace(ip);
    }
  };

  // ---- Drawing --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const { w, h, dpr } = size;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { scale, ox, oy } = view;
    const S = (p: Pt): Pt => ({ x: p.x * scale + ox, y: p.y * scale + oy });

    if (image && imageW && imageH) {
      ctx.save();
      // Show crisp pixels when zoomed in so the user can see exactly where they click.
      ctx.imageSmoothingEnabled = scale < 2;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image as CanvasImageSource, ox, oy, imageW * scale, imageH * scale);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox - 0.5, oy - 0.5, imageW * scale + 1, imageH * scale + 1);
    }

    // Labels are anchored near a point; skip them when that point is off-screen
    // (e.g. zoomed in) instead of piling them up along the edges.
    const onScreen = (p: Pt, margin = 0) => p.x >= -margin && p.y >= -margin && p.x <= w + margin && p.y <= h + margin;
    const label = (text: string, at: Pt, color: string, alpha: number) => {
      if (!onScreen(at, 40)) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '600 12px Inter, ui-sans-serif, system-ui, sans-serif';
      const m = ctx.measureText(text);
      const padX = 6;
      const bw = m.width + padX * 2;
      const bh = 20;
      const x = Math.min(Math.max(at.x, 4), w - bw - 4);
      const y = Math.min(Math.max(at.y, 4), h - bh - 4);
      ctx.fillStyle = 'rgba(10,13,17,0.82)';
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, 6);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e8edf2';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + padX, y + bh / 2 + 0.5);
      ctx.restore();
    };

    // Arc
    const arc = overlay.arc;
    if (arc) {
      const c = S(arc.c);
      const r = arc.r * scale;
      ctx.save();
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.85;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, arc.from, arc.to, arc.ccw);
      ctx.stroke();
      // Direction arrowhead at the impact end.
      const end = arc.to;
      const tip = { x: c.x + Math.cos(end) * r, y: c.y + Math.sin(end) * r };
      const tangent = end + (arc.ccw ? -Math.PI / 2 : Math.PI / 2);
      const ah = 11;
      ctx.fillStyle = arc.color;
      ctx.beginPath();
      ctx.moveTo(tip.x + Math.cos(tangent) * ah, tip.y + Math.sin(tangent) * ah);
      ctx.lineTo(tip.x + Math.cos(tangent + 2.5) * ah * 0.75, tip.y + Math.sin(tangent + 2.5) * ah * 0.75);
      ctx.lineTo(tip.x + Math.cos(tangent - 2.5) * ah * 0.75, tip.y + Math.sin(tangent - 2.5) * ah * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Label at the arc midpoint.
      let sweep = arc.ccw ? arc.from - arc.to : arc.to - arc.from;
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const mid = arc.from + (arc.ccw ? -sweep / 2 : sweep / 2);
      label(arc.label, { x: c.x + Math.cos(mid) * (r + 14) - 30, y: c.y + Math.sin(mid) * (r + 14) - 10 }, arc.color, 1);
    }

    // Lines
    for (const ln of overlay.lines) {
      const a = S(ln.a);
      const b = S(ln.b);
      ctx.save();
      ctx.globalAlpha = ln.active ? 0.9 : 0.4;
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = 1.75;
      ctx.setLineDash(ln.dashed ? [6, 5] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      if (ln.label) label(ln.label, { x: (a.x + b.x) / 2 + 8, y: (a.y + b.y) / 2 - 10 }, ln.color, ln.active ? 1 : 0.6);
    }

    // Points
    for (const pt of overlay.points) {
      const s = S(pt.p);
      const alpha = pt.active ? 1 : 0.45;
      ctx.save();
      ctx.globalAlpha = alpha;
      // Dark halo for contrast on any background.
      ctx.lineCap = 'round';
      const R = 9;
      const drawShape = (stroke: string, width: number) => {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
        if (pt.shape === 'cross') {
          ctx.moveTo(s.x - R - 6, s.y);
          ctx.lineTo(s.x - 3, s.y);
          ctx.moveTo(s.x + 3, s.y);
          ctx.lineTo(s.x + R + 6, s.y);
          ctx.moveTo(s.x, s.y - R - 6);
          ctx.lineTo(s.x, s.y - 3);
          ctx.moveTo(s.x, s.y + 3);
          ctx.lineTo(s.x, s.y + R + 6);
        }
        ctx.stroke();
      };
      drawShape('rgba(0,0,0,0.7)', 4);
      drawShape(pt.color, 2);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      label(pt.label, { x: s.x + R + 8, y: s.y - R - 14 }, pt.color, alpha);
    }

    // Placement crosshair guides (mouse only).
    if (placing && hover && image) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, hover.y + 0.5);
      ctx.lineTo(w, hover.y + 0.5);
      ctx.moveTo(hover.x + 0.5, 0);
      ctx.lineTo(hover.x + 0.5, h);
      ctx.stroke();
      ctx.restore();
    }
  }, [image, imageW, imageH, overlay, view, size, placing, hover]);

  const zoomPct = Math.round((view.scale / (fitScale || 1)) * 100);

  return (
    <div className={`stage ${placing ? 'is-placing' : ''}`} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="stage-canvas"
        style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Video frame. Click to place a point; drag to pan; scroll or pinch to zoom."
        role="img"
      />
      <div className="zoom-controls" role="toolbar" aria-label="Zoom">
        <button type="button" className="icon-btn" onClick={() => zoomCenter(1 / 1.25)} title="Zoom out (−)" aria-label="Zoom out">
          −
        </button>
        <button type="button" className="zoom-readout" onClick={resetFit} title="Fit to view (0)">
          {zoomPct}%
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomCenter(1.25)} title="Zoom in (+)" aria-label="Zoom in">
          +
        </button>
        <span className="zoom-sep" />
        <button type="button" className="text-btn" onClick={resetFit} title="Fit to view (0)">
          Fit
        </button>
        <button type="button" className="text-btn" onClick={oneToOne} title="Actual pixels">
          1:1
        </button>
      </div>
      {loading && <div className="stage-loading" aria-live="polite">Decoding…</div>}
    </div>
  );
}
