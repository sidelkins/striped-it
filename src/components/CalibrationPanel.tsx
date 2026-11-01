import { useEffect, useState } from 'react';
import { CLUBS, IN_TO_M } from '../lib/physics.ts';
import type { Calibration, Tool } from '../lib/types.ts';

interface Props {
  cal: Calibration;
  onChange: (patch: Partial<Calibration>) => void;
  tool: Tool | null;
  onTool: (t: Tool | null) => void;
  currentFrame: number;
  onGoToFrame: (f: number) => void;
  pxPerM: number | null;
  restoredNotice: boolean;
  onReset: () => void;
  colors: Record<'head' | 'feet' | 'center', string>;
}

function cmToFtIn(cm: number): { ft: number; inch: number } {
  const total = cm / 2.54;
  let ft = Math.floor(total / 12);
  let inch = Math.round((total - ft * 12) * 10) / 10;
  if (inch >= 12) {
    ft += 1;
    inch -= 12;
  }
  return { ft, inch };
}

export function CalibrationPanel({ cal, onChange, tool, onTool, currentFrame, onGoToFrame, pxPerM, restoredNotice, onReset, colors }: Props) {
  // Local text state so users can type freely; committed as metres.
  const [cm, setCm] = useState(cal.heightM ? String(Math.round(cal.heightM * 1000) / 10) : '');
  const [ft, setFt] = useState(cal.heightM ? String(cmToFtIn(cal.heightM * 100).ft) : '');
  const [inch, setInch] = useState(cal.heightM ? String(cmToFtIn(cal.heightM * 100).inch) : '');

  // Keep text in sync if the value changes from outside (e.g. reset).
  useEffect(() => {
    if (cal.heightM === null) {
      setCm('');
      setFt('');
      setInch('');
    }
  }, [cal.heightM]);

  const commitCm = (v: string) => {
    setCm(v);
    const n = Number(v);
    const m = Number.isFinite(n) && n >= 50 && n <= 260 ? n / 100 : null;
    onChange({ heightM: m });
    if (m) {
      const fi = cmToFtIn(m * 100);
      setFt(String(fi.ft));
      setInch(String(fi.inch));
    }
  };
  const commitFtIn = (fv: string, iv: string) => {
    setFt(fv);
    setInch(iv);
    const f = Number(fv || 0);
    const i = Number(iv || 0);
    const totalIn = f * 12 + i;
    const m = Number.isFinite(totalIn) && totalIn >= 20 && totalIn <= 102 ? totalIn * IN_TO_M : null;
    onChange({ heightM: m });
    if (m) setCm(String(Math.round(m * 1000) / 10));
  };

  const pointRow = (key: 'head' | 'feet' | 'center', title: string, hint: string) => {
    const set = !!cal[key];
    const active = tool === key;
    return (
      <div className={`point-row ${active ? 'active' : ''}`}>
        <span className="swatch" style={{ background: colors[key] }} aria-hidden="true" />
        <div className="point-text">
          <span className="point-title">{title}</span>
          <span className="point-hint">{active ? 'Click on the frame…' : set ? 'Placed' : hint}</span>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${active ? 'btn-primary' : set ? 'btn-ghost' : 'btn-outline'}`}
          aria-pressed={active}
          onClick={() => {
            if (active) onTool(null);
            else {
              if (currentFrame !== cal.frameIndex) onGoToFrame(cal.frameIndex);
              onTool(key);
            }
          }}
        >
          {active ? 'Cancel' : set ? 'Re-click' : 'Click'}
        </button>
      </div>
    );
  };

  const complete = !!(cal.heightM && cal.head && cal.feet && cal.center);

  return (
    <section className="card" aria-labelledby="cal-h">
      <header className="card-head">
        <span className={`step-num ${complete ? 'done' : ''}`}>2</span>
        <h3 id="cal-h">Calibration</h3>
        <button type="button" className="text-btn" onClick={onReset} title="Clear calibration">
          Reset
        </button>
      </header>

      {restoredNotice && (
        <p className="hint hint-info">Restored from your last session. Re-click the points if the camera moved.</p>
      )}

      <div className="field">
        <div className="label-row">
          <label htmlFor={cal.heightUnit === 'cm' ? 'h-cm' : 'h-ft'}>Your height</label>
          <div className="seg" role="group" aria-label="Height unit">
            <button type="button" aria-pressed={cal.heightUnit === 'cm'} onClick={() => onChange({ heightUnit: 'cm' })}>
              cm
            </button>
            <button type="button" aria-pressed={cal.heightUnit === 'in'} onClick={() => onChange({ heightUnit: 'in' })}>
              ft/in
            </button>
          </div>
        </div>
        {cal.heightUnit === 'cm' ? (
          <div className="input-suffix">
            <input id="h-cm" type="number" inputMode="decimal" min={50} max={260} step={0.5} placeholder="180" value={cm} onChange={(e) => commitCm(e.target.value)} />
            <span>cm</span>
          </div>
        ) : (
          <div className="row">
            <div className="input-suffix">
              <input id="h-ft" type="number" inputMode="numeric" min={1} max={8} step={1} placeholder="5" value={ft} onChange={(e) => commitFtIn(e.target.value, inch)} />
              <span>ft</span>
            </div>
            <div className="input-suffix">
              <input type="number" inputMode="decimal" aria-label="inches" min={0} max={11.9} step={0.5} placeholder="11" value={inch} onChange={(e) => commitFtIn(ft, e.target.value)} />
              <span>in</span>
            </div>
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="club">Club</label>
        <div className="row">
          <select id="club" value={cal.clubId} onChange={(e) => onChange({ clubId: e.target.value })}>
            {CLUBS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === 'custom' ? c.label : `${c.label} — ${c.lengthIn}"`}
              </option>
            ))}
          </select>
          {cal.clubId === 'custom' && (
            <div className="input-suffix narrow">
              <input
                type="number"
                aria-label="Custom club length in inches"
                min={20}
                max={52}
                step={0.25}
                value={cal.customClubIn}
                onChange={(e) => onChange({ customClubIn: Number(e.target.value) || 0 })}
              />
              <span>in</span>
            </div>
          )}
        </div>
      </div>

      <div className="field">
        <div className="label-row">
          <span className="label">Handedness</span>
          <div className="seg" role="group" aria-label="Handedness">
            <button type="button" aria-pressed={cal.handedness === 'right'} onClick={() => onChange({ handedness: 'right' })}>
              Right
            </button>
            <button type="button" aria-pressed={cal.handedness === 'left'} onClick={() => onChange({ handedness: 'left' })}>
              Left
            </button>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={cal.mirrored} onChange={(e) => onChange({ mirrored: e.target.checked })} />
          Video is mirrored (selfie camera)
        </label>
      </div>

      <div className="field">
        <div className="label-row">
          <span className="label">
            Calibration frame <span className="mono">#{cal.frameIndex}</span>
          </span>
          <div className="row tight">
            {currentFrame !== cal.frameIndex && (
              <>
                <button type="button" className="text-btn" onClick={() => onGoToFrame(cal.frameIndex)}>
                  Go to
                </button>
                <button type="button" className="text-btn" onClick={() => onChange({ frameIndex: currentFrame })}>
                  Use #{currentFrame}
                </button>
              </>
            )}
          </div>
        </div>
        <p className="hint">Pick a frame where you stand tall and still — address posture shortens your apparent height a little.</p>
        <div className="points">
          {pointRow('head', 'Top of head', 'Highest point of your head')}
          {pointRow('feet', 'Bottom of feet', 'Where your shoes meet the ground')}
          {pointRow('center', 'Swing center', 'Upper chest / sternum')}
        </div>
        <p className="scale-readout">
          Scale: {pxPerM ? <strong className="mono">{pxPerM.toFixed(0)} px/m</strong> : <span className="muted">needs height + head + feet</span>}
        </p>
      </div>
    </section>
  );
}
