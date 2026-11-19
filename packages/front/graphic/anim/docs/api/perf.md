# `@awacloud/graphic-anim` — perf harness & the standing perf gate

> Source: `src/perf/harness.js` (ported from the engine's first vertical
> slice). The standing
> gate test is `tests/perf.integration.test.js`.

The harness measures the engine's **per-frame work** — interpolation + apply for
N concurrent tweens sharing ONE scheduler — as a deterministic, CI-stable number.
It is the standing regression gate every later module inherits.

## What is measured (and what is NOT)

| Reported | Meaning |
|---|---|
| `msPerFrame` | `totalMs / frames` — the **budget metric**. |
| `msPerTweenPerFrame` | `msPerFrame / tweens` — marginal cost of one tween. |
| `totalMs` | wall time spent in the tick loop. |

**ms/frame, NOT fps.** `bun:test` has no real DOM Worker and no
browser frame pump, so the harness drives a *manual clock* and times only the
engine tick — there is no rendering, no rAF, no compositor. Reporting an
extrapolated "fps" from this would be misleading, so the harness reports
**ms/frame** only. The default target is a compute-only stub element; a
DOM-backed variant (live SVG via `makeTarget`) exercises the real
`svgApply.svgAttr → dom.attr` write path.

## Determinism

A `Scheduler` is built with an injected clock (`{ now, schedule, cancel }`) whose
`schedule`/`cancel` are no-ops. Frames are advanced explicitly via
`sched.tick(clockT)` with `clockT = f * dt`. No real `requestAnimationFrame` is
involved, so the measured number is reproducible across runs and machines (only
the absolute magnitude varies with CPU; the *shape* vs N is stable).

The engine itself is resolved through the SAME single source every surface uses —
`new ModuleRuntime().registerAllDeep(graphicModules)` then
`resolve('graphic.scheduler' | 'graphic.tween')`. The harness re-implements
nothing; it consumes the resolved factories.

## API

The harness lives at `src/perf/harness.js`. It is an internal gate utility (not a
public `exports` subpath). This import is repo-internal — the path is
relative to the **package root**, not a published subpath; do not import it
from outside the repo:

```js
import { runPerf, sweep, assertBudget, resolveEngine, stubTarget }
    from './src/perf/harness.js';
```

| Export | Signature | Role |
|---|---|---|
| `runPerf(scenario)` | `(PerfScenario) → PerfResult` | One scenario; returns per-frame stats. |
| `sweep(counts?, frames?, opts?)` | `→ PerfResult[]` | ms/frame vs N table. |
| `assertBudget(opts?)` | `→ PerfResult` (throws on regression) | The gate assertion. |
| `resolveEngine()` | `→ { Scheduler, Tween }` | Fresh per-run DI (no singleton leak). |
| `stubTarget()` | `→ { setAttribute, _last }` | Default compute-only write target. |

`PerfScenario`: `{ tweens, frames, dt?, from?, to?, easing?, property?, makeTarget? }`.
Defaults: `dt=16`, `from='0px'`, `to='300px'`, `easing='easeInOutCubic'`,
`property='x'`, `makeTarget=stubTarget`.

### DOM-backed run

```js
const SVG_NS = 'http://www.w3.org/2000/svg';
const r = runPerf({
    tweens: 100, frames: 60,
    makeTarget: () => document.createElementNS(SVG_NS, 'rect'),
});
// r.domBacked === true; writes go through the resolved svgApply → dom.attr path.
```

## The standing gate

```js
import { assertBudget } from './src/perf/harness.js';
// Throws if ms/frame exceeds the budget at the gate point.
assertBudget({ tweens: 500, frames: 120, budgetMs: 16.67 });
```

| Parameter | Default | Rationale |
|---|---|---|
| `tweens` (gate N) | `500` | upper bound of the first sweep — 500 concurrent tweens, ONE scheduler. |
| `budgetMs` | `16.67` | one 60fps frame — the per-frame compute ceiling. |
| `frames` | `120` | average over 2s of simulated 60fps frames. |

`tests/perf.integration.test.js` runs `runPerf`, `assertBudget` at N=500, the
`sweep` baseline table, and a DOM-backed variant. Observed compute cost is
~0.03 ms/frame at N=500 — roughly **500× under** the 16.67 ms budget — so the gate
is a guard against future O(N²)/per-tick-DOM-lookup regressions, not a tight fit.

> **Gate wiring (registration note):** the package `test` script is
> `bun test src/`, which does NOT pick up `tests/`. Run the gate via the
> monorepo convention `bun test packages/front/graphic/` (CI) — it covers
> `tests/perf.integration.test.js`. See the report's `registrations_needed`.

## Both-surfaces parity note

`tests/parity.integration.test.js` proves the **single-source guarantee**: for
every public entry the three delivery surfaces produce IDENTICAL results.

| Surface | How resolved |
|---|---|
| **fw-resolved** | `ModuleRuntime().registerAllDeep(graphicModules)` → `resolve(name)` |
| **direct-ESM** | re-exported descriptor consts from `src/main.js`, wired by a tiny local resolver |
| **standalone** | `dist/standalone/graphic-*-bundled.js` (inlined mini-DI), `factory()` |

Coverage: sampled easing (all 31 curves × 5 t), Matrix decompose round-trips +
`lerpDecomposition`, color parse/lerp/format, units split/format, interpolator
outputs (unit / color / transform / path), AND a **full deterministic tween run** —
a clock is injected and every `setAttribute` write to a stub element is captured;
the attribute-write sequences must be byte-equal across all three surfaces (a
scalar `x` tween and a `fill` color tween).

**Scheduler-singleton identity** is asserted **WITHIN** each surface (each surface
has its own DI container, so `resolve` memoization yields a stable singleton) and
the three singletons are asserted **DISTINCT across** surfaces — there is no shared
state between containers, and the test must not assert one.

`tests/standalone-no-fw.integration.test.js` additionally proves the standalone
surface imports with **ZERO `@awacloud/fw`** on the path (the bundle has no import
statements; `secPolicy`/`dom` are inlined as text), runs an end-to-end tween, and
that the pure-leaf bundles are **Worker-safe** (no `window`/`document`/`dom` in
the inlined source).

## See also

- [Generated dual-surface bundles](standalone.md) — the standalone/build surfaces.
- [`src/main.js`](main.md) — the single source (generator contract + fw barrel).
- [Frozen module contract](../CONTRACT.md) — descriptor names/types/deps (immutable).
