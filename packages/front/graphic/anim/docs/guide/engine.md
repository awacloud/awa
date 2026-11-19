---
module: guide/engine
category: guide
status: complete
---

# Engine — tween · timeline · scheduler

> How `@awacloud/graphic-anim` animates: one shared scheduler ticks reference-bound
> tweens, timelines compose them with computed start offsets.

## What it is

The engine is three cooperating fw module descriptors: `graphic.scheduler`
(the single rAF loop), `graphic.tween` (a reference-bound single-property
animation), and `graphic.timeline` (composes tweens with start offsets —
sequence / parallel / stagger). Every tween and timeline in a document shares
the SAME scheduler singleton — N concurrent animations tick on ONE loop, not N.

## Core concepts

1. **Single-scheduler invariant** — `Scheduler` self-stops when its active set
   empties and restarts on the next `add`. A `Timeline` registers itself as
   ONE tickable and drives its own children directly — only the timeline sits
   in the scheduler's active set, not each child tween.
2. **Reference-bound targets** — a `Tween`'s `target` is captured once at
   construction; there is no per-tick `getElementById`/DOM lookup (the legacy
   O(n)/frame cost the rewrite removes).
3. **Easing as a pure shaped clock** — `graphic.easing` is a Worker-safe table
   of 31 normalized curves (`t ∈ [0,1] → t' ∈ [0,1]`) built on fw's Penner
   table (`io/calc/easing`); a tween also takes CSS timing functions
   (`cubic-bezier(…)`, `steps(…)`). The engine itself does not offload to a
   Worker by default (main-thread ticking measured faster than the
   serialization cost of a Worker round-trip), but the pure easing/interpolate
   layer stays Worker-safe so it *can* run in one.

4. **A timeline keeps its own clock** — `time` advances by each frame delta
   times `timeScale`, so a timeline can `seek(ms)` (scrub, or jump to the
   final state), `pause()`/`resume()` and play in slow motion.

## Example

```js
// Runnable against a DOM (browser or happy-dom): tweens one rect, then
// composes two more into a two-step timeline sequence.
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { timelineModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerAllDeep([timelineModule]); // pulls tween, scheduler, easing,
                                            // interpolate, svgApply, fw dom/secPolicy
const { Timeline } = runtime.resolve('graphic.timeline');
const { tween }     = runtime.resolve('graphic.tween');
const { SVG_NS }    = runtime.resolve('graphic.svgApply');

const a = document.createElementNS(SVG_NS, 'rect');
const b = document.createElementNS(SVG_NS, 'rect');

// One-off tween, plays immediately on the shared scheduler.
tween({ target: a, property: 'width', from: 0, to: 100, duration: 500, easing: 'easeInOutQuad' });

// Composed sequence: b's tween starts once a's tween ends.
new Timeline({ onComplete: () => console.log('sequence done') })
    .sequence([
        { target: a, property: 'x', from: 0, to: 50, duration: 300 },
        { target: b, property: 'x', from: 0, to: 50, duration: 300 },
    ])
    .play();
```

## Run the demo

`../../demos/engine/index.html` (append `?variant=fw` to load the
fw-registered build instead of the default framework-free standalone bundle).
The two legacy-reproduction acceptance demos exercise this same engine
end-to-end: `../../demos/clock/index.html` and
`../../demos/towards-anm/index.html`.

## Reference

| Page | Covers |
|---|---|
| [`anim/scheduler`](../api/anim/scheduler.md) | The shared rAF loop — single-scheduler invariant |
| [`anim/tween`](../api/anim/tween.md) | Reference-bound single-property animation |
| [`anim/timeline`](../api/anim/timeline.md) | Composing tweens with offsets (sequence/parallel/stagger) |
| [`math/easing`](../api/math/easing.md) | The 31-curve Worker-safe easing table |
| [`interpolate/index`](../api/interpolate/index.md) | Value-type detection + the `from`→`to` blender |
| [`svg/apply`](../api/svg/apply.md) | The default attribute writer (`svgAttr` → fw `dom.attr`, unsanitized) |

## Notes

- **Not Worker-safe as a whole**: the default writer mutates a DOM target
  through `svgApply.svgAttr` → fw `dom.attr`, which writes via raw
  `setAttribute` — it does **not** invoke secPolicy sanitization. Only
  `dom.style` and the visibility helpers sanitize through secPolicy.
- Building the DOM tree yourself is out of scope for the engine alone — see
  the [scene](./scene.md) guide for the JSON→SVG builder plus declarative
  event DSL, and [frames](./frames.md) for the frame-sequence primitive.
- **Deterministic tests inject a manual clock**: pass `opts.scheduler` to the
  constructors (`Tween`/`Timeline`/`Frames`/…) — create your own
  `new Scheduler(...)` and drive it with `.tick(t)` to step animations
  deterministically (works under happy-dom, no rAF needed). Calling `play()`
  without the override registers the instance in the **shared production
  singleton** and leaks it across tests.

## See also

- [scene](./scene.md) — declarative scenes built on this same engine
- [frames](./frames.md) — a sibling scheduler-driven primitive (frame stepping, not tweening)
