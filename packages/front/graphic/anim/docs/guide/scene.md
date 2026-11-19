---
module: guide/scene
category: guide
status: complete
---

# Scene — JSON→SVG scene & event DSL

> Declarative SVG scenes: build a subtree from JSON, wire named events to
> engine animations, without hand-wiring timeline/tween composition.

## What it is

`graphic.scene` turns a JSON node description (built via `graphic.svgBuild`)
plus a map of named events into a `Scene` instance: a built SVG root, named
element refs, and compiled `Timeline`s you fire by name
(`scene.fire('grow')`). Internally it composes the same
`graphic.timeline`/`graphic.tween` engine described in the
[engine](./engine.md) guide, still on the single shared scheduler.

## Core concepts

1. **Declarative spec, imperative fire** — `template` (JSON→SVG via
   `graphic.svgBuild`) + `events: { name: { at, animations, mode?, stepMs?,
   loop? } }`. `scene.on(name)` compiles a `Timeline` (does not play);
   `scene.fire(name)` compiles AND plays it.
2. **Reference-bound refs** — `refs` names resolve to their built elements
   ONCE at `createScene` time; firing an event never re-queries the DOM.
3. **Per-instance id scope — NOT automatic collision-free.** `graphic.scene`
   scopes template ids through `graphic.scopedIds.createScope(prefix)`, but
   the scope's collision guarantee is **prefix-scoped**: two `Scene`s built
   with the SAME prefix mint identical id strings for the same raw template
   id. `graphic.scene` defaults `prefix` to `'scene'` (confirmed live,
   `src/scene/scene.js`) — creating two scenes from the same (or a
   same-shaped) template WITHOUT an explicit, distinct `prefix` per instance
   collides document-wide. **Always pass a per-instance-unique `prefix`**
   when more than one scene may end up in the same document.

## Example

```js
// Runnable against a DOM: builds a scene with one rect and three named
// events (grow / staggered shake / looping pulse), then fires them.
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { sceneModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerAllDeep([sceneModule]); // pulls svgBuild, scopedIds, timeline,
                                         // tween, scheduler + fw dom/secPolicy
const { createScene } = runtime.resolve('graphic.scene');

const scene = createScene({
    prefix: 'card-1',                   // per-instance — avoids the collision above
    template: {
        tag: 'g',
        children: [
            { tag: 'rect', attrs: { id: 'box', x: 0, width: 10, height: 10, fill: '#09f' } },
        ],
    },
    refs: { box: 'box' },
    events: {
        grow:  { at: 'box', animations: [{ property: 'width', from: 10, to: 100, duration: 500 }] },
        shake: { at: 'box', mode: 'stagger', stepMs: 80,
                 animations: [ { property: 'x', from: 0, to: 5, duration: 100 },
                               { property: 'x', from: 0, to: -5, duration: 100 } ] },
        pulse: { at: 'box', loop: true,
                 animations: [{ property: 'opacity', from: 1, to: 0.4, duration: 300 }] },
    },
});

document.body.querySelector('svg').appendChild(scene.root);
scene.fire('grow');
scene.fire('shake');
scene.fire('pulse');   // re-fires itself on every completion (loop: true)
```

## Run the demo

`../../demos/scene/index.html` (append `?variant=fw` for the fw-registered
build).

## Reference

| Page | Covers |
|---|---|
| [`scene/scene`](../api/scene/scene.md) | The `graphic.scene` descriptor, spec shape, event modes, errors |
| [`scene/parity`](../api/scene/parity.md) | Both-surfaces parity + perf gate for the scene DSL |
| [`svg/build`](../api/svg/build.md) | The JSON→SVG builder `template` is built through |
| [`svg/scoped-ids`](../api/svg/scoped-ids.md) | The id-scope primitive — prefix + collision contract |
| [`anim/timeline`](../api/anim/timeline.md) | What `scene.on`/`scene.fire` compile onto |
| [engine](./engine.md) | The tween/timeline/scheduler story a scene composes |

## Notes

- **Not Worker-safe**: `createScene` builds and mutates a DOM-bound subtree
  via `graphic.svgBuild`.
- Unknown event/ref names throw (`scene: unknown event "<name>"` /
  `scene: unknown ref "<name>"`) rather than silently no-op.

## See also

- [engine](./engine.md) — the tween/timeline/scheduler engine a scene composes
- [frames](./frames.md) — a sibling scheduler-driven primitive for frame stepping
