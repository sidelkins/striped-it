# SwingSpeed MVP (striped-it)

Golf swing analysis from video. Upload a face-on swing video, tag three frames, and SwingSpeed estimates your **tempo** and your **average downswing club speed**.

Everything runs in your browser. **Your video never leaves your device.** There is no backend and nothing gets uploaded.

> **What the number means:** this is the *average* speed of the clubhead over the whole downswing (arc length ÷ downswing time). It is typically 35–45% of impact clubhead speed, and you can't compare it with launch monitor readings. Impact speed is roughly 2.2–2.8× higher and can't be recovered from timing alone.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Requires Node ≥ 22.18. Use a recent Chrome, Edge or Safari for frame-accurate decoding via WebCodecs.

## How to use it

1. **Upload.** Use the file picker or drag and drop a video. The app reads the real frame rate from the actual frame timestamps (not the nominal header value), plus the exact frame count, duration, resolution and rotation. Clips under 60 fps show an accuracy warning.
2. **Calibrate.** Enter your height (cm or ft/in), club and handedness. On the calibration frame (frame 0 by default), click the top of your head, the bottom of your feet and your swing center (sternum). Calibration is saved in `localStorage`.
3. **Tag.** Step through the frames and tag:
   - **Address** (`A`): frame only
   - **Top of backswing** (`T`): frame plus a click on the clubhead
   - **Impact** (`I`): frame plus a click on the clubhead. Zoom in, and click the middle of the blur.
4. **Read the results.** You get backswing and downswing time, tempo ratio (benchmark ~3:1), arc radius, arc angle, arc length and average downswing speed (mph or km/h). A rough impact estimate can be turned on; it comes with a ±20% band and a disclaimer.

Each result can be exported as JSON or CSV, or saved locally to compare two swings side by side.

**Controls:** `←`/`→` step one frame · `Shift` steps 10 · `Home`/`End` · scroll or pinch to zoom · drag to pan · `+`/`−`/`0` zoom and fit · `Esc` cancels a click tool.

### Filming tips

- **Camera position:** face-on (camera facing your chest), square to the target line, at about hip height, on a tripod.
- **Framing:** your whole body and the full club should be in frame at the top of the backswing.
- **Frame rate and light:** use slow-mo (120 or 240 fps) in good light.
- **Getting the file off the phone:** prefer the original file (AirDrop with "All Photos Data", or a cable). Messaging apps re-encode slow-mo at 30 fps with the slowdown baked in. If that's what you have, set **Real capture frame rate** in the Video panel to the rate the clip was actually shot at (e.g. 240).

## The math

| Quantity | Formula |
| --- | --- |
| Backswing time | t(top) − t(address) |
| Downswing time | t(impact) − t(top) |
| Tempo | backswing ÷ downswing |
| Scale | ‖head − feet‖ px ÷ height m |
| Arc radius | mean(‖center − top clubhead‖, ‖center − impact clubhead‖) ÷ scale |
| Arc angle | angle swept at the center from top to impact, in the downswing direction for your handedness (reflex angle, usually 180–270°) |
| Arc length | radius × angle (rad) |
| Average downswing speed | arc length ÷ downswing time |

**How times are measured:** `t(·)` is the frame's exact presentation timestamp. For constant-frame-rate video that is the same as frame count ÷ FPS, and it stays correct for variable-frame-rate phone video. If you set a manual capture rate, times are frame count ÷ that rate.

**Sanity warnings:** the app warns you when:
- tags are out of order
- the radius falls outside 0.8–2.2 m
- the downswing time falls outside 0.15–0.6 s
- the arc angle looks unusual
- the top and impact radii disagree

## Build and self-host

```bash
npm run build        # type-checks, then outputs a static site to dist/
```

`dist/` is a plain static site, so you can host it anywhere: Netlify, Cloudflare Pages, GitHub Pages, S3, or nginx. No server-side logic is needed.

To use the included minimal [Hono](https://hono.dev) server instead (the same file runs on both runtimes):

```bash
node server.ts       # Node ≥ 22.18 runs TypeScript natively
bun server.ts        # or Bun
# PORT=3000 HOST=127.0.0.1 node server.ts
```

The server only serves `dist/`, with an SPA fallback, long-lived caching for hashed `/assets/*` files, and a `/healthz` endpoint. Video data never reaches it.

**HTTPS matters:** browsers only expose WebCodecs in a secure context (`https://` or `localhost`). If you serve over plain HTTP on a LAN IP, the app still works, but it falls back to `<video>`-element seeking with a reduced-accuracy warning. Put the server behind a TLS proxy (Caddy, nginx, a Cloudflare tunnel) for production use.

## How decoding works

- **Demuxing:** [mediabunny](https://mediabunny.dev) demuxes MP4, MOV, WebM, MKV and TS files. It reads every frame's timestamp from the packet metadata alone, without decoding.
- **Decoding:** frames are decoded with WebCodecs through mediabunny's `CanvasSink`, which applies rotation metadata, so vertical phone videos display upright. A small window of neighbouring frames is decoded and cached, so frame stepping is instant.
- **Fallback:** if WebCodecs is missing or can't decode the codec (e.g. HEVC in some browsers), the app seeks a hidden `<video>` element to the middle of each frame. It still uses the demuxed timestamps for timing when they're available, and shows a reduced-accuracy warning.

## Project layout

```
src/
  App.tsx                 state, tagging workflow, overlays, keyboard
  lib/video.ts            mediabunny demux + WebCodecs source + <video> fallback
  lib/physics.ts          all calculations and sanity checks (pure functions)
  lib/storage.ts          localStorage (calibration, preferences, saved swings)
  lib/export.ts           JSON / CSV export
  components/             FrameStage (canvas, zoom/pan), Timeline, panels
server.ts                 optional Hono static server (Node + Bun)
```

## Out of scope

The MVP deliberately does not include:
- accounts
- server-side upload or storage
- automatic clubhead or pose detection
- audio-based impact detection
- any claim of launch-monitor accuracy
