---
module: layoutClassDefinitions
category: layout/classDefinitions
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# layoutClassDefinitions

> Coverage + ClassDef — GSUB/GPOS/GDEF indexing primitives (OT §6.2).

**Module** `layoutClassDefinitions` | **Source** `packages/front/office/fonts/src/layout/classDefinitions.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Two indexing tables used by every OpenType lookup:

- **Coverage**: glyph → coverage index (or null). Formats 1 (list) / 2 (ranges).
- **ClassDef**: glyph → class number uint16, default 0. Formats 1 (array) / 2 (ranges).

Each result exposes an ergonomic `lookup(gid)` helper.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseCoverage` | function | `(bytes) => { format, ..., lookup(gid) }`. |
| `parseClassDef` | function | `(bytes) => { format, ..., lookup(gid) }`. |
| `layoutClassDefinitions` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseCoverage } = fw.runtime.resolve('layoutClassDefinitions');
const cov = parseCoverage(subtableSlice);
const idx = cov.lookup(42); // null if not covered
```

## Notes

- Ranges are sorted — `lookup` uses a binary search.
- Unknown format → `ParseError` `fonts/coverage-format` / `fonts/classdef-format`.

## See also

- [table/gsub](../table/gsub.md) [table/gpos](../table/gpos.md) [table/gdef](../table/gdef.md)
