import type { Calibration, Handedness, NPt, Pt, Tags, Warning } from './types.ts';

export interface ClubOption {
  id: string;
  label: string;
  lengthIn: number;
}

export const CLUBS: ClubOption[] = [
  { id: 'driver', label: 'Driver', lengthIn: 45.5 },
  { id: '3w', label: '3-wood', lengthIn: 43 },
  { id: 'hybrid', label: 'Hybrid', lengthIn: 40 },
  { id: '5i', label: '5-iron', lengthIn: 38 },
  { id: '7i', label: '7-iron', lengthIn: 37 },
  { id: '9i', label: '9-iron', lengthIn: 36 },
  { id: 'wedge', label: 'Wedge', lengthIn: 35.5 },
  { id: 'custom', label: 'Custom length', lengthIn: 0 },
];

export const IN_TO_M = 0.0254;
export const MPS_TO_MPH = 2.2369362920544;
export const MPS_TO_KMH = 3.6;

/** Benchmarks and sanity windows from the product spec. */
export const TEMPO_BENCHMARK = 3;
export const RADIUS_RANGE_M: [number, number] = [0.8, 2.2];
export const DOWNSWING_RANGE_S: [number, number] = [0.15, 0.6];
/** Average downswing speed is assumed ≈ 40% of impact speed for the rough estimate. */
export const IMPACT_RATIO = 0.4;
export const IMPACT_ERROR_BAND = 0.2;

export function clubLengthIn(cal: Pick<Calibration, 'clubId' | 'customClubIn'>): number {
  if (cal.clubId === 'custom') return cal.customClubIn;
  return CLUBS.find((c) => c.id === cal.clubId)?.lengthIn ?? 0;
}

export function clubLabel(cal: Pick<Calibration, 'clubId' | 'customClubIn'>): string {
  if (cal.clubId === 'custom') return `Custom (${cal.customClubIn}")`;
  const c = CLUBS.find((c) => c.id === cal.clubId);
  return c ? `${c.label} (${c.lengthIn}")` : 'Unknown';
}

