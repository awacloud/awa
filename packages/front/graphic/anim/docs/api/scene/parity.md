---
module: parity
category: scene
status: complete
---

# Scene layer: both-surfaces guarantee + perf gate note

> Source: `tests/w2-builder-dsl.integration.test.js` (parity + scoped-id e2e +
> legacy parity) and `tests/w2-perf.integration.test.js` (scene-fire perf
> scenario); test-only, no `src/**` change.

The scene layer adds three module descriptors on top of the frozen
first ten: `graphic.svgBuild`, `graphic.scopedIds`, `graphic.scene`. This page
records the both-surfaces guarantee and the perf gate extension as verified
for the three, mirroring the guarantees already documented in
[`docs/api/perf.md`](../perf.md) ("Both-surfaces parity note") for the frozen
ten.

## The both-surfaces guarantee

For each of `graphic.svgBuild`, `graphic.scopedIds` and `graphic.scene`, the
three delivery surfaces produce **identical** results for a fixed input:

| Surface | How resolved |
|---|---|
| **fw-resolved** | `new ModuleRuntime().registerAllDeep(graphicModules)` → `resolve(name)` |
| **direct-ESM** | the re-exported descriptor consts from `src/main.js`, wired by a tiny local resolver (no `ModuleRuntime`) |
| **standalone** | `dist/standalone/graphic-{scoped-ids,svg-build,scene}-bundled.js` (inlined mini-DI), `factory()` |

Coverage (`tests/w2-builder-dsl.integration.test.js`):

- **`graphic.scopedIds`** — `id()` minting sequence and `ref()` rewriting
  (`url(#…)`, `href`, and colour pass-through) agree across all three surfaces
  for a fixed call sequence.
- **`graphic.svgBuild`** — the **built subtree structure** (tag / sorted
  attributes / children, serialized recursively) agrees across surfaces, both
  with and without an `idScope`; the unsupported-tag error message is
  byte-identical across surfaces too.
- **`graphic.scene`** — a fixed scene spec's **fired-timeline attribute-write
  sequence** (read back via `getAttribute` at 5 driven frames) agrees across
  surfaces, and the scoped root id (built via `svgBuild` + `scopedIds`
  together) agrees across surfaces.

**Standalone pulls zero `@awacloud/fw`.** Mirroring
`tests/standalone-no-fw.integration.test.js` for the frozen ten, the scene-layer suite
additionally asserts for `graphic-scoped-ids-bundled.js`,
`graphic-svg-build-bundled.js` and `graphic-scene-bundled.js`:

- no `@awacloud/fw` substring, no `import … from` statement, no `export * from`,
  no bare `from 'fw…'` specifier in the bundle source;
- `graphic-scoped-ids-bundled.js` (pure Worker-safe leaf) inlines no `dom`,
  `window`, or `document` reference;
- `graphic-svg-build-bundled.js` and `graphic-scene-bundled.js` (DOM-bound)
  inline `secPolicy` + `dom` as descriptor **text**, never as an import;
- the standalone `scene` bundle runs `createScene(spec)` end to end with zero
  `@awacloud/fw` anywhere on the resolved import path.

## Scoped-id e2e — two scene instances, one document

