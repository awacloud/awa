---
module: graphic.scheduler
name: graphic.scheduler
type: fw.dom.graphic
version: 0.1.0
dependencies: [clock]
returns: "{ Scheduler, scheduler }"
worker-safe: false
status: complete
---

# graphic.scheduler

> One shared rAF loop ticking all active tweens — the single-scheduler invariant.

**Module** `graphic.scheduler` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/anim/scheduler.js` | **Deps** fw `clock` (`io/timing/clock.js`) | **Worker-safe** no

## Descriptor

```js
import { schedulerModule } from '@awacloud/graphic-anim';
// schedulerModule = { name, type, version, dependencies, deps, factory }
// factory() → { Scheduler, scheduler }
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `schedulerModule` | `ModuleDescriptor` | The `graphic.scheduler` fw module descriptor. |
| `Scheduler` | `class Scheduler(clock?)` | One self-stopping rAF loop over a `Set` of active tweens. Resolved from `factory(clockApi).Scheduler`. |
| `Scheduler#now` | `() => number` | A timestamp from the injected clock (defaults to fw `clock.monotonic`, which works under fw's sanity lockdown). The rAF loop never reads it: it ticks with rAF's own frame timestamps, so the default only serves a manual `tick()` without a timestamp; do not mix the two timebases on one scheduler. |
| `Scheduler#add` | `(tween) => void` | Register a tween; starts the loop if idle. Idempotent (`Set`). |
| `Scheduler#remove` | `(tween) => void` | Unregister a tween; the loop self-stops once the set empties. |
| `Scheduler#tick` | `(ts?) => void` | Advance every active tween to `ts` — exposed for deterministic tests. |
| `Scheduler#stop` | `() => void` | Cancel the loop and clear the active set (teardown). |
| `scheduler` | `Scheduler` | The ONE shared instance all tweens default to. Resolved from `factory().scheduler`. |

## Descriptor shape

```js
{
    name: 'graphic.scheduler',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['clock'],   // fw io/timing/clock
    deps: [clock],             // bundler mirror
    factory(clockApi) {
        // Scheduler class and singleton both live inside the factory.
        // requestAnimationFrame / globalThis are ambient globals (not
        // module-scope captures — allowed by fw/no-factory-capture).
        class Scheduler { /* ... */ }
        const scheduler = new Scheduler();
        return { Scheduler, scheduler };
    },
}
```

## Usage via fw DI

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { schedulerModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(schedulerModule);   // also registers fw's `clock`, its dependency

const { Scheduler, scheduler } = runtime.resolve('graphic.scheduler');

// Production: tweens default to the shared instance — one rAF loop for all.
scheduler.add(myTween);
```

## Usage in tests (deterministic clock)

```js
import { schedulerModule } from '@awacloud/graphic-anim';
import { clock } from '@awacloud/fw/io/timing/clock.js';

const { Scheduler } = schedulerModule.factory(clock.factory());

// Inject a deterministic clock and drive frames by hand (no real rAF).
const s = new Scheduler({ now: () => 0, schedule: (cb) => { /* store cb */ }, cancel: () => {} });
s.add(myTween);
s.tick(0);
s.tick(500);
s.tick(1000);
s.stop();
```

## Notes

- **Single-scheduler invariant**: N concurrent tweens share ONE rAF loop, not N
  loops. The loop self-stops when `active` empties and restarts on the next `add`.
- **No per-tick DOM lookup**: the scheduler only iterates the active `Set` and calls
  each tween's private `_step`; targets are bound by reference in the tween.
- `tick(ts)` iterates a snapshot, so a tween may remove itself mid-tick (on
  completion) without disturbing others.
- **Not Worker-safe** and **no Worker by default**: the engine ticks on the main
  thread (a measured Worker offload was ~2.6–3.0× slower). The pure layers it consumes
  stay Worker-safe.
- **Capture-free**: `requestAnimationFrame`, `performance`, and `globalThis` are
  ambient globals (no module-scope definition) — they are NOT captures under the
  `fw/no-factory-capture` rule and do not block `factory.toString()` serialization.

## See also

- [anim/tween](./tween.md) — the tween driven by this scheduler
- [anim/timeline](./timeline.md) — composes tweens on this same shared scheduler
