---
module: guide/frames
category: guide
status: complete
---

# Frames — the frame-sequence primitive

> Step a fixed set of SVG elements, or a sprite-sheet viewBox window, at a
> fixed frame rate — on the same shared scheduler as tweens and timelines.

## What it is

`graphic.frames` is a reference-bound frame-sequence player: a `Frames`
instance is a tickable registered on the shared `graphic.scheduler` singleton
exactly like `graphic.tween`. It supports two mutually exclusive modes —
**discrete** (an array of pre-built frame elements, shown/hidden via
`display`) and **sprite** (one element's `viewBox` stepped across a grid). It
is distinct from `graphic.pageflip` (the page-turn book): `frames` steps a
fixed frame set, it does not turn pages or cross-fade.

## Core concepts

1. **Pure timing, DOM writer** — the displayed frame index is a pure,
   DOM-free function of elapsed time (`floor(elapsed * fps / 1000)` mapped
   through loop/ping-pong); only the `apply` writer touches the DOM, and it
   runs **only when the index changes**.
2. **Two mutually exclusive modes** — `frames: [...]` (discrete) XOR
   `sprite: { target, cols, rows, frameW, frameH }`; passing both, or
   neither, throws.
3. **Reference-bound, shared scheduler** — frame elements / the sprite target
   are captured once at construction (no per-tick DOM lookup); `Frames`
   shares the SAME rAF loop as every tween/timeline/scene in the document.

## Example

```js
// Runnable against a DOM: an 8fps discrete cycle over four layers, and a
// 4x2 ping-pong sprite sheet that plays once and stops.
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { framesModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(framesModule);  // pulls scheduler, svgApply, fw dom/secPolicy
const { Frames } = runtime.resolve('graphic.frames');
const { SVG_NS } = runtime.resolve('graphic.svgApply');

// Discrete: cycle four <g> layers.
const layers = [g0, g1, g2, g3]; // pre-built SVG elements
new Frames({ frames: layers, fps: 8 }).play();

// Sprite: a 4x2 sheet, ping-pong once (no loop).
const spriteTarget = document.createElementNS(SVG_NS, 'svg');
new Frames({
    sprite: { target: spriteTarget, cols: 4, rows: 2, frameW: 32, frameH: 32 },
    fps: 12, loop: false, pingPong: true,
    onComplete: () => console.log('sprite run done'),
}).play();
```

## Run the demo

`../../demos/frames/index.html` (append `?variant=fw` for the fw-registered
build).

## Reference

| Page | Covers |
|---|---|
| [`frames/frames`](../api/frames/frames.md) | The `graphic.frames` descriptor, both modes, options, errors |
| [`anim/scheduler`](../api/anim/scheduler.md) | The shared rAF loop `Frames` registers on |
| [`svg/apply`](../api/svg/apply.md) | The default `display`/`viewBox` writer (`svgAttr` → fw `dom.attr`, unsanitized) |
| [engine](./engine.md) | The tween/timeline/scheduler story frames shares its scheduler with |

## Notes

- **Worker-safe: partial** — the frame-index/timing layer is pure and
  Worker-safe; the default writer is DOM-bound (main-thread only).
- Errors are strict on shape but lenient on range: no throw on `fps <= 0`
  (coerced to a positive minimum) or an out-of-range `seek` (clamped), but
  `Frames` throws if neither, or both, of `frames`/`sprite` are given, or if
  `frames` is an empty array.

## See also

- [engine](./engine.md) — the tween/timeline/scheduler engine frames shares its scheduler with
- [scene](./scene.md) — a sibling declarative primitive built on the same engine
