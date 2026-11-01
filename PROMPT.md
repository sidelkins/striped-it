# Task: Build "SwingSpeed MVP" — a client-side golf swing speed estimator

Build a complete, working single-page web app that estimates a golfer's
**average downswing club speed** and tempo metrics from an uploaded swing
video using manual frame tagging. ALL processing happens client-side — the
video must never leave the user's browser.

## Tech stack

- Vite + React + TypeScript
- `mediabunny` (npm) for MP4/MOV demuxing: extract REAL FPS (not nominal),
  exact frame count, duration, and rotation metadata, plus frame-accurate
  seeking via WebCodecs. Gracefully fall back to HTML5 `&lt;video&gt;` currentTime
  stepping (with a reduced-accuracy warning) if WebCodecs is unavailable.
- Canvas overlay on the decoded frame for click-tagging, with zoom + pan
  for precision clicking.
- No backend video processing. `npm run build` outputs a static site.
  Include an optional minimal `server.ts` (Hono) that serves `dist/` and
  runs on both Node and Bun, for self-hosting.
- Minimal dependencies. Clean, polished dark UI (Tailwind or hand-rolled
  CSS, your choice). Mobile-responsive but desktop-first.

## Why manual tagging (context)

Automatic clubhead tracking is out of scope for this MVP. The user manually
steps to key frames and clicks the clubhead. The physics: we compute the
AVERAGE clubhead speed over the downswing arc (arc length ÷ time), NOT
impact clubhead speed. This is intentional — never label the output as
"clubhead speed." Impact speed is roughly 2.2–2.8× the downswing average
and cannot be recovered from timing alone.

## User flow

### 1. Upload
- File picker + drag-and-drop, accept `video/*`.
- On load, display: real FPS, frame count, duration, resolution.
- If FPS &lt; 60, show a warning banner: "Standard frame rate detected —
  expect ±15–20% error. 120/240 fps slow-motion video is recommended."
- Correctly handle rotated/vertical phone videos (apply rotation metadata).

### 2. Calibration
- Inputs: user height (cm/in toggle), club used (dropdown: Driver 45.5",
  3-wood 43", Hybrid 40", 5-iron 38", 7-iron 37", 9-iron 36",
  Wedge 35.5", or custom length), handedness (right/left).
- On a calibration frame (default: first frame), the user clicks:
  a) top of their head, b) bottom of their feet → derive px-per-meter scale.
  c) their swing center (upper chest/sternum).
- Persist calibration to localStorage.

### 3. Tagging (3 tags)
Each tag = a specific frame + (for top and impact) a clicked clubhead
position on the canvas overlay:
1. **Address** (start of takeaway) — frame only.
2. **Top of backswing** — frame + clubhead click.
3. **Impact** — frame + clubhead click (best estimate; the clubhead will be
   motion-blurred, so zoom is essential).

Frame navigation: prev/next frame buttons, left/right arrow keys, and a
timeline scrubber showing current frame index + timestamp. Show tag markers
on the timeline. Allow re-tagging any point.

### 4. Results panel
Compute and display:
- **Backswing time** = (top frame − address frame) ÷ FPS
- **Downswing time** = (impact frame − top frame) ÷ FPS
- **Tempo ratio** = backswing ÷ downswing (show benchmark: ~3:1)
- **Arc radius** = mean of distances (swing center → top clubhead) and
  (swing center → impact clubhead), converted to meters via the
  calibration scale
- **Arc angle** = angle subtended at the swing center between the two
  clubhead positions. Use handedness to pick the correct (reflex vs.
  non-reflex) angle — the downswing arc is typically 180–270°.
- **Arc length** = radius × angle (radians)
- **Average downswing speed** = arc length ÷ downswing time, shown in
  mph or km/h (toggle).
- MANDATORY label: "Average downswing speed — this is an average across
  the whole downswing, typically 35–45% of impact clubhead speed. Not
  comparable to launch monitor readings."
- Optional toggle: "Rough impact speed estimate" = average ÷ 0.4 with a
  ±20% error band and a strong disclaimer.

### Sanity checks (show friendly warnings)
- Impact frame must be after top frame; top after address.
- Measured radius should be within 0.8–2.2 m; if not, warn that
  calibration clicks may be off.
- Downswing time outside 0.15–0.6 s → warn about mis-tagged frames.

## Nice-to-haves (only if trivial)
- Export session as CSV/JSON.
- Compare two swings side by side.

## Explicitly out of scope
Accounts, server-side upload/storage, automatic clubhead or pose detection,
audio-based impact detection, any claim of launch-monitor accuracy.

## Acceptance criteria
- `npm install && npm run dev` works out of the box.
- `npm run build` produces a static `dist/`; `bun server.ts` or
  `node server.ts` serves it.
- Full flow (upload → calibrate → tag 3 points → results) works with a
  240 fps iPhone slow-mo clip AND a 30 fps clip (with warnings).
- README: local dev, build, and self-hosting instructions (static host or
  the included server).

Generate the complete project. Do not leave TODOs or stub functions.