---
module: frames/frames
category: frames
name: graphic.frames
type: fw.dom.graphic
dependencies: [graphic.scheduler, graphic.svgApply]
returns: "{ Frames, frames }"
worker-safe: partial
status: complete
---

# frames/frames — `graphic.frames`

> Reference-bound frame-sequence primitive — steps discrete SVG frame elements
> or a sprite-sheet viewBox window on the shared scheduler.

**Module** `graphic.frames` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/frames/frames.js` | **Deps** `graphic.scheduler`, `graphic.svgApply` | **Worker-safe** partial (pure frame-index / timing layer is Worker-safe; the writer is DOM)

`graphic.frames` is a frame primitive. It is **distinct from `graphic.pageflip`**
(the page-turn book — a separate module). `frames` steps a fixed frame set at a
fixed `fps`; it does not turn pages or cross-fade.

## Descriptor

`graphic.frames` is one capture-free fw module descriptor. Its factory receives
the two resolved dependencies as parameters and returns `{ Frames, frames }`.
The `Frames` class **and every shared constant/helper** are defined **inside**
the factory so they reference only the injected dependencies — never a
module-scope binding (`fw/no-factory-capture` clean, verified by the
package-local ESLint config over `src/**/*.js`).

```js
export const framesModule = {
    name: 'graphic.frames',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.scheduler', 'graphic.svgApply'],
    deps: [schedulerModule, svgApplyModule],
    factory(scheduler, svgApply) { /* Frames, frames defined here */ return { Frames, frames }; },
};
```

`deps.map(d => d.name) === dependencies` (same order). The factory wires every
capability through its parameters:

| Param | Resolved from | Used for |
|-------|---------------|----------|
| `scheduler` | `graphic.scheduler` → `{ Scheduler, scheduler }` | default registration target = the shared `scheduler.scheduler` singleton (one shared rAF loop) |
| `svgApply` | `graphic.svgApply` → `{ SVG_NS, svgAttr }` | default writers (`display` for discrete, `viewBox` for sprite) route through `svgApply.svgAttr` |

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { framesModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(framesModule);        // pulls scheduler + svgApply + fw dom/secPolicy
const { Frames, frames } = runtime.resolve('graphic.frames');
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `Frames` | `class Frames(opts: FramesOptions)` | Reference-bound frame-sequence animator (tickable). |
| `Frames#play` | `() => this` | Register with the scheduler (starts the shared loop if idle); resets the start time. |
| `Frames#pause` | `() => this` | Unregister from the scheduler; freeze at the current frame. |
| `Frames#seek` | `(index: number) => this` | Jump to `index` (clamped), apply immediately, fire `onFrame`. Does NOT auto-play; never throws. |
| `frames` | `(opts: FramesOptions) => Frames` | Convenience: `new Frames(opts)` — **does NOT auto-play**. |

### State

| Field | Type | Description |
|-------|------|-------------|
| `.frame` | `number` | Currently displayed frame index. |
| `.frameCount` | `number` | Total frames (`frames.length` or `cols * rows`). |
| `.playing` | `boolean` | True while registered on the scheduler. |
| `.done` | `boolean` | True once a non-looping run has completed. |

### `FramesOptions`

| Field | Type | Description |
|-------|------|-------------|
| `frames` | `object[]` | Discrete-mode frame elements, bound BY REFERENCE. Mutually exclusive with `sprite`. |
| `sprite` | `{ target, cols, rows, frameW, frameH }` | Sprite-sheet spec; the single `target` viewBox is stepped. Mutually exclusive with `frames`. |
| `fps` | `number` | Frames per second; default `12`, coerced to a positive minimum. |
| `loop` | `boolean` | Wrap last→first indefinitely; default `true`. |
| `pingPong` | `boolean` | Bounce `0..N-1..1` instead of wrapping; default `false`. |
| `apply` | `(index, api) => void` | Writer override; `api = { frames?, sprite?, svgApply, window(i) }`. |
| `onFrame` | `(index) => void` | Fired whenever the frame changes. |
| `onComplete` | `() => void` | Fired once at the end of a non-looping run. |
| `scheduler` | `Scheduler` | Override the shared scheduler (tests / isolated timelines). |

