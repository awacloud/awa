# `tools/fw-codegen` (`registry`) — Type registry generator

## Purpose

Generates **`types/registry.generated.d.ts`**: the `module name → instance type` map that feeds the typed facade `@awacloud/fw/typed` (`asTyped`, `createRuntime`) and allows `resolve('hex')` to return a narrow type rather than `unknown`.

Each entry is of the form:

```ts
'hex': ReturnType<typeof import('../dist/types/io/codec/hex')['hex']['factory']>;
```

— no value import, no named `import type`: the instance type derives directly from the `.d.ts` declaration emitted by `tsc`. The quality of an entry = the quality of the factory's corresponding `@returns` (cf. [`audit.md`](./audit.md)).

## CLI usage

```sh
fw-codegen registry            # writes the registry
fw-codegen registry --check    # CI: exit ≠ 0 if the registry is stale
# or via npm scripts
bun run types:registry
bun run types:registry:check
```

| Flag         | Description |
| ------------ | ----------- |
| `--check`    | Does not rewrite; compares and fails if the content differs (CI guard). |

> **Order**: run **after** `bun run types` — the registry references declarations emitted in `dist/types/`. Both are chained in `prepack` (`types` → `types:registry` → `prebuild`).

## Example

```
[codegen-types] wrote types\registry.generated.d.ts (169 modules).
```

Consumption (cf. [TypeScript — Tier 2](../guide/typescript.md)):

```ts
import { createRuntime } from '@awacloud/fw/typed';
import { hex } from '@awacloud/fw/io/codec/hex.js';

const rt = createRuntime([hex]);
const codec = rt.resolve('hex');   // HexAPI — narrow, without <T>
```

## How it works

1. `scanAll` (via `tools/fw-bundler/src/modlib/scan-modules.js`) enumerates the modules under `src/`.
2. For each module (sorted by name), computes the relative path from `types/` to the emitted declaration `dist/types/<path>.d.ts` and emits a `ReturnType<typeof import(...)['<binding>']['factory']>` entry.
3. Writes `types/registry.generated.d.ts` (or, in `--check` mode, compares against the existing file).

The mapping is **stable with respect to internal typedef names**: it depends only on the module path and its exported binding, not on the name of the return `@typedef`. Renaming an internal typedef does not stale the registry; adding / removing / moving a module does.

## Narrowing caveat

`resolve` is typed against the **full catalogue**, not against the actually registered subset (the `name` field is `string` in the `.d.ts`, not a literal). `createRuntime([hex]).resolve('sha256')` type-checks as `Sha256API` but throws `Module not found` at runtime. Details in [TypeScript — Narrowing caveat](../guide/typescript.md).

## See also

- [`audit.md`](./audit.md) — verify `@returns` precision before relying on the registry.
- [TypeScript](../guide/typescript.md) — `asTyped`, `createRuntime`, `InstanceOf`, and the narrowing caveat.
- [`../../integrations/vite/README.md`](../../integrations/vite/README.md) — the transparent Vite-side variant (`vite-env`).
- [`../README.md`](../README.md) — general fw doc index.
