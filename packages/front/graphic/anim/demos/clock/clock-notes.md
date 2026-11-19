# `clock` demo — acceptance record

Reproduces the legacy `packages/front/@anim-old/exemples et codes/clock.js`
analog clock (an `obj_clock` JSON-ish spec + `ajs.parse`/`ajs.getInfo`/
`ajs.setInfo`/`setInterval`) using **only** the modern `graphic.anim`
aggregate surface. No legacy JS is ported — the legacy file is a visual/
behavioral reference only, read once to extract the construct map below.

Acceptance claim: **capability bar met** (structure, dial visuals, three
independently rotating hands driven at true clock rates, starting from the
real current time). Not a pixel-perfect literal port — see "Honest gaps".

## Legacy construct → modern surface

| Legacy (`clock.js`) | Modern surface used | Notes |
|---|---|---|
| `var obj_clock = { svg: { x,y,width,height,viewbox,defs,children } }` | `main.js`'s `TEMPLATE` (a `graphic.svgBuild` `NodeDesc`) passed as `SceneSpec.template` to `graphic.scene.createScene` | Same shape: masks under `defs`, one visible `<g>`. The outer `<svg viewBox>` itself is the demo page's pre-existing `#mount` element (`index.html`), not something `run()` builds — `run()` only ever appends INTO the caller-supplied `mount`, per the frozen demo-entry contract. |
| `{ mask: { id: "aMaskClock", children: [...] } }` / `aMaskBackground` | `TEMPLATE.children[0]` (`defs` → two `mask` NodeDescs), ids scoped via `graphic.scopedIds` (through `graphic.scene`/`graphic.svgBuild` internally) | Collision-free vs. the legacy's un-scoped raw ids — a second clock instance in the same document gets disjoint mask/`dataId` ids automatically. |
| `dataId: "aBackground"` / `"aClockBorder"` / `"aClockBackground"` / `"aClockEffect"` | `TEMPLATE`'s `attrs.id` on the matching `rect`/`circle` nodes | `dataId` legacy concept ↔ plain SVG `id`, scoped the same way as the mask ids. |
| `dataId: "aTimeHours"` / `"aTimeMinutes"` / `"aTimeSeconds"` (the three `<line>`s) | `SceneSpec.refs: { hours, minutes, seconds }`, resolved once via `scene.el(name)` | Mirrors `ajs.getInfo(id, ['x1','y1'])` in legacy — a one-time DOM lookup, never repeated per tick. |
| `ajs.parse(obj_clock, true)` + `document.getElementById('test').appendChild(aSVG)` | `sceneMod.createScene(spec)` (internally: `graphic.svgBuild.build` + `graphic.scopedIds`) + `mount.appendChild(scene.root)` | |
| `objDate = { s: ajs.getInfo(...), m: ..., h: ... }` (bind-once) | `hands = { seconds: scene.el('seconds'), ... }` (bind-once) | Same "bind by reference once" discipline the legacy code already used for this part. |
| `function setTime() { ...; ajs.setInfo(id, {transform: "rotate(deg, x1, y1)"}) }` | Each hand's `Tween`'s custom `apply` callback: `svgApply.svgAttr(target, 'transform', \`rotate(${angle}, ${PIVOT_X}, ${PIVOT_Y})\`)` | See "Honest gaps" below for why this is a **custom** `apply` writer rather than animating the `transform` attribute through the tween's default/built-in string interpolator. |
| `setInterval(function () { setTime(); }, 1000)` (discrete per-second recompute) | One `graphic.tween.Tween` per hand, `easing: 'linear'`, `duration` = the hand's exact real-time full-sweep period (60 000 ms / 3 600 000 ms / 43 200 000 ms), restarted from its own `onComplete` | Continuous, `graphic.scheduler`-driven animation instead of a 1 Hz timer — see "Honest gaps" (this is an intentional improvement, not a literal port). |
| `hours >= 12 ? hours -= 12 : hours` + `s/m/h` degree formulas (`parseInt(...)`) | `currentAngles(now)` in `main.js` — same formulas, kept in floating point (no `parseInt` truncation) | |

## Honest gaps (capability bar met, not pixel-perfect)

1. **Discrete vs. continuous update.** Legacy repaints once per second
   (`setInterval(..., 1000)`), so its second hand visibly jumps in 6°
   increments. This reproduction animates every scheduler frame instead, so
   all three hands sweep continuously and smoothly. This is a deliberate
   improvement matching the plan's "true clock rates (second hand 6°/s
   etc.)" requirement — a *rate* only makes literal sense as a continuous
   motion — not a legacy port.
2. **`graphic.interpolate`'s transform parser ignores the `rotate(deg, cx,
   cy)` pivot.** Confirmed live in
   `packages/front/graphic/anim/src/interpolate/index.js` (`parseTransform`'s
   own doc comment: *"`rotate(deg)` — rotation about the origin (extra
   `cx,cy` ignored)"*). Animating the `transform` attribute's STRING value
   directly through a `Tween`'s default writer would therefore silently
   rotate each hand about the SVG origin `(0,0)` instead of the clock center
   `(400,400)`. Workaround used here: each hand's `Tween` interpolates a
   plain NUMBER (`0` → `360`, kind `'number'`, unaffected by the transform
   parser) and a custom `apply` callback computes the correctly pivoted
   `rotate(angle, 400, 400)` string itself, writing it via
   `graphic.svgApply.svgAttr`. This is a real, pre-existing surface
   limitation, not something introduced or "fixed" by this demo — it is
   called out here as read/verified, per the task's honesty requirement.
3. **No built-in infinite-repeat/loop on `graphic.tween`/`graphic.timeline`.**
   Verified live: a `Tween`/`Timeline` completes once its progress reaches
   `1` and unregisters itself from the scheduler (`tween.js`'s `_step`,
   `timeline.js`'s `_step`); `graphic.scene`'s `EventSpec.loop` only re-fires
   a whole *compiled* event (no per-animation custom `apply` hook, needed for
   gap 2 above), so it could not be used as-is either. Each hand's tween
   therefore restarts itself from its own `onComplete`, using the SAME
   static `from: 0` / `to: 360` values every cycle. Because each hand's
   `duration` is an EXACT real clock-cycle length (60 s / 1 h / 12 h), the
   restarted sweep reproduces the true current wall-clock angle every time,
   with no accumulating phase drift beyond ordinary `requestAnimationFrame`
   jitter — this composition IS the plan's "drive rotation from the
   scheduler tick" fallback, built from the frozen `Tween` class rather than
   a raw hand-rolled scheduler tickable.
4. **No `parseInt` degree truncation.** Legacy truncates the computed degree
   to an integer before writing it; this reproduction keeps full floating-
   point precision (consistent with gap 1's continuous motion — an integer
   snap would look like micro-stutter at 60fps). Purely cosmetic, listed for
   completeness.

## Worker-safety / dispose

Not Worker-safe (DOM-bound, like `graphic.scene`/`graphic.tween` themselves).
`dispose()` sets an internal `disposed` flag (stops any further
`onComplete`-driven restart) AND explicitly calls
`graphic.scheduler.scheduler.remove(tw)` on every still-active hand tween —
merely marking a tween "done" externally would leave it registered in the
scheduler's active `Set` forever (only a tween's own natural completion
calls `remove`), leaking an orphan entry and keeping the shared
`requestAnimationFrame` loop alive. `dispose()` also detaches the built
scene root from `mount`.
