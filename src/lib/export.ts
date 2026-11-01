import { clubLabel, clubLengthIn, effectiveFps, elapsed, MPS_TO_KMH, MPS_TO_MPH, toPx, type Results, type TimingInput } from './physics.ts';
import type { Calibration, Tags, VideoInfo } from './types.ts';

export interface SessionSnapshot {
  info: VideoInfo;
  timing: TimingInput;
  calibration: Calibration;
  tags: Tags;
  results: Results;
}

const round = (v: number | null, d = 4) => (v === null ? null : Number(v.toFixed(d)));

export function buildSessionJson(s: SessionSnapshot) {
  const { info, calibration: cal, tags, results: r, timing } = s;
  const px = (p: { x: number; y: number } | null) => (p ? toPx(p, info.width, info.height) : null);
  const frameTime = (f: number | null) => (f === null ? null : round(elapsed(timing, 0, f), 5));
  return {
    app: 'SwingSpeed MVP',
    schema: 1,
    exportedAt: new Date().toISOString(),
    note: 'Average downswing speed — this is an average across the whole downswing, typically 35–45% of impact clubhead speed. Not comparable to launch monitor readings.',
    video: {
      fileName: info.fileName,
      fileSizeBytes: info.fileSize,
      container: info.container,
      codec: info.codec,
      width: info.width,
      height: info.height,
      rotationDeg: info.rotation,
      detectedFps: round(info.fps, 3),
      averageFps: round(info.averageFps, 3),
      captureFpsOverride: timing.captureFpsOverride,
      effectiveFps: round(effectiveFps(timing), 3),
      frameCount: info.frameCount,
      durationS: round(info.duration, 4),
      decodeMode: info.mode,
    },
    calibration: {
      heightM: cal.heightM,
      club: clubLabel(cal),
      clubLengthIn: clubLengthIn(cal),
      handedness: cal.handedness,
      mirrored: cal.mirrored,
      calibrationFrame: cal.frameIndex,
      headPx: px(cal.head),
      feetPx: px(cal.feet),
      swingCenterPx: px(cal.center),
      pxPerM: round(r.pxPerM, 2),
    },
    tags: {
      address: tags.address === null ? null : { frame: tags.address, timeS: frameTime(tags.address) },
      top: tags.top ? { frame: tags.top.frame, timeS: frameTime(tags.top.frame), clubheadPx: px(tags.top.point) } : null,
      impact: tags.impact ? { frame: tags.impact.frame, timeS: frameTime(tags.impact.frame), clubheadPx: px(tags.impact.point) } : null,
    },
    results: {
      backswingS: round(r.backswingS),
      downswingS: round(r.downswingS),
      tempoRatio: round(r.tempo, 3),
      arcRadiusM: round(r.radiusM),
      arcRadiusTopM: round(r.radiusTopM),
      arcRadiusImpactM: round(r.radiusImpactM),
      arcAngleDeg: r.angleRad === null ? null : round((r.angleRad * 180) / Math.PI, 2),
      arcLengthM: round(r.arcM),
      averageDownswingSpeedMps: round(r.avgSpeedMps, 3),
      averageDownswingSpeedMph: r.avgSpeedMps === null ? null : round(r.avgSpeedMps * MPS_TO_MPH, 2),
      averageDownswingSpeedKmh: r.avgSpeedMps === null ? null : round(r.avgSpeedMps * MPS_TO_KMH, 2),
      roughImpactEstimateMph:
        r.impactEstMps === null
          ? null
          : {
              estimate: round(r.impactEstMps * MPS_TO_MPH, 1),
              low: round(r.impactLowMps! * MPS_TO_MPH, 1),
              high: round(r.impactHighMps! * MPS_TO_MPH, 1),
              disclaimer: 'Very rough: average ÷ 0.4, ±20% or worse. Not a launch-monitor reading.',
            },
    },
    warnings: r.warnings,
  };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildSessionCsv(s: SessionSnapshot): string {
  const j = buildSessionJson(s);
  const rows: [string, unknown, string][] = [
    ['file', j.video.fileName, ''],
    ['detected_fps', j.video.detectedFps, 'fps'],
    ['effective_fps', j.video.effectiveFps, 'fps'],
    ['frame_count', j.video.frameCount, 'frames'],
    ['duration', j.video.durationS, 's'],
    ['resolution', `${j.video.width}x${j.video.height}`, 'px'],
    ['decode_mode', j.video.decodeMode, ''],
    ['height', j.calibration.heightM, 'm'],
    ['club', j.calibration.club, ''],
    ['handedness', j.calibration.handedness, ''],
    ['scale', j.calibration.pxPerM, 'px/m'],
    ['address_frame', j.tags.address?.frame ?? null, 'frame'],
    ['top_frame', j.tags.top?.frame ?? null, 'frame'],
    ['impact_frame', j.tags.impact?.frame ?? null, 'frame'],
    ['backswing_time', j.results.backswingS, 's'],
    ['downswing_time', j.results.downswingS, 's'],
    ['tempo_ratio', j.results.tempoRatio, ':1'],
    ['arc_radius', j.results.arcRadiusM, 'm'],
    ['arc_angle', j.results.arcAngleDeg, 'deg'],
    ['arc_length', j.results.arcLengthM, 'm'],
    ['average_downswing_speed', j.results.averageDownswingSpeedMph, 'mph'],
    ['average_downswing_speed', j.results.averageDownswingSpeedKmh, 'km/h'],
    ['rough_impact_estimate', j.results.roughImpactEstimateMph?.estimate ?? null, 'mph (±20%, very rough)'],
    ['note', j.note, ''],
  ];
  return ['metric,value,unit', ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'swing';
}
