/** A point in image pixel space (display orientation, after rotation). */
export interface Pt {
  x: number;
  y: number;
}

/** A point normalized to the frame: x ∈ [0,1] of width, y ∈ [0,1] of height. */
export type NPt = Pt;

export type DecodeMode = 'webcodecs' | 'element';

export interface VideoInfo {
  fileName: string;
  fileSize: number;
  container: string;
  codec: string | null;
  /** Display width/height in pixels after rotation. */
  width: number;
  height: number;
  /** Clockwise rotation from container metadata, in degrees. */
  rotation: number;
  /** Real frame rate deduced from frame timestamps (never the nominal header value). */
  fps: number;
  /** Mean frame rate across the file (frames ÷ span). */
  averageFps: number;
  /** True if the timestamps lie on a uniform lattice. null if unknown. */
  constantFrameRate: boolean | null;
  /** Where the fps value came from. */
  fpsSource: 'timestamps' | 'playback-estimate' | 'assumed';
  frameCount: number;
  duration: number;
  mode: DecodeMode;
  /** Why we fell back to <video> decoding (if we did). */
  fallbackReason: string | null;
}

export type Handedness = 'right' | 'left';
export type HeightUnit = 'cm' | 'in';
export type SpeedUnit = 'mph' | 'kmh';

export interface Calibration {
  heightM: number | null;
  heightUnit: HeightUnit;
  clubId: string;
  customClubIn: number;
  handedness: Handedness;
  /** Selfie-camera / mirrored footage: flips the downswing direction on screen. */
  mirrored: boolean;
  frameIndex: number;
  head: NPt | null;
  feet: NPt | null;
  center: NPt | null;
}

export interface PointTag {
  frame: number;
  point: NPt;
}

export interface Tags {
  address: number | null;
  top: PointTag | null;
  impact: PointTag | null;
}

export type Tool = 'head' | 'feet' | 'center' | 'top' | 'impact';

export interface Warning {
  level: 'error' | 'warn' | 'info';
  text: string;
}
