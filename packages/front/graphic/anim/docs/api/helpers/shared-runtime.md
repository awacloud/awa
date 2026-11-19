---
module: helpers/shared-runtime
category: helpers
name: acquireRuntime, releaseRuntime
type: internal
dependencies: ['@awacloud/fw/core/runtime.js']
returns: "{ acquireRuntime, releaseRuntime }"
worker-safe: false
status: complete
---

# helpers/shared-runtime — `acquireRuntime`, `releaseRuntime`

> The one reference-counted `ModuleRuntime` shared by `createPageflip` and `createHypertree`.

**Module** `graphic/helpers/shared-runtime` | **Type** internal (not a module descriptor, not an exports entry) | **Source** `packages/front/graphic/anim/src/helpers/shared-runtime.js` | **Deps** fw `ModuleRuntime` | **Worker-safe** no (it only serves the DOM-bound helpers)

## Descriptor

There is no descriptor: this is a plain ES module with two named function
exports and a private module-level state (`_runtime`, `_live`). Nothing runs at
import; the runtime is built lazily on the first acquire.

Why one runtime: a runtime resolves one `graphic.scheduler` singleton, so a page
using both helpers runs one animation-frame loop, not one per helper.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `acquireRuntime` | `(descriptor: { name: string }) => ModuleRuntime` | Create the shared runtime if absent, `registerDeep(descriptor)` on it (modules already registered are skipped), count one more live instance and return the runtime. |
| `releaseRuntime` | `() => void` | Drop one live instance; the last release sets the runtime to `null`. A release with no live instance is a no-op (the count never goes negative). |

## Notes

- Every `acquireRuntime` must be paired with one `releaseRuntime`. The helpers do
  this: `dispose()` releases, and a failed constructor releases before it
  rethrows.
- After the last release, the next acquire builds a fresh runtime, so a page that
  disposes every helper instance keeps no engine instance alive.
- Internal to the package: not listed in `package.json` exports, not a member of
  `graphicModules`.
- No `@throws` of its own; `registerDeep` errors propagate to the caller.

## See also

- [pageflip/create](../pageflip/create.md) — `createPageflip`, one consumer
- [hypertree/create](../hypertree/create.md) — `createHypertree`, the other
- [anim/scheduler](../anim/scheduler.md) — the singleton that the shared runtime guarantees
