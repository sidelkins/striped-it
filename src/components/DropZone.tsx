import { useRef } from 'react';

interface Props {
  onFile: (f: File) => void;
  busy: string | null;
  error: string | null;
}

export function DropZone({ onFile, busy, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="dropzone">
      <div className="dropzone-inner">
        <svg className="dropzone-icon" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M12 48 A24 24 0 0 1 48 14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="48" cy="14" r="5" fill="currentColor" />
          <circle cx="32" cy="40" r="3.5" fill="var(--amber)" />
        </svg>
        <h2>Drop a swing video</h2>
        <p className="muted">
          MP4 or MOV, filmed <strong>face-on</strong> with the camera still. 120/240 fps slow-motion gives the best results.
        </p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => inputRef.current?.click()} disabled={!!busy}>
          {busy ? busy : 'Choose video…'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mov,.mp4,.m4v,.webm,.mkv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}
        <p className="privacy">
          <span className="lock" aria-hidden="true">
            ●
          </span>{' '}
          Processed entirely in your browser — the video never leaves your device.
        </p>
      </div>
    </div>
  );
}
