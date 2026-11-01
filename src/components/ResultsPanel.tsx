import { IMPACT_ERROR_BAND, IMPACT_RATIO, speedIn, speedUnitLabel, TEMPO_BENCHMARK, type Results } from '../lib/physics.ts';
import type { SpeedUnit, Warning } from '../lib/types.ts';

interface Props {
  r: Results;
  unit: SpeedUnit;
  onUnit: (u: SpeedUnit) => void;
  showImpact: boolean;
  onShowImpact: (v: boolean) => void;
  effectiveFps: number;
  timingBasis: string;
  onExportJson: () => void;
  onExportCsv: () => void;
  onSave: () => void;
  canSave: boolean;
}

const dash = <span className="muted">—</span>;

function WarningList({ items }: { items: Warning[] }) {
  if (!items.length) return null;
  return (
    <ul className="warnings">
      {items.map((w, i) => (
        <li key={i} className={`banner banner-${w.level === 'error' ? 'error' : w.level === 'warn' ? 'warn' : 'info'}`}>
          {w.text}
        </li>
      ))}
    </ul>
  );
}

export function ResultsPanel({
  r,
  unit,
  onUnit,
  showImpact,
  onShowImpact,
  effectiveFps,
  timingBasis,
  onExportJson,
  onExportCsv,
  onSave,
  canSave,
}: Props) {
  const u = speedUnitLabel(unit);
  const sp = (v: number | null) => (v === null ? null : speedIn(v, unit));
  const avg = sp(r.avgSpeedMps);
  const deg = r.angleRad === null ? null : (r.angleRad * 180) / Math.PI;
  // Tempo bar: 0..6 scale, benchmark at 3.
  const tempoPct = r.tempo === null ? 0 : Math.max(0, Math.min(100, (r.tempo / 6) * 100));
  const errPct = effectiveFps < 59 ? '±15–20%' : effectiveFps < 119 ? '±8–12%' : '±4–8%';

  return (
    <section className="card card-results" aria-labelledby="res-h">
      <header className="card-head">
        <span className={`step-num ${avg !== null ? 'done' : ''}`}>4</span>
        <h3 id="res-h">Results</h3>
        <div className="seg" role="group" aria-label="Speed unit">
          <button type="button" aria-pressed={unit === 'mph'} onClick={() => onUnit('mph')}>
            mph
          </button>
          <button type="button" aria-pressed={unit === 'kmh'} onClick={() => onUnit('kmh')}>
            km/h
          </button>
        </div>
      </header>

      <div className="hero">
        <div className="hero-label">Average downswing speed</div>
        <div className="hero-value">
          {avg !== null ? (
            <>
              <span className="mono">{avg.toFixed(1)}</span>
              <span className="hero-unit">{u}</span>
            </>
          ) : (
            <span className="hero-empty">Complete calibration and tags</span>
          )}
        </div>
        {avg !== null && (
          <div className="hero-sub">
            {r.arcM!.toFixed(2)} m of arc in {r.downswingS!.toFixed(3)} s · typical error at {Math.round(effectiveFps)} fps: {errPct}
          </div>
        )}
        <p className="disclaimer" role="note">
          <strong>Average downswing speed</strong> — this is an average across the whole downswing, typically 35–45% of impact clubhead
          speed. Not comparable to launch monitor readings.
        </p>
      </div>

      <dl className="metrics">
        <div>
          <dt>Backswing time</dt>
          <dd className="mono">{r.backswingS !== null ? `${r.backswingS.toFixed(3)} s` : dash}</dd>
        </div>
        <div>
          <dt>Downswing time</dt>
          <dd className="mono">
            {r.downswingS !== null ? `${r.downswingS.toFixed(3)} s` : dash}
            {r.downswingFrames !== null && <span className="sub"> {r.downswingFrames} fr</span>}
          </dd>
        </div>
        <div className="span2">
          <dt>
            Tempo ratio <span className="muted">(benchmark ~{TEMPO_BENCHMARK}:1)</span>
          </dt>
          <dd className="mono">{r.tempo !== null ? `${r.tempo.toFixed(2)} : 1` : dash}</dd>
          <div className="tempo-bar" aria-hidden="true">
            <div className="tempo-bench" style={{ left: `${(TEMPO_BENCHMARK / 6) * 100}%` }} />
            {r.tempo !== null && <div className="tempo-dot" style={{ left: `${tempoPct}%` }} />}
            <span className="tempo-tick" style={{ left: '0%' }}>
              0
            </span>
            <span className="tempo-tick" style={{ left: '50%' }}>
              3:1
            </span>
            <span className="tempo-tick" style={{ left: '100%' }}>
              6:1
            </span>
          </div>
        </div>
        <div>
          <dt>Arc radius</dt>
          <dd className="mono">{r.radiusM !== null ? `${r.radiusM.toFixed(2)} m` : dash}</dd>
          {r.radiusTopM !== null && (
            <dd className="sub mono">
              top {r.radiusTopM.toFixed(2)} · impact {r.radiusImpactM!.toFixed(2)}
            </dd>
          )}
        </div>
        <div>
          <dt>Arc angle</dt>
          <dd className="mono">{deg !== null ? `${deg.toFixed(0)}°` : dash}</dd>
        </div>
        <div>
          <dt>Arc length</dt>
          <dd className="mono">{r.arcM !== null ? `${r.arcM.toFixed(2)} m` : dash}</dd>
        </div>
        <div>
          <dt>Expected radius</dt>
          <dd className="mono">{r.expectedRadiusM !== null ? `≈${r.expectedRadiusM.toFixed(2)} m` : dash}</dd>
          <dd className="sub">from height + club</dd>
        </div>
      </dl>

      <WarningList items={r.warnings} />

      <label className="check impact-toggle">
        <input type="checkbox" checked={showImpact} onChange={(e) => onShowImpact(e.target.checked)} />
        Show rough impact speed estimate
      </label>
      {showImpact && (
        <div className="impact-est">
          {r.impactEstMps !== null ? (
            <div className="impact-value">
              ≈ <span className="mono">{sp(r.impactEstMps)!.toFixed(0)}</span> {u}
              <span className="muted mono">
                {' '}
                ({sp(r.impactLowMps)!.toFixed(0)}–{sp(r.impactHighMps)!.toFixed(0)})
              </span>
            </div>
          ) : (
            <div className="muted">Available once the average is computed.</div>
          )}
          <p className="disclaimer strong">
            <strong>Very rough guess, not a measurement.</strong> It simply divides the average by {IMPACT_RATIO} and shows a ±
            {IMPACT_ERROR_BAND * 100}% band. The real ratio varies by player, club and swing, and impact speed cannot be recovered from
            timing alone. Do not compare this with a launch monitor, and don't use it for club fitting.
          </p>
        </div>
      )}

      <details className="method">
        <summary>How this is calculated</summary>
        <ul>
          <li>
            Timing: {timingBasis}. Backswing = top − address; downswing = impact − top.
          </li>
          <li>Scale: pixel distance from head to feet ÷ your height.</li>
          <li>Radius: mean of (swing center → top clubhead) and (swing center → impact clubhead), in metres.</li>
          <li>
            Angle: swept at the swing center from top to impact in the downswing direction for your handedness (the reflex angle, usually
            180–270°).
          </li>
          <li>Average speed = radius × angle (radians) ÷ downswing time.</li>
          <li>Assumes a face-on camera, square to the golfer, and a circular arc in the image plane.</li>
        </ul>
      </details>

      <div className="actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={onExportJson}>
          Export JSON
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onExportCsv}>
          Export CSV
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={!canSave} title={canSave ? 'Save for comparison' : 'Complete all tags first'}>
          Save swing
        </button>
      </div>
    </section>
  );
}
