# Neon Grid — technique map

An 11 s boot sequence of a holographic terminal, built with this package
alone. This page maps each effect to the technique that draws it. Everything
lives in `main.js`; the page boots the aggregate, calls `run()` and drives
the handle it returns.

## Time is the only input

- **One `Timeline` plays the boot.** Every timed change is a
  `tl.add({ target, property, from, to, duration, easing }, atMs)` or a
  `tl.stagger(items, { each, from, at })`, at an absolute offset in the 11 s.
- **Everything that keeps moving is `render(t)`**, a pure function of the
  scene time: rings, radar, equalizer, oscilloscope, particles and their
  trails, the floor rows, fog, antennas, twinkling windows, the impact burst,
  the sliding gradient, the idle events. It is the LAST child of the boot
  timeline, a numeric tween whose custom `apply` writer calls `render`, so it
  reads what the other children wrote in the same frame. After the boot, a
  second timeline keeps feeding `render` the time.
- **So the scene can be scrubbed, slowed down and paused**:
  `Timeline#seek`, `timeScale`, `pause`/`resume`. The same time always
  leaves the same DOM: `tests/neon-boot.integration.test.js` seeks back and
  forth and compares; the review harness compared live play and `seek` at 15
  times in Chromium (identical DOM).
- **Randomness is drawn once.** A seeded generator (a 32-bit linear
  congruential generator) lays out the city, the particles and the burst at
  build time; what flickers per frame is a stateless hash of (index, time
  slot). `Math.random` is blocked by fw's sanity lockdown in any case.
- **Every track starts at its initial value**, so `seek` can show any time:
  a step is a 1 ms `step-end` child from the previous value; a flash is a
  step up, then a tween down.

## Acts

| Act (ms) | Effect | Technique |
|---|---|---|
| neon (0–1 600) | the horizon tube misfires, then draws from the centre out | held `opacity` steps (`step-end`); `x1`/`x2` tweens from the vanishing point, `easeOutExpo` |
| | a neon tube | two lines: a coloured blurred glow under a light core; `render` breathes the glow's opacity (the blur radius never changes) |
| | the floor rays fan open | `tl.stagger(rays, { each: 24, from: 'center' })` on each ray's `x2`, `cubic-bezier(0.2, 0, 0, 1)` |
| | the floor rows | `render`: rows at a true perspective, `y = horizon + k / depth`, the depth running toward the viewer |
| city (1 600–4 200) | a far silhouette, then the skyline rises from the centre out (a stepped building carries a tower above its shoulders, so its windows stay inside) | `transform` tweens; `stagger { from: 'center' }` with an overshoot curve, `cubic-bezier(0.22, 1.25, 0.36, 1)`; a `clipPath` hides what is below the horizon |
| | windows cascade up each facade | each building's windows are four paths (dark, cyan, magenta, acid) under a `clipPath` whose rectangle's `y` and `height` tween: 22 tweens instead of one per window |
| | two glitches on the main building | held `transform` steps |
| hud (4 200–6 900) | rings draw, then turn | `stroke-dashoffset` tweens; `render` rotates each ring |
| | four widgets build in three beats, clockwise | brackets (`opacity`, `translate(0,0) scale(1.18)` → `scale(1)`), plate and frame (`stroke-dashoffset`), body (`translate(0,8) scale(0.94)` → `translate(0,0) scale(1)`): `graphic.interpolate` interpolates the lists function by function |
| | the counter decodes the scene's own node count | a 0 → 1 tween with a custom `apply` writer: scrambled digits (a hash of the progress) lock left to right |
| | a terrain hologram in the radar | `graphic.svg3d` (a 12 × 12 height grid, path mode, 6 buckets) whose `seek(t)` `render` calls; its parent's `stroke` and `fill-opacity` make the wireframe |
| | scan lines reveal data | two `x` tweens; `render` lights the labels near a line |
| logo (6 900–9 500) | a swarm converges, then a dot grid, a wireframe, the letters | one path of 50 quads (10 glyphs × 5 bars); the five states share that structure, so `d` tweens morph point by point; holds on the grid and on the wireframe |
| | the wireframe | each bar thinned along its own long axis (the diagonals too) |
| | the impact, after the morph | one flash at 0.45 for 140 ms, a ring pulse (`scale` 1 → 1.05 → 1), the burst: `render`, `r · (b/τ) · e^(1 − b/τ)` out and back |
| | the gradient fill | a `linearGradient` (cyan → violet → magenta, `reflect`) written once through a custom `apply`; `render` slides `x1`/`x2` |
| scan (9 500–11 000) | the scan line wakes the scene | a group (line + gradient band) and the dim veil's `y` tween together |
| | the last flicker | the horizon tube alone |
| idle (11 000 →) | a calm scene, one event every 7 s | `render`: a glitch, a scan sweep or a ring pulse, by turn |

## The page

- Captions are a held track of the boot timeline (one 1 ms `step-end` child
  per act, its `apply` calling the page), so a seek always shows the caption
  of its time.
- "How it's built" fetches `main.js` and shows the block between the
  `// @act <id>` and `// @end <id>` markers of the act on screen.
- `prefers-reduced-motion: reduce` shows the final frame, paused.
- Full screen: the stage and its caption, from the button, a double-click on
  the scene, or the exit button inside it (Esc too).
- The proof points are measured on the page: the node count from the DOM,
  the minified size from `dist/build/*.meta.json`.

## Measured

- 349 SVG elements; nothing is created per frame.
- Frame cost on the real page (lockdown on, Chromium, CDP
  `Performance.getMetrics` over 5 s, two runs on a loaded workstation):
  1.9 to 2.8 ms of task per frame in acts 3 and 4, 2.0 to 2.1 ms in the
  idle.

## Origin

An original scene in the cyberpunk genre: the name, the logo and the look
are this demo's own.
