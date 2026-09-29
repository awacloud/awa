# TypeScript support

`@awacloud/fw` ships TypeScript declarations generated from JSDoc by `tsc` into
`dist/types/`. There is no separate `@types/` package and no `.d.ts` colocated
with the JavaScript sources — `package.json#exports[*].types` points to
`./dist/types/...` for every entry. Types are resolved automatically by any
TypeScript-aware tooling.

## What you get out of the box

| Path | Typed surface |
|---|---|
| `@awacloud/fw` | `{ ENV, log, runtime, createWorker, domReady }` (named + default exports). |
| `@awacloud/fw/core/runtime` | `ModuleRuntime`, `ModuleDefinition`, `InstanceOf<M>`, `ResolveOptions`, `ListFilter`, `SerializedGraph`. |
| `@awacloud/fw/core/worker-helper` | `WorkerOptions`, `WorkerRuntimeFn`, `createWorkerRuntime`. |
| `@awacloud/fw/core/logger` | `LoggerAPI`, `LogEntry`, `LogSubscriber`. |
| `@awacloud/fw/core/readyState` | `ReadyStateAPI`. |
| `@awacloud/fw/core/modules` | Default export typed as `ModuleDefinition[]` (the catalogue). No named exports. |
| `@awacloud/fw/config` | `fw.config.json` — pure data (presets + side-bundles). Import as JSON. |
| `@awacloud/fw/typed` | `asTyped(runtime)` + `createRuntime(modules?)` → `TypedModuleRuntime` (name-narrowed `resolve`), `InstanceOf<M>`, `ModuleInstanceMap`, `ModuleName`. |
| `@awacloud/fw/vite` | `FwPluginOptions`, default export plugin factory. |

## Recommended `tsconfig.json`

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "skipLibCheck": true,
        "lib": ["ES2022", "DOM"]
    }
}
```

`moduleResolution: "bundler"` is required for the conditional-exports map of `@awacloud/fw` to resolve correctly. With `"node16"` you must enable `--experimental-conditional-exports` flags on Node and stay within paths that don't depend on the `"browser"` condition.

## Typed module resolution

There are three ways to type a `resolve` call, from zero-setup to fully automatic. They all bottom out in the **factory return type** captured in each emitted `dist/types/<path>/<mod>.d.ts` — so improving a module's JSDoc improves every tier at once.

### Tier 1 — generic parameter (zero setup)

`runtime.resolve<T>(spec)` is generic — pass the expected instance type :

```ts
import fw from '@awacloud/fw';

interface HexCodec {
    fromBytes(b: Uint8Array): string;
    toBytes(s: string): Uint8Array;
    test(s: string): boolean;
}

const hex = fw.runtime.resolve<HexCodec>('hex');
```

### Tier 1bis — derive the type instead of restating it

The instance type already lives in the emitted declaration. Pull it out with
`InstanceOf` (exported from both `@awacloud/fw/core/runtime` and `@awacloud/fw/typed`)
rather than hand-writing the interface :

```ts
import type { InstanceOf } from '@awacloud/fw/typed';
import { hex } from '@awacloud/fw/io/codec/hex.js';

type HexCodec = InstanceOf<typeof hex>;          // = ReturnType<typeof hex.factory>
const codec = fw.runtime.resolve<HexCodec>('hex');
```

### Tier 2 — automatic narrowing via `@awacloud/fw/typed`

`asTyped(runtime)` re-types an existing runtime so `resolve(name)` and
`resolveAll([...names])` narrow **by module name** — no type parameter, no
import of the module value :

```ts
import fw from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';
import { asTyped } from '@awacloud/fw/typed';

fw.runtime.registerAll(modules);
const rt = asTyped(fw.runtime);

const hex = rt.resolve('hex');                   // HexCodec — inferred
const { sha256, hmac } = rt.resolveAll(['sha256', 'hmac']);  // both typed
rt.resolve('hex@1.0.0');                         // unknown — version specs fall back
```

`asTyped` is an identity function at runtime (zero cost) — it only changes the
static view, and pulls **nothing** into your bundle (the name→type map is all
`import type` / `typeof import(...)`, fully erased before bundling). The map is
generated into `types/registry.generated.d.ts` by `bun run types:registry`,
which must run after `bun run types` (it references the emitted `dist/types/`
declarations). Both are wired into `prepack`.

> The narrowing is only as precise as the underlying factory return types.
> A module whose factory infers `any` will resolve to `any` here — which is
> why Tier 2 is worth enabling **after** the JSDoc pass below, not before.

For a **standalone composition** (no `@awacloud/fw` bundle, no Vite — just a runtime
built à la carte in a TS project), `createRuntime` is the one-liner counterpart.
It news up a `ModuleRuntime`, deep-registers the modules you pass (transitive
`deps` included), and returns it already typed :

```ts
import { createRuntime } from '@awacloud/fw/typed';
import { hex } from '@awacloud/fw/io/codec/hex.js';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';