`tests/w2-builder-dsl.integration.test.js` proves the collision-free
guarantee end to end, not just at the unit level: two `createScene(spec)`
calls with **distinct prefixes**, both roots attached to one Happy-DOM
`<svg>`, yield a union of ids with **no duplicates**, and each scene's `refs`
resolve to **its own** built node (never the sibling's) — including for a
`url(#…)` gradient reference nested under `defs`. A companion cross-surface
variant repeats the same assertion with one scene instantiated per surface
(fw / direct-ESM / standalone), all three attached to one document.

A dedicated "honesty" test also documents the guarantee's actual scope
(per [`docs/api/svg/scoped-ids.md`](../svg/scoped-ids.md) "Collision
guarantee"): the collision-free promise holds for **distinct prefixes**. The
literal same spec object (default/shared prefix) passed to `createScene`
twice mints the **same id string** in each scene's own scope — the nodes
stay disjoint, but the string is not unique, so real multi-instance callers
must supply a disambiguating `prefix`, exactly as the collision-free e2e case
does.

## Legacy parity

`tests/w2-builder-dsl.integration.test.js` asserts the behavioral contract
`docs/api/scene/scene.md` documents as the modernization of the legacy
`@anim-old` `compute.events`/`loop` pattern:

- `scene.fire(eventName)` drives the named event's animations on the bound
  element — the property progresses from `from` at `t=0` to `to` at `t=1`
  (verified at `t=0`, the midpoint, and `t=1` for a `linear`-eased tween).
- `EventSpec.loop: true` **re-fires** the same event on completion — driven
  for 5 cycles via an injected manual clock, every cycle reaches the same end
  value, proving the DSL actually re-compiles and re-plays rather than
  stalling after the first cycle.
- Re-firing never leaks a second scheduler or a second concurrently-active
  timeline for the same looping event — `scheduler.active.size` stays at the
  same count across every completion → re-fire boundary (single-scheduler
  invariant, carried from `scene.test.js`).

## Perf gate note — scene-fire scenario

`tests/w2-perf.integration.test.js` extends the **frozen**
`src/perf/harness.js` (`runPerf`, unmodified — no new perf engine) with a
scene-fire scenario: compile N scenes via `createScene` + `scene.on('grow')`,
play every compiled `Timeline` onto ONE shared manual-clock `Scheduler`, then
drive `frames` simulated frames, for N ∈ `{10, 50, 100, 250, 500}`.

### Compile cost vs per-frame cost — reported separately

| Cost | What it measures | Where |
|---|---|---|
| **Compile cost** (`compileMs`, `compileMsPerScene`) | One-time: `createScene(spec)` (builds the SVG subtree via `svgBuild`, mints scoped ids via `scopedIds`) + `scene.on(eventName)` (compiles the event's `animations` into a `Timeline`) — the builder+DSL compile step, for all N scenes. | Timed once, before any frame is driven. |
| **Per-frame cost** (`msPerFrame`, `msPerTweenPerFrame`) | Steady-state: `totalMs / frames` from driving the shared scheduler across simulated frames once every compiled timeline is playing — the same metric `runPerf`/`docs/api/perf.md` already define. | Timed after every timeline is `play()`-ed, identical loop shape to `runPerf`. |

These are independent measurements on the same result object — compile cost
is never folded into or subtracted from `msPerFrame`. Observed order of
magnitude (this machine, not a portable absolute number — see the honesty
caveat below): compile cost is a few **milliseconds total** for N up to 500
(low microseconds per scene); `msPerFrame` stays under **0.35 ms** at N=500,
both far under the budget.

### Budget + regression margin

`msPerFrame` is asserted, at every swept N, to stay:

- **under the frozen budget constant**, `16.67 ms` (one 60fps frame — the same
  constant `tests/perf.integration.test.js` gates the frozen ten against);
- **within the recorded regression margin** — this task does not introduce a
  tighter budget than the existing gate; the scene-fire path adds
  builder/DSL cost only at compile time (once per scene), not per frame, so
  the per-frame regression margin is the SAME `16.67 ms` constant. A
  dedicated baseline test re-runs the frozen bare-tween `runPerf` at N=500
  in the same file, confirming the existing tween-only gate is unaffected by
  the scene-fire addition (the two scenarios are additive, not competing).

### Compile cost

The suite reports the one-time compile cost **separately** (`compileMs` /
`compileMsPerScene`) and asserts no ceiling on it: only the per-frame
`16.67 ms` budget is frozen. The observed compile cost is low microseconds
per scene, a few ms in total up to N=500.

### Honesty caveat

Same caveat as `docs/api/perf.md` "What is measured (and what is NOT)":
`bun:test` has no real DOM Worker and no browser frame pump. The default
write target for the scene-fire scenario is a stub-backed built element (a
real `SVGElement` from `svgBuild`, but no actual layout/paint/compositor
runs in Happy-DOM). The reported `msPerFrame` is therefore the engine's
**per-frame compute cost**, NOT an achievable browser fps — do not
extrapolate an fps number from it.

## See also

- [scene/scene](scene.md) — the `graphic.scene` descriptor these tests exercise
- [svg/build](../svg/build.md) — the JSON→SVG builder `graphic.scene` composes
- [svg/scoped-ids](../svg/scoped-ids.md) — the collision guarantee scope, and its exact bound (distinct prefixes)
- [perf](../perf.md) — the frozen perf harness and its "Both-surfaces parity note"
- [Frozen module contract](../../CONTRACT.md) — descriptor names/types/deps (immutable; the scene layer extends it as a strict superset)