**Errors**: neither `frames` nor `sprite` → `Error('Frames: frames or sprite is
required')`; empty `frames` → throws; both `frames` and `sprite` → throws.
`fps <= 0` → coerced (no throw); `seek` out of range → clamped (no throw).

## Two modes

- **Discrete** (`frames: [...]`): the default writer shows frame `i`
  (`display="inline"`) and hides the rest (`display="none"`), all via the
  injected `svgApply.svgAttr` over the reference-bound elements.
- **Sprite** (`sprite: { target, cols, rows, frameW, frameH }`): the default
  writer retargets the single element's `viewBox` to the row-major window of
  frame `i` — `svgApply.svgAttr(target, 'viewBox', "${col*frameW} ${row*frameH}
  ${frameW} ${frameH}")` where `col = i % cols`, `row = floor(i / cols)`.

Override `apply` to drive any custom presentation (e.g. `href` swaps, CSS
classes) — the api object hands you `frames`/`sprite`, `svgApply`, and a pure
`window(i)` helper.

## Examples

```js
const { SVG_NS } = runtime.resolve('graphic.svgApply');

// Discrete: cycle four <g> layers at 8 fps, looping.
const layers = [g0, g1, g2, g3];
new Frames({ frames: layers, fps: 8 }).play();

// Sprite: a 4×2 sheet, ping-pong once (no loop), notify on completion.
const spr = document.createElementNS(SVG_NS, 'svg'); // the windowed element
new Frames({
    sprite: { target: spr, cols: 4, rows: 2, frameW: 32, frameH: 32 },
    fps: 12, loop: false, pingPong: true,
    onFrame: (i) => console.log('frame', i),
    onComplete: () => console.log('done'),
}).play();

// Scrub without playing.
const anim = frames({ frames: layers, fps: 8 });
anim.seek(2);   // shows frame 2, fires onFrame, stays paused
```

## Notes

- **Reference-bound targets**: the frame elements / sprite target are captured
  **once** at construction — the `_step` path performs **no**
  `getElementById`/`querySelector` (the legacy O(n)/frame cost the rewrite
  removes). Only the `apply` writer touches DOM.
- **Shared scheduler**: `Frames` is a *tickable* (`_step(ts)`) registered via
  `scheduler.scheduler.add(this)` / `.remove(this)` exactly like `graphic.tween`.
  It NEVER calls `requestAnimationFrame` directly and NEVER constructs a
  production `Scheduler`; N `Frames` + tweens share ONE rAF loop. `opts.scheduler`
  exists only for tests / isolated timelines.
- **Pure timing / Worker-safe**: the displayed frame index is a pure DOM-free
  function of elapsed time — `frameIndex = floor(elapsed * fps / 1000)` mapped
  through loop/ping-pong. loop off clamps at `frameCount-1`; loop on wraps
  `raw % frameCount`; ping-pong bounces over a period of `2*(frameCount-1)` with
  no duplicated endpoint. The writer runs **only when the index changes**.
- **Non-loop end**: when a non-looping run reaches its last position, `Frames`
  sets `.done`, removes itself from the scheduler, and fires `onComplete` once.
- **Secure-writer routing**: the default writers go through `svgApply.svgAttr` →
  fw `dom.attr`. `dom.attr` writes via raw `setAttribute` and does **not** invoke
  secPolicy sanitization; do not assume frame attribute values are XSS-filtered
  beyond what `setAttribute` enforces.
- **Not Worker-safe as a whole** — the default writer mutates a DOM target — and
  **no Worker by default**.

## See also

- [anim/scheduler](../anim/scheduler.md) — the shared rAF loop driving this animator
- [anim/tween](../anim/tween.md) — the reference-bound single-property tween (same tickable pattern)
- [svg/apply](../svg/apply.md) — the injected `svgApply.svgAttr` writer
