---
module: aatLcar
category: extra/apple-aat/lcar
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# aatLcar

> Table `lcar` — Ligature Caret (Apple TT RM06).

**Module** `aatLcar` | **Source** `packages/front/office/fonts/src/extra/apple-aat/lcar.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Caret positions inside a ligature glyph, for placing an insertion point between components. `format=0` = em-square division points; `format=1` = control-point indices.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseLcar` | function | `(bytes) => { version, format, lookupFormat, lookupBytes, bytes }` — `lookupFormat` and `bytes` (the full input, subarrayed from offset 0) were missing from a previous revision of this page (`lcar.js` lines 21–47). |
| `readCaretBlock` | function | `(bytes, offset) => number[]` — an array of `int16` caret positions, **not** `{ count, carets }` (`lcar.js` lines 49–61: `return out;`). |
| `aatLcar` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseLcar, readCaretBlock } = fw.runtime.resolve('aatLcar');
const lcar = parseLcar(sfnt.tables.lcar.bytes);
```

## Notes

- The AAT lookup table (`lookupFormat`/`lookupBytes`) needed to resolve `gid → caret block` is not decoded, and no `parsed`/`reason` field signals this — see [`./README.md`](./README.md).
- Requires the `fonts-apple-aat` bundle.

## See also

- [ankr](./ankr.md)
