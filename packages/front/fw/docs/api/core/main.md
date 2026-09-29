---
module: main
category: core
dependencies: [runtime, logger, readyState, worker-helper]
returns: object
worker-safe: false
status: complete
---

# main — the framework entry point

> The `@awacloud/fw` package root: instantiates the runtime and its
> companion singletons and exports them.

**Module** `main` | **Source** `packages/front/fw/src/main.js` | **Deps** `runtime`, `logger`, `readyState`, `worker-helper` | **Worker-safe** no (instantiates `createWorker`/`domReady` for the main realm)

## Resolve

```js
import fw, { ENV, log, runtime, createWorker, domReady } from '@awacloud/fw';
```

Not resolved via `runtime.resolve()` — `main.js` **is** the entry point that
builds the runtime; there is nothing upstream of it to ask.

## Key concepts

Five exports, each backed by a distinct fw subsystem:

| Export | Type | Built from |
|---|---|---|
| `ENV` | `{ DEV: boolean, LOG: boolean }` | `LOG` fixed `true`; `DEV` flips `false → true` inside a `/* dev_only */ … /* !dev_only */` block, stripped at build time |
| `log` | logger instance \| `false` | `logger.main(ENV.DEV)` when `ENV.LOG` is true, else `false` |
| `runtime` | `ModuleRuntime` | one `new ModuleRuntime()` instance, shared by the whole realm |
| `createWorker` | function | `createWorkerRuntime(ENV, runtime, runtimeSource, log, logger.worker.toString())` |
| `domReady` | readyState instance | `readyState()` |

`ENV.DEV` is `false` in a production build (the `dev_only` block removed) and
`true` in dev, gating `logger.main`'s verbosity.

## Registration patterns

`main.js` no longer registers any module itself — the app wires its own
module set. Two idioms, both documented as comment blocks at the foot of
`src/main.js`:

**Inline registration** — hand-pick modules and chain `.register()`:

```js
import { hex } from './io/codec/hex.js';
import { uid } from './io/utils/uid.js';
const runtime = new ModuleRuntime()
    .register(hex)
    .register(uid);
```

**Import registration** — register the full catalogue via the generated
array:

```js
import modules from './core/modules.js';
fw.runtime.registerAll(modules);
```

## API

`main.js` exports five bindings (both named and as the default object); it
declares no methods of its own — all behavior lives in the modules listed
above.

| Export | Signature | Returns |
|---|---|---|
| `ENV` | `{ DEV: boolean, LOG: boolean }` | build/runtime flags |
| `log` | logger instance \| `false` | in-memory circular log buffer, or `false` when disabled |
| `runtime` | `ModuleRuntime` | the shared DI registry/resolver |
| `createWorker` | `(...) => Worker` | framework-aware Web Worker spawn |
| `domReady` | `{ interactive(cb), complete(cb) }`-shaped | DOM lifecycle callbacks |

## Examples

```js
import fw, { runtime } from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules';

runtime.registerAll(modules);
const hex = runtime.resolve('hex');
fw.domReady.complete(() => console.log('DOM ready'));
```

## Notes

- `main.js` performs work at import time (constructs `runtime`, `createWorker`,
  `domReady`) — by design, since it **is** the entry point; this is why
  `worker-safe` is `false` rather than `partial`: importing it from a Worker
  script pulls in main-realm-only construction.
- `createWorker` and `domReady` are convenience singletons built once; a
  caller needing a second isolated `ModuleRuntime` instantiates
  `ModuleRuntime` directly instead of importing `main.js` again.

## See also

- [runtime](./runtime.md) — the `ModuleRuntime` class `main.js` instantiates
- [modules](./modules.md) — the generated module catalogue for `registerAll`
- [typed](../typed.md) — typed-runtime facade (`@awacloud/fw/typed`)
- [Getting started](../../guide/getting-started.md)
