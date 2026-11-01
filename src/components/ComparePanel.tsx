import { useEffect, useState } from 'react';
import { speedIn, speedUnitLabel } from '../lib/physics.ts';
import type { SavedSwing } from '../lib/storage.ts';
import type { SpeedUnit } from '../lib/types.ts';

interface Props {
  saved: SavedSwing[];
  unit: SpeedUnit;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
}

type Row = { label: string; get: (s: SavedSwing) => number | null; fmt: (v: number) => string };

export function ComparePanel({ saved, unit, onDelete, onRename }: Props) {
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');

  // Default to the two most recent swings.
  useEffect(() => {
    const ids = saved.map((s) => s.id);
    if (!ids.includes(a)) setA(saved[1]?.id ?? saved[0]?.id ?? '');
    if (!ids.includes(b)) setB(saved[0]?.id ?? '');
  }, [saved, a, b]);

  if (saved.length === 0) return null;

  const A = saved.find((s) => s.id === a) ?? null;
  const B = saved.find((s) => s.id === b) ?? null;
  const u = speedUnitLabel(unit);

  const rows: Row[] = [
    { label: `Avg downswing (${u})`, get: (s) => (s.avgSpeedMps === null ? null : speedIn(s.avgSpeedMps, unit)), fmt: (v) => v.toFixed(1) },
    { label: 'Backswing (s)', get: (s) => s.backswingS, fmt: (v) => v.toFixed(3) },
    { label: 'Downswing (s)', get: (s) => s.downswingS, fmt: (v) => v.toFixed(3) },
    { label: 'Tempo (:1)', get: (s) => s.tempo, fmt: (v) => v.toFixed(2) },
    { label: 'Radius (m)', get: (s) => s.radiusM, fmt: (v) => v.toFixed(2) },
    { label: 'Angle (°)', get: (s) => s.angleDeg, fmt: (v) => v.toFixed(0) },
    { label: 'Arc (m)', get: (s) => s.arcM, fmt: (v) => v.toFixed(2) },
    { label: 'FPS', get: (s) => s.fps, fmt: (v) => v.toFixed(0) },
  ];

  const picker = (value: string, set: (v: string) => void, label: string) => (
    <select value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
      {saved.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );

  return (
    <section className="card" aria-labelledby="cmp-h">
      <header className="card-head">
        <span className="step-num">⇄</span>
        <h3 id="cmp-h">Compare swings</h3>
      </header>
      {saved.length >= 2 && A && B ? (
        <table className="compare">
          <thead>
            <tr>
              <th />
              <th>{picker(a, setA, 'Swing A')}</th>
              <th>{picker(b, setB, 'Swing B')}</th>
              <th className="muted">Δ</th>
            </tr>
          </thead>
          <tbody>
            <tr className="meta">
              <td>Club</td>
              <td>{A.club}</td>
              <td>{B.club}</td>
              <td />
            </tr>
            {rows.map((row) => {
              const va = row.get(A);
              const vb = row.get(B);
              const d = va !== null && vb !== null ? vb - va : null;
              return (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="mono">{va === null ? '—' : row.fmt(va)}</td>
                  <td className="mono">{vb === null ? '—' : row.fmt(vb)}</td>
                  <td className={`mono delta ${d === null || Math.abs(d) < 1e-9 ? '' : d > 0 ? 'up' : 'down'}`}>
                    {d === null ? '' : `${d > 0 ? '+' : ''}${row.fmt(d)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="hint">Save one more swing to compare side by side.</p>
      )}
      <ul className="saved-list">
        {saved.map((s) => (
          <li key={s.id}>
            <input className="saved-label" value={s.label} aria-label="Swing name" onChange={(e) => onRename(s.id, e.target.value)} />
            <span className="muted mono">{s.avgSpeedMps === null ? '—' : `${speedIn(s.avgSpeedMps, unit).toFixed(1)} ${u}`}</span>
            <button type="button" className="icon-btn sm" onClick={() => onDelete(s.id)} aria-label={`Delete ${s.label}`} title="Delete">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
