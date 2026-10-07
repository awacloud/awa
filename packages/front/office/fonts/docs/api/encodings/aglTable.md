---
module: encodingAglTable
category: encodings/aglTable
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingAglTable

> The Adobe Glyph List as a frozen data table — PostScript glyph name to Unicode code points.

**Module** `encodingAglTable` | **Source** `packages/front/office/fonts/src/encodings/aglTable.js` | **Deps** _(none)_ | **Worker-safe** yes

The data behind [agl](./agl.md): `encodingAgl` resolves glyph names through this table first, then falls back to its `uniXXXX` and `uXXXXXX` rules. The table is generated, never hand-edited, from the vendored `glyphlist.txt` of the `adobe-type-tools/agl-aglfn` repository (BSD-3-Clause, Copyright 2002-2019 Adobe) at a pinned commit; the attribution is carried in the package [NOTICE](../../../NOTICE).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `AGL_TABLE` | object | Frozen plain object mapping each glyph name to an array of Unicode code points (`{ [glyphName]: number[] }`). It holds 4281 entries; most map to a single code point, a few to a short sequence (up to four code points). |
| `lookup` | function | `(name: string) => number[] \| undefined` — the code-point array for an exact glyph name, or `undefined` when the name is not an own entry of `AGL_TABLE` (inherited keys such as `toString` do not match). Exact, case-sensitive match only. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { AGL_TABLE, lookup } = fw.runtime.resolve('encodingAglTable');

lookup('A');                   // [65]
lookup('ffi');                 // [64259]
lookup('not-a-glyph');         // undefined
Object.keys(AGL_TABLE).length; // 4281
```

## Notes

- `lookup` returns the stored array itself; treat it as read-only.
- Names that follow the `uniXXXX` / `uXXXXXX` conventions are not table entries; use [agl](./agl.md) (`glyphNameToUnicode`) to resolve them.
- The table is large (thousands of entries); resolve this module only where glyph-name resolution is needed.

## See also

- [agl](./agl.md) — glyph name to Unicode resolver built on this table
- [lookup](./lookup.md) — byte-to-glyph-name encoding dispatcher
