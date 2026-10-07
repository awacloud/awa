---
module: registerDefaultFaces
category: office/oconv-fonts
dependencies: []
returns: promise
worker-safe: false
status: complete
---

# registerDefaultFaces

> Loads the default faces and registers the `oconvDefaultFaces` descriptor
> on an `@awacloud/fw` `ModuleRuntime`.

**Module** `registerDefaultFaces` | **Source**
`packages/front/office/oconv-fonts/src/loader.js` | **Deps** none |
**Worker-safe** no — see [Worker Usage](../descriptor.md#worker-usage) in
the frozen contract

This function is the composed load-then-register helper documented in full
in [`../descriptor.md`](../descriptor.md) — this page states its signature,
params, return and throws only; it does **not** re-derive the
per-style-class precedence rule, which lives solely in the frozen contract.

## Resolve

```js
import { registerDefaultFaces } from '@awacloud/oconv-fonts';
```

## Signature

```
registerDefaultFaces(runtime: {register: Function}, opts?: { baseUrl?: string | URL }) => Promise<*>
```

## Parameters

| Param | Type | Description |
|---|---|---|
| `runtime` | `{register: Function}` | An `@awacloud/fw` `ModuleRuntime`. |
| `opts` | `{baseUrl?: string\|URL}` (optional) | Forwarded to [`loadDefaultFaces`](./load-default-faces.md). |

## Returns

`Promise<*>` — what `runtime.register` returns (the runtime, chainable):
`runtime.register(createOconvDefaultFaces(await loadDefaultFaces(opts)))`.

## Throws

- `Error` — any [`loadDefaultFaces`](./load-default-faces.md) error (``
  `oconv-fonts: cannot load <url> (...)` ``); the descriptor is not
  registered when loading fails.

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const runtime = new ModuleRuntime();
await registerDefaultFaces(runtime);          // fetches the 5 vendored faces the
                                               // default route uses and registers
                                               // the 'oconvDefaultFaces' descriptor

const api = runtime.resolve('oconvDefaultFaces');
// { defaultFaces, family: 'Liberation', release: '2.1.5' }
```

Registering twice does not hot-swap a cached instance by itself —
see [`../descriptor.md`](../descriptor.md) and the package
[README](../../README.md#registering-twice) for the host rule
(`invalidate('oconvDefaultFaces', { cascade: true })` after re-registering).

## See also

- [`../descriptor.md`](../descriptor.md) — the frozen `oconvDefaultFaces`
  contract: resolved API, frozen surface, the per-style-class precedence
  rule `explicit opts.pdf.fonts[<class>] > default map[<class>] >
  Standard 14`, the default map being a posted `defaultFaces` map (which
  wins whole) else the registered `oconvDefaultFaces`, and worked examples.
- [`load-default-faces`](./load-default-faces.md) — the byte path this
  function calls before registering.
- [`create-oconv-default-faces`](./create-oconv-default-faces.md) — the
  descriptor builder this function calls with the loaded bytes.
- [`./README.md`](./README.md) — the API index.
