import type { Calibration, NPt, SpeedUnit } from './types.ts';

const CAL_KEY = 'swingspeed.calibration.v1';
const PREFS_KEY = 'swingspeed.prefs.v1';
const SAVED_KEY = 'swingspeed.saved.v1';

export const DEFAULT_CALIBRATION: Calibration = {
  heightM: null,
  heightUnit: 'cm',
  clubId: 'driver',
  customClubIn: 44,
  handedness: 'right',
  mirrored: false,
  frameIndex: 0,
  head: null,
  feet: null,
  center: null,
};

export interface StoredCalibration extends Calibration {
  /** Aspect ratio (w/h) of the video the points were clicked on. */
  aspect: number | null;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled (private mode) — persistence is best-effort.
  }
}

const isPt = (p: unknown): p is NPt =>
  !!p && typeof p === 'object' && Number.isFinite((p as NPt).x) && Number.isFinite((p as NPt).y);

export function loadCalibration(): StoredCalibration {
  const s = read<Partial<StoredCalibration>>(CAL_KEY);
  if (!s) return { ...DEFAULT_CALIBRATION, aspect: null };
  return {
    heightM: typeof s.heightM === 'number' && s.heightM > 0 ? s.heightM : null,
    heightUnit: s.heightUnit === 'in' ? 'in' : 'cm',
    clubId: typeof s.clubId === 'string' ? s.clubId : DEFAULT_CALIBRATION.clubId,
    customClubIn: typeof s.customClubIn === 'number' ? s.customClubIn : DEFAULT_CALIBRATION.customClubIn,
    handedness: s.handedness === 'left' ? 'left' : 'right',
    mirrored: !!s.mirrored,
    frameIndex: typeof s.frameIndex === 'number' ? s.frameIndex : 0,
    head: isPt(s.head) ? s.head : null,
    feet: isPt(s.feet) ? s.feet : null,
    center: isPt(s.center) ? s.center : null,
    aspect: typeof s.aspect === 'number' ? s.aspect : null,
  };
}

export function saveCalibration(cal: Calibration, aspect: number | null) {
  write(CAL_KEY, { ...cal, aspect });
}

export interface Prefs {
  speedUnit: SpeedUnit;
  showImpactEstimate: boolean;
}

export function loadPrefs(): Prefs {
  const p = read<Partial<Prefs>>(PREFS_KEY);
  return {
    speedUnit: p?.speedUnit === 'kmh' ? 'kmh' : 'mph',
    showImpactEstimate: !!p?.showImpactEstimate,
  };
}

export function savePrefs(p: Prefs) {
  write(PREFS_KEY, p);
}

export interface SavedSwing {
  id: string;
  label: string;
  savedAt: string;
  fileName: string;
  club: string;
  fps: number;
  backswingS: number | null;
  downswingS: number | null;
  tempo: number | null;
  radiusM: number | null;
  angleDeg: number | null;
  arcM: number | null;
  avgSpeedMps: number | null;
}

export function loadSaved(): SavedSwing[] {
  const s = read<SavedSwing[]>(SAVED_KEY);
  return Array.isArray(s) ? s.filter((x) => x && typeof x.id === 'string') : [];
}

export function storeSaved(list: SavedSwing[]) {
  write(SAVED_KEY, list.slice(0, 30));
}
