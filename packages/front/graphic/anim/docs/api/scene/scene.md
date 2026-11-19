---
module: scene/scene
category: scene
name: graphic.scene
type: fw.dom.graphic
dependencies: [graphic.svgBuild, graphic.scopedIds, graphic.timeline, graphic.tween, graphic.scheduler]
returns: "{ createScene }"
worker-safe: false
status: complete
---

# scene/scene — `graphic.scene`

> Instance-scoped scene / named-event DSL — wires declarative animations to the
> frozen `graphic.timeline`/`graphic.tween` over the single shared scheduler.

**Module** `graphic.scene` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/scene/scene.js` | **Deps** `graphic.svgBuild`, `graphic.scopedIds`, `graphic.timeline`, `graphic.tween`, `graphic.scheduler` | **Worker-safe** no

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { sceneModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerAllDeep([sceneModule]); // pulls svgBuild + scopedIds + timeline + tween + scheduler
const { createScene } = runtime.resolve('graphic.scene');
```

## Descriptor

`graphic.scene` is one capture-free fw module descriptor. Its factory receives
the five resolved dependencies as parameters; the `Scene` class is defined
**inside** the factory so it references the injected `Timeline` constructor
without any module-scope capture (`fw/no-factory-capture` clean).

```js
export const sceneModule = {
    name: 'graphic.scene',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.svgBuild', 'graphic.scopedIds', 'graphic.timeline', 'graphic.tween', 'graphic.scheduler'],
    deps: [svgBuildModule, scopedIdsModule, timelineModule, tweenModule, schedulerModule],
    factory(svgBuild, scopedIds, timelineMod, tweenMod, scheduler) { /* … */ return { createScene }; },
};
```

## The scene spec

```
SceneSpec = { template: NodeDesc, prefix?: string, refs?: Record<string,string>,
              events: Record<string, EventSpec> }
EventSpec = { at: string, animations: AnimSpec[], mode?: 'sequence'|'parallel'|'stagger',
              stepMs?: number, loop?: boolean }
AnimSpec  = { target?: string, property, from, to, duration, easing? }
```

- `template` — a JSON SVG node description, built via `graphic.svgBuild`.
- `prefix` — id-scope prefix passed to `graphic.scopedIds.createScope`, verbatim
  (`''` included); an absent prefix defaults to a distinct per-instance
  `scene-<n>`.
- `refs` — a name → raw template id map; each name resolves (once, at
  `createScene` time) to the built element carrying that id, scoped through the
  same `graphic.scopedIds` scope as the template build.
- `events` — named event → `EventSpec`. `AnimSpec.target` defaults to the
  owning event's `at`; `property`/`from`/`to`/`duration`/`easing` forward 1:1 to
  `TweenOptions`.

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `createScene` | `(spec: SceneSpec) => Scene` | Build a scene: a scoped SVG root + compiled named events. |
| `Scene#root` | `SVGElement` | The built root, via `svgBuild.build(spec.template, { idScope })`. |
| `Scene#el` | `(name: string) => SVGElement` | Resolve a `refs` name to its bound element (by reference). |
| `Scene#on` | `(eventName: string) => Timeline` | Compile a fresh `Timeline` from the event's `animations`; does **not** auto-play. |
| `Scene#fire` | `(eventName: string) => Timeline` | Compile and play the event; returns the playing `Timeline`, which the scene tracks until it settles. Firing an event clears a previous `stop` of it. |
| `Scene#stop` | `(eventName?: string) => void` | Stop the timelines the scene fired for that event (every event without a name) and end its loop. A timeline from `on()` stays the caller's to stop, but its loop continuation obeys the stop. |
| `Scene#dispose` | `() => void` | `stop()` every event, then detach `root` from its parent (the reference stays readable). Idempotent; `on`/`fire` then throw `scene: disposed`. |

## Examples