export function toPx(p: NPt, w: number, h: number): Pt {
  return { x: p.x * w, y: p.y * h };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const TAU = Math.PI * 2;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Angle swept by the downswing, measured at the swing center, from the clubhead
 * at the top to the clubhead at impact.
 *
 * Screen coordinates have y pointing down. Filmed face-on, a right-handed
 * golfer's backswing goes 6 → 9 → 12 o'clock on screen (clockwise), so the
 * downswing travels counter-clockwise on screen from the top back down to
 * impact. A left-hander (or mirrored footage) is the reverse. Choosing the
 * direction — rather than taking the smaller angle — is what lets us return
 * the reflex angle (typically 180–270°) that a real downswing covers.
 */
export function downswingAngle(center: Pt, top: Pt, impact: Pt, handedness: Handedness, mirrored: boolean): number {
  // Convert to math convention (y up) so that "counter-clockwise" is the usual positive direction.
  const thTop = Math.atan2(-(top.y - center.y), top.x - center.x);
  const thImp = Math.atan2(-(impact.y - center.y), impact.x - center.x);
  const ccwOnScreen = (handedness === 'right') !== mirrored;
  return ccwOnScreen ? mod(thImp - thTop, TAU) : mod(thTop - thImp, TAU);
}

/** Whether the downswing arc is drawn counter-clockwise on screen. */
export function arcIsCcwOnScreen(handedness: Handedness, mirrored: boolean): boolean {
  return (handedness === 'right') !== mirrored;
}

/**
 * Very rough expected arc radius (swing center → clubhead) from body height and
 * club length: sternum-to-lead-hand ≈ 0.38 × height, plus the club minus the
 * part of the grip hidden in the hands. Used only as an informational hint.
 */
export function expectedRadiusM(heightM: number, clubM: number): number {
  return 0.38 * heightM + Math.max(0, clubM - 0.08);
}

export interface TimingInput {
  /** Per-frame presentation timestamps, in seconds. */
  timestamps: ArrayLike<number>;
  /** Detected (real) fps from the file. */
  detectedFps: number;
  /** If set, the user's override of the real-world capture rate (e.g. 240 for an exported slow-mo). */
  captureFpsOverride: number | null;
}

/** Real-world seconds elapsed between two frame indices. */
export function elapsed(t: TimingInput, from: number, to: number): number {
  if (t.captureFpsOverride && t.captureFpsOverride > 0) {
    return (to - from) / t.captureFpsOverride;
  }
  const ts = t.timestamps;
  const a = ts[Math.max(0, Math.min(ts.length - 1, from))];
  const b = ts[Math.max(0, Math.min(ts.length - 1, to))];
  // If from/to are out of range we extrapolate with the detected fps.
  const extra = (to - Math.min(ts.length - 1, to)) - (from - Math.min(ts.length - 1, from));
  return b - a + extra / t.detectedFps;
}

export function effectiveFps(t: TimingInput): number {
  return t.captureFpsOverride && t.captureFpsOverride > 0 ? t.captureFpsOverride : t.detectedFps;
}

export interface Results {
  backswingS: number | null;
  downswingS: number | null;
  tempo: number | null;
  pxPerM: number | null;
  radiusTopM: number | null;
  radiusImpactM: number | null;
  radiusM: number | null;
  angleRad: number | null;
  arcM: number | null;
  avgSpeedMps: number | null;
  impactEstMps: number | null;
  impactLowMps: number | null;
  impactHighMps: number | null;
  expectedRadiusM: number | null;
  /** Frames between top and impact, for context. */
  downswingFrames: number | null;
  warnings: Warning[];
}

export interface ComputeInput {
  width: number;
  height: number;
  timing: TimingInput;
  calibration: Calibration;
  tags: Tags;
}

export function computeResults({ width, height, timing, calibration: cal, tags }: ComputeInput): Results {
  const warnings: Warning[] = [];
  const r: Results = {
    backswingS: null,
    downswingS: null,
    tempo: null,
    pxPerM: null,
    radiusTopM: null,
    radiusImpactM: null,
    radiusM: null,
    angleRad: null,
    arcM: null,
    avgSpeedMps: null,
    impactEstMps: null,
    impactLowMps: null,
    impactHighMps: null,
    expectedRadiusM: null,
    downswingFrames: null,
    warnings,
  };

  const fps = effectiveFps(timing);

  // ---- Ordering checks -------------------------------------------------
  let orderOkTopAddress = true;
  let orderOkImpactTop = true;
  if (tags.address !== null && tags.top && tags.top.frame <= tags.address) {
    orderOkTopAddress = false;
    warnings.push({ level: 'error', text: 'Top of backswing must come after address. Re-tag one of them.' });
  }
  if (tags.top && tags.impact && tags.impact.frame <= tags.top.frame) {
    orderOkImpactTop = false;
    warnings.push({ level: 'error', text: 'Impact must come after the top of the backswing. Re-tag one of them.' });
  }

  // ---- Timing ------------------------------------------------------------
  if (tags.address !== null && tags.top && orderOkTopAddress) {
    r.backswingS = elapsed(timing, tags.address, tags.top.frame);
  }
  if (tags.top && tags.impact && orderOkImpactTop) {
    r.downswingS = elapsed(timing, tags.top.frame, tags.impact.frame);
    r.downswingFrames = tags.impact.frame - tags.top.frame;
  }
  if (r.backswingS !== null && r.downswingS !== null && r.downswingS > 0) {
    r.tempo = r.backswingS / r.downswingS;
  }

  if (r.downswingS !== null) {
    const [lo, hi] = DOWNSWING_RANGE_S;
    if (r.downswingS < lo || r.downswingS > hi) {
      let text = `Downswing time of ${r.downswingS.toFixed(3)} s is outside the typical ${lo}–${hi} s range — the top or impact frame may be mis-tagged.`;
      if (r.downswingS > hi && fps <= 60) {
        text +=
          ' If this is a slow-motion clip that was exported or shared (playback slowed down), set the real capture frame rate (e.g. 240 fps) in the Video panel.';
      }
      warnings.push({ level: 'warn', text });
    }
    if (r.downswingFrames !== null && r.downswingFrames < 6) {
      warnings.push({
        level: 'info',
        text: `Only ${r.downswingFrames} frames between top and impact — a one-frame tagging error changes the result by ~${Math.round(100 / r.downswingFrames)}%.`,
      });
    }
  }

  // ---- Calibration scale -------------------------------------------------
  if (cal.head && cal.feet && cal.heightM && cal.heightM > 0) {
    const px = dist(toPx(cal.head, width, height), toPx(cal.feet, width, height));
    if (px < Math.max(width, height) * 0.05) {
      warnings.push({ level: 'warn', text: 'Head and feet clicks are very close together — calibration is unreliable. Re-click them on the calibration frame.' });
    }
    if (px > 0) r.pxPerM = px / cal.heightM;
  }

  const clubM = clubLengthIn(cal) * IN_TO_M;
  if (cal.heightM && cal.heightM > 0 && clubM > 0) {
    r.expectedRadiusM = expectedRadiusM(cal.heightM, clubM);
  }

  // ---- Arc geometry -----------------------------------------------------
  if (r.pxPerM && cal.center && tags.top && tags.impact) {
    const c = toPx(cal.center, width, height);
    const t = toPx(tags.top.point, width, height);
    const i = toPx(tags.impact.point, width, height);
    const rTopPx = dist(c, t);
    const rImpPx = dist(c, i);
    r.radiusTopM = rTopPx / r.pxPerM;
    r.radiusImpactM = rImpPx / r.pxPerM;
    r.radiusM = (r.radiusTopM + r.radiusImpactM) / 2;
    r.angleRad = downswingAngle(c, t, i, cal.handedness, cal.mirrored);
    r.arcM = r.radiusM * r.angleRad;

    const [lo, hi] = RADIUS_RANGE_M;
    if (r.radiusM < lo || r.radiusM > hi) {
      warnings.push({
        level: 'warn',
        text: `Measured arc radius of ${r.radiusM.toFixed(2)} m is outside the plausible ${lo}–${hi} m range — the calibration clicks (head, feet, swing center) or the clubhead clicks may be off.`,
      });
    }
    const spread = Math.abs(r.radiusTopM - r.radiusImpactM) / r.radiusM;
    if (spread > 0.25) {
      warnings.push({
        level: 'info',
        text: `Top and impact radii differ by ${Math.round(spread * 100)}% (${r.radiusTopM.toFixed(2)} m vs ${r.radiusImpactM.toFixed(2)} m). The swing center click may be off, or the camera isn't square to the swing.`,
      });
    }
    const deg = (r.angleRad * 180) / Math.PI;
    if (deg < 120 || deg > 320) {
      warnings.push({
        level: 'warn',
        text: `Arc angle of ${deg.toFixed(0)}° looks unusual (a downswing is typically 180–270°). Check handedness, the "mirrored video" option, and that the video is filmed face-on.`,
      });
    }
    if (r.expectedRadiusM && Math.abs(r.radiusM - r.expectedRadiusM) / r.expectedRadiusM > 0.3) {
      warnings.push({
        level: 'info',
        text: `Measured radius differs from the rough expectation for your height and club (≈${r.expectedRadiusM.toFixed(2)} m) by more than 30%.`,
      });
    }
  }

  // ---- Speed -------------------------------------------------------------
  if (r.arcM !== null && r.downswingS !== null && r.downswingS > 0) {
    r.avgSpeedMps = r.arcM / r.downswingS;
    r.impactEstMps = r.avgSpeedMps / IMPACT_RATIO;
    r.impactLowMps = r.impactEstMps * (1 - IMPACT_ERROR_BAND);
    r.impactHighMps = r.impactEstMps * (1 + IMPACT_ERROR_BAND);
  }

  return r;
}

export function speedIn(mps: number, unit: 'mph' | 'kmh'): number {
  return unit === 'mph' ? mps * MPS_TO_MPH : mps * MPS_TO_KMH;
}

export function speedUnitLabel(unit: 'mph' | 'kmh'): string {
  return unit === 'mph' ? 'mph' : 'km/h';
}

export function fmtTime(s: number): string {
  return `${s.toFixed(3)} s`;
}
