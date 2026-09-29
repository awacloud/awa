# `@awacloud/fw` — Deno

**Runtime target** (compat), not a plugin. `@awacloud/fw` being **zero-dependency ESM** built on **standard Web APIs**, it runs under Deno almost as-is. This page documents the compat and friction points. See also [`../nodejs/`](../nodejs/README.md) (same browser/server boundary).

## Why it aligns

- **Zero dependency** → nothing to resolve via npm for the core.
- **Web APIs** (`crypto.subtle`, `getRandomValues`, `TextEncoder`, `structuredClone`, `fetch`…) natively present under Deno.
- The **sanity layer** is standard Web JS (prototype freezing, API blocking) → works in a browser/Deno Worker context.

## Consumption

### Via `npm:` (post-publication)
```ts
import { hex } from 'npm:@awacloud/fw/io/codec/hex.js';
```

### Via import map (`deno.json`)
```jsonc
// deno.json — see the provided example
{ "imports": { "@awacloud/fw": "npm:@awacloud/fw", "@awacloud/fw/": "npm:/@awacloud/fw/" } }
```
```ts
import { ModuleRuntime } from '@awacloud/fw/core/runtime';
import { hex } from '@awacloud/fw/io/codec/hex.js';
```

## Smoke test

[`check-deno.ts`](https://github.com/awacloud/awa/blob/main/packages/front/fw/integrations/deno/check-deno.ts) runs a few worker-safe modules (hex, utf8, sha256) under Deno:
```sh
deno run --allow-read integrations/deno/check-deno.ts
```
In-repo it imports `../../src` directly (no need to publish). Logic validated under Node/bun; **requires Deno** for the actual run.

## Boundary & friction

| Topic | Status under Deno |
|---|---|
| Worker-safe modules (crypto, io/codec, io/compress, io/math, process, valid…) | ✅ run as-is |
| `dom/*` + `sanity` modules | ⛔ **browser-only** — do not resolve server-side under Deno (same boundary as Node) |
| **Serialized Worker** (`runtime.serialize()` → `new Worker(url, { type: 'module' })`) | ⚠️ **to validate as a priority** — Web-standard so likely fine, but the Deno Worker context ≠ browser. This is the core of the fw model. |
| **Build** (`dist/build/*`) | Consume pre-built bundles. Building *under* Deno = via `esbuild` npm + `esbuild_deno_loader` (not targeted by default) — `Bun.build` unavailable. |
| **Tests** | `deno test` has its own API **without `expect()`** → the `bun:test` shim does not map. Use **[Vitest](../vitest/README.md)** (Deno can run Vitest via npm compat) rather than a `Deno.test` port. |
| **Permissions** | crypto/io access neither the FS nor the network → few `--allow-*` flags needed. Document per use case. |

## Open questions

- **Serialized Worker under Deno**: the only real technical risk — to test once Deno is in the loop.
- **JSR**: publish on the Deno registry (JSR) too? Out of scope until npm publication is done.
- Depends on **publishing** `npm:@awacloud/fw` for the simplest path (otherwise import map → source/CDN).

## Status

Compat **documented + smoke test provided**. Real runtime validation (and especially Worker serialization) **pending a Deno environment**.