```js
const scene = createScene({
  template: {
    tag: 'g',
    children: [
      { tag: 'rect', attrs: { id: 'box', x: 0, width: 10, height: 10, fill: '#09f' } },
    ],
  },
  refs: { box: 'box' },
  events: {
    grow: {
      at: 'box',
      animations: [{ property: 'width', from: 10, to: 100, duration: 500 }],
    },
    shake: {
      at: 'box',
      mode: 'stagger',
      stepMs: 80,
      animations: [
        { property: 'x', from: 0, to: 5, duration: 100 },
        { property: 'x', from: 0, to: -5, duration: 100 },
      ],
    },
    pulse: {
      at: 'box',
      loop: true,
      animations: [{ property: 'opacity', from: 1, to: 0.4, duration: 300 }],
    },
  },
});

document.body.querySelector('svg').appendChild(scene.root);

const tl = scene.on('grow');   // compiled, not playing
tl.play();                     // or: scene.fire('grow')

scene.fire('shake');           // staggered two-step wiggle
scene.fire('pulse');           // loop: true re-fires 'pulse' on every completion
```

## Event modes

- `mode: 'sequence'` (→ `Timeline#sequence`) — each animation starts when the
  previous one ends.
- `mode: 'parallel'` (→ `Timeline#parallel`, the **default** when `mode` is
  omitted) — all animations start together.
- `mode: 'stagger'` (→ `Timeline#stagger(items, stepMs)`) — animation `i`
  starts at `i * stepMs`.

## Loop

`loop: true` wires the compiled `Timeline`'s `onComplete` to re-`fire` the same
event — each cycle is a fresh `Timeline` (via `scene.on`/`scene.fire`), still
registered on the shared scheduler. Driving frames with an injected clock
across a completion boundary observes the next cycle start.

The continuation checks the scene, not a captured timeline: `scene.stop(name)`
(or `stop()`, or `dispose()`) ends the loop whichever cycle is running, even
one re-fired after the timeline the caller holds has completed.

## Single-scheduler invariant

Every `Timeline` a scene compiles registers itself (one tickable) on the
**shared** `graphic.scheduler` singleton — `scene.on`/`scene.fire` never
construct a second `Scheduler`. Firing multiple events adds multiple
`Timeline`s to the same scheduler's active set; each timeline's own children
(the compiled tweens) are driven by the timeline, not registered directly
(`scheduler.active.size` grows by one per fired event, not per animation).

## Targets bound by reference

`Scene#el` resolves each `refs` entry to its built element **once**, at
`createScene` time, from the just-built subtree. `AnimSpec.target` (or the
event's `at` default) is resolved to that same bound element when an event is
compiled — there is no per-tick `getElementById`/DOM lookup, matching the
reference-binding contract of `graphic.tween`.

## Errors

- Unknown event name: `scene.on`/`scene.fire` throw
  `Error('scene: unknown event "<name>"')`.
- Unknown ref name: `scene.el` throws `Error('scene: unknown ref "<name>"')`.

## Legacy-modernization note

Modernizes the legacy `@anim-old` `compute.events`/`loop` pattern
**behaviorally** (named event → animations, `loop` re-fire) with modern,
capture-free field names — there is no `@anim-old` API parity requirement; the
legacy per-tick `getElementById` cost is specifically what the reference-bound
`el`/target resolution here removes.

## Notes

- **Not Worker-safe**: builds and mutates a DOM-bound scene via `svgBuild`.
- New interpolation kinds / easing curves are **out of scope** — reuse only
  `graphic.interpolate`/`graphic.easing` through `AnimSpec.easing`.

## See also

- [svg/build](../svg/build.md) — builds `Scene#root` from the JSON template
- [svg/scoped-ids](../svg/scoped-ids.md) — the per-instance id scope `Scene` uses
- [anim/timeline](../anim/timeline.md) — `Scene#on`/`Scene#fire` compile onto this
- [anim/tween](../anim/tween.md) — the per-animation leaf `Timeline` composes
- [anim/scheduler](../anim/scheduler.md) — the single shared loop every scene's timelines run on
