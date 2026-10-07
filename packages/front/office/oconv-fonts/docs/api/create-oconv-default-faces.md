---
module: createOconvDefaultFaces
category: office/oconv-fonts
dependencies: []
returns: object
worker-safe: false
status: complete
---

# createOconvDefaultFaces

> Builds the frozen `oconvDefaultFaces` fw module descriptor around a
> validated, frozen face map.

**Module** `createOconvDefaultFaces` | **Source**
`packages/front/office/oconv-fonts/src/faces.js` | **Deps** none |
**Worker-safe** no — see [Worker Usage](../descriptor.md#worker-usage) in the
frozen contract

This function is the builder side of the frozen default-face surface,
documented in full in [`../descriptor.md`](../descriptor.md) — this page states its
signature, params, return and throws only; it does **not** re-derive the
per-style-class precedence rule, which lives solely in the frozen contract.

## Resolve

```js
import { createOconvDefaultFaces } from '@awacloud/oconv-fonts';
```

## Signature

```
createOconvDefaultFaces(faces: OconvDefaultFaceMap) => Descriptor
```

## Parameters

| Param | Type | Description |
|---|---|---|
| `faces` | `OconvDefaultFaceMap` | Five whole font programs, keyed `regular \| bold \| italic \| boldItalic \| mono` (the spelling of `oconv`'s `FONT_OPT_KEY` values). |

`OconvDefaultFaceMap` = `{ regular, bold, italic, boldItalic, mono }`, each a
`Uint8Array`.

## Returns

`{name: 'oconvDefaultFaces', version: string, dependencies: [], deps: [], factory: Function}`

The resolved API the descriptor's `factory()` produces is
`{ defaultFaces, family: 'Liberation', release: '2.1.5' }`, where
`defaultFaces()` returns the frozen face map — see
[the frozen surface](../descriptor.md#frozen-surface) for the full,
immutable shape.

## Throws

- `Error` — `` `oconv-fonts: bad faces <key>` `` on an unknown key, a
  missing key or a non-`Uint8Array` value. A non-object input reports the
  first required key (`regular`).

(Both cases are the JSDoc-documented behaviour of the internal `freezeFaces`
helper this function delegates validation to; `freezeFaces` itself has no
page — it is not exported.)

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { createOconvDefaultFaces, loadDefaultFaces } from '@awacloud/oconv-fonts';

const faces = await loadDefaultFaces();
const descriptor = createOconvDefaultFaces(faces);
// descriptor.name === 'oconvDefaultFaces'

const runtime = new ModuleRuntime();
runtime.register(descriptor);
```

A bad map throws immediately, before any registration:

```js
import { createOconvDefaultFaces } from '@awacloud/oconv-fonts';

try {
    createOconvDefaultFaces({ regular: 'not-bytes' });
} catch (err) {
    console.log(err.message);   // 'oconv-fonts: bad faces regular'
}
```

## See also

- [`../descriptor.md`](../descriptor.md) — the frozen `oconvDefaultFaces`
  contract: resolved API, frozen surface, the per-style-class precedence
  rule `explicit opts.pdf.fonts[<class>] > default map[<class>] >
  Standard 14`, the default map being a posted `defaultFaces` map (which
  wins whole) else the registered `oconvDefaultFaces`, and worked examples.
- [`register-default-faces`](./register-default-faces.md) — the composed
  helper that calls this function after loading the bytes.
- [`./README.md`](./README.md) — the API index.
