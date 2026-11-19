---
module: aggregator
category: root
name: graphic.anim
type: fw.dom.graphic
dependencies: [graphic.lerp, graphic.easing, graphic.units, graphic.matrix, graphic.color, graphic.scopedIds, graphic.interpolate, graphic.svgApply, graphic.svgBuild, graphic.scheduler, graphic.tween, graphic.timeline, graphic.scene, graphic.frames]
returns: "{ lerp, easing, units, matrix, color, scopedIds, interpolate, svgApply, svgBuild, scheduler, tween, timeline, scene, frames }"
worker-safe: false
status: complete
---

# aggregator — `graphic.anim`

> Whole-package resolve of the 14 core modules in one namespace object.

**Module** `graphic.anim` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/aggregator.js` | **Deps** the 14 core modules (below) | **Worker-safe** no (partially: it pulls DOM-bound members)

## Descriptor

`graphic.anim` is one capture-free fw module descriptor (`animAggregatorModule`).
Its factory receives the 14 resolved core modules as parameters and returns them
in a plain object, **by reference**: it does no work of its own. Resolving
`graphic.anim` therefore yields the same instances as resolving each core module
on its own, because the runtime memoizes per name.

```js
export const animAggregatorModule = {
    name: 'graphic.anim',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: [/* the 14 names, in topo order */],
    deps: [lerpModule, easingModule, /* … */ framesModule],
    factory(lerp, easing, /* … */ frames) { return { lerp, easing, /* … */ frames }; },
};
```

`deps.map(d => d.name) === dependencies` (same order). The pageflip, hypertree and
svg3d extension modules are **not** part of the aggregate.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `animAggregatorModule` | descriptor | The `graphic.anim` descriptor. |
| `AGGREGATE_NAMES` | `string[]` | The 14 core module names, in topo order (dependencies before dependents). |

Resolved value, one key per dependency (same order as `dependencies`):

| Key | Module |
|-----|--------|
| `lerp` | `graphic.lerp` |
| `easing` | `graphic.easing` |
| `units` | `graphic.units` |
| `matrix` | `graphic.matrix` |
| `color` | `graphic.color` |
| `scopedIds` | `graphic.scopedIds` |
| `interpolate` | `graphic.interpolate` |
| `svgApply` | `graphic.svgApply` |
| `svgBuild` | `graphic.svgBuild` |
| `scheduler` | `graphic.scheduler` |
| `tween` | `graphic.tween` |
| `timeline` | `graphic.timeline` |
| `scene` | `graphic.scene` |
| `frames` | `graphic.frames` |

## Notes

- Capture-free: every returned member is a factory parameter, so the factory
  survives `ModuleRuntime.serialize()` and minification.
- `AGGREGATE_NAMES` is exactly the first 14 entries of the `graphicModules`
  registry; the registry holds more entries (the extension modules and their
  kernels), the aggregate deliberately does not.
- The aggregate is registered last in `graphicModules` and has no standalone
  bundle root of its own: a registry addition only.
- Type `fw.dom.graphic`: the aggregate transitively pulls the DOM-bound members
  (`svgApply`, `svgBuild`, `scene`, `frames`), so it is only partially
  Worker-safe.
- No `@throws`: the factory only returns its parameters.

## See also

- [aggregator guide](../aggregator.md) — the long-form rationale and usage
- [CONTRACT](../CONTRACT.md) — the frozen descriptor table
- [anim/timeline](./anim/timeline.md) — one of the aggregated modules
