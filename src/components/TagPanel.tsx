import type { Tags, Tool } from '../lib/types.ts';

interface Props {
  tags: Tags;
  tool: Tool | null;
  onTool: (t: Tool | null) => void;
  currentFrame: number;
  timeOf: (f: number) => number;
  onSetAddress: () => void;
  onClear: (k: keyof Tags) => void;
  onGoToFrame: (f: number) => void;
  colors: Record<'address' | 'top' | 'impact', string>;
}

export function TagPanel({ tags, tool, onTool, currentFrame, timeOf, onSetAddress, onClear, onGoToFrame, colors }: Props) {
  const done = tags.address !== null && !!tags.top && !!tags.impact;

  const row = (key: keyof Tags, n: number, title: string, hint: string, frame: number | null, kind: 'frame' | 'point') => {
    const active = kind === 'point' && tool === key;
    return (
      <div className={`tag-row ${active ? 'active' : ''}`}>
        <span className="tag-badge" style={{ ['--c' as string]: colors[key] }}>
          {n}
        </span>
        <div className="point-text">
          <span className="point-title">{title}</span>
          <span className="point-hint">
            {active ? (
              'Step to the frame, then click the clubhead'
            ) : frame !== null ? (
              <>
                <button type="button" className="link" onClick={() => onGoToFrame(frame)} title="Go to this frame">
                  #{frame}
                </button>{' '}
                · {timeOf(frame).toFixed(3)} s
              </>
            ) : (
              hint
            )}
          </span>
        </div>
        <div className="row tight">
          {frame !== null && !active && (
            <button type="button" className="icon-btn sm" onClick={() => onClear(key)} title={`Clear ${title}`} aria-label={`Clear ${title}`}>
              ×
            </button>
          )}
          {kind === 'frame' ? (
            <button type="button" className={`btn btn-sm ${frame === null ? 'btn-outline' : 'btn-ghost'}`} onClick={onSetAddress} title="Shortcut: A">
              {frame === currentFrame ? 'Set ✓' : `Set #${currentFrame}`}
            </button>
          ) : (
            <button
              type="button"
              className={`btn btn-sm ${active ? 'btn-primary' : frame === null ? 'btn-outline' : 'btn-ghost'}`}
              aria-pressed={active}
              onClick={() => onTool(active ? null : (key as Tool))}
              title={key === 'top' ? 'Shortcut: T' : 'Shortcut: I'}
            >
              {active ? 'Cancel' : frame === null ? 'Tag' : 'Re-tag'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="card" aria-labelledby="tags-h">
      <header className="card-head">
        <span className={`step-num ${done ? 'done' : ''}`}>3</span>
        <h3 id="tags-h">Tag the swing</h3>
      </header>
      <div className="points">
        {row('address', 1, 'Address', 'Frame where the takeaway starts', tags.address, 'frame')}
        {row('top', 2, 'Top of backswing', 'Frame + clubhead click', tags.top?.frame ?? null, 'point')}
        {row('impact', 3, 'Impact', 'Frame + clubhead click (zoom in!)', tags.impact?.frame ?? null, 'point')}
      </div>
      <p className="hint">
        <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>Shift</kbd> ×10 · <kbd>A</kbd> address · <kbd>T</kbd> top · <kbd>I</kbd> impact · <kbd>+</kbd>/
        <kbd>−</kbd> zoom · <kbd>0</kbd> fit · <kbd>Esc</kbd> cancel. The impact clubhead is usually a blur — click the middle of the
        blur where it meets the ball.
      </p>
    </section>
  );
}