const rt = createRuntime([hex, sanitize]);   // tree-shakable, deep-registered
const codec = rt.resolve('hex');             // HexAPI — inferred
```

This mirrors the autonomous `tools/fw-bundler` (`standalone`) output (a single self-contained
module) but at the type level, for bundler-driven TS projects.

> **Narrowing caveat (both `asTyped` and `createRuntime`)** — `resolve` is typed
> against the *full* catalog, not the subset you registered. Module `name` is
> `string` in the emitted declarations (not a literal), so the registered set
> can't be tracked at the type level. `createRuntime([hex]).resolve('sha256')`
> type-checks as `Sha256API` but throws `Module not found` at runtime. Only
> `resolve(name)` for modules you actually injected.

### Tier 2bis — transparent narrowing with the Vite plugin

If you build through `@awacloud/fw/vite`, you don't even call `asTyped`. Add the
ambient reference once (in any `.ts` of your project, typically a
`vite-env.d.ts`) :

```ts
/// <reference types="@awacloud/fw/vite-env" />
```

Then the `runtime` exported by a preset virtual module is already a
`TypedModuleRuntime` :

```ts
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';

const hex = runtime.resolve('hex');   // narrowed — no asTyped, no <T>
```

This is a fresh ambient module declaration (no overload merging), so it is
robust — unlike a global augmentation of `ModuleRuntime.resolve`, which would
be defeated by overload ordering and is intentionally **not** shipped.

### Improving the underlying type (all tiers)

Module-specific narrowing is driven by JSDoc on the factory's return type :
when a module's source declares `@returns {HexCodec}` (with a matching
`@typedef`), that type flows into `dist/types/io/codec/hex.d.ts` and from there
into every tier above. Until a module's JSDoc is tightened, its entry degrades
gracefully to the inferred (often looser) shape.

After changing any module's factory signature, regenerate the registry :

```sh
bun run types          # tsc → dist/types/**.d.ts
bun run types:registry # → types/registry.generated.d.ts
```

`bun run types:registry:check` fails if the registry is stale (use in CI).

## Writing a module in TypeScript

You can author modules in TypeScript provided the compiled JavaScript output preserves the factory shape for worker serialisation:

```ts
import type { ModuleDefinition } from '@awacloud/fw/core/runtime';

interface MyCodec {
    encode(s: string): Uint8Array;
}

export const myCodec: ModuleDefinition<readonly [], MyCodec> = {
    name: 'myCodec',
    version: '1.0.0',
    type: 'lib.io.codec',
    dependencies: [],
    factory: function () {
        return {
            encode(s: string) { return new TextEncoder().encode(s); }
        };
    }
};
```

### ⚠️ Worker-serialisation pitfall

`runtime.serialize()` calls `factory.toString()` and ships the source string to a Worker. The Worker has no module loader — it executes the stringified factory in a clean scope. So **the compiled factory must remain self-contained** :

- ❌ Do not use `async` / `await` in the factory body (or anywhere reachable from it) — TypeScript injects an `__awaiter` helper at file scope that the Worker won't see.
- ❌ Do not use decorators — they inject `__decorate` helpers.
- ❌ Do not use TypeScript `import helpers` (`importHelpers: true`) or `tslib` runtime helpers.
- ✅ Compile with `target: "ES2022"` (or higher), `useDefineForClassFields: false`, `importHelpers: false`.
- ✅ Verify with `console.log(myModule.factory.toString())` that the output is plain JavaScript with no `__awaiter`, `__decorate`, `tslib_*` references.

The runtime itself (`runtime.js`) and its serialised companion `runtimeSource`
stay in plain JavaScript precisely for this reason. Its `.d.ts` lives in
`dist/types/core/runtime.d.ts`, generated from JSDoc.

## Per-module narrow types

Today `dist/types/core/modules.d.ts` types every catalogue entry as the
generic `ModuleDefinition` (functional but loose). Tighter types are added
module-by-module by improving the JSDoc on each module's factory return
type — `tsc` then emits a precise declaration into `dist/types/<path>/<name>.d.ts`.
No companion `.d.ts` files live in `src/`.

Until a module's JSDoc is tightened, fall back to the generic resolver type
parameter (`resolve<HexCodec>('hex')`).
