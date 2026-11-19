---
module: aatKerx
category: extra/apple-aat/kerx
dependencies: [fontErrors, fontReader, aatLookup]
returns: object
worker-safe: true
status: complete
---

# aatKerx

> Table `kerx` — Extended Kerning (Apple TT RM06).

**Module** `aatKerx` | **Source** `packages/front/office/fonts/src/extra/apple-aat/kerx.js` | **Deps** `fontErrors`, `fontReader`, `aatLookup` | **Worker-safe** yes

Successor to `kern` for AAT: 32-bit lengths, extended coverage, formats 4 (anchor-point) and 6 (full lookup). Every format is decoded, formats 1, 2, 4 and 6 through [`aatLookup`](./lookup.md); [`aatKerxEngine`](./kerx-engine.md) applies them.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseKerx` | function | `(bytes, opts?) => { version, nTables, tables }`. Every `tables[i]` shares `{ length, coverage, format, vertical, crossStream, variation, tupleCount, parsed }`. Format 0 adds `{ pairs: {left,right,value}[], map: Map, kern(l,r) }`. Formats 1, 2, 4 and 6 add `body: Uint8Array` and, with `parsed: true`: 1 `stateTable` (`data` is `[kernActionIndex]`) and `action(i)` (int16 from the state table's start); 2 `rowWidth` and `kern(l, r)` (the int16 at index left class + right class of the array; the lookups and the array at offsets from the subtable's start); 4 `stateTable` (`data` is `[ankrActionIndex]`), `actionType` (0 control points, 1 anchors, 2 coordinates) and `data(i)` (16-bit from the state table's start); 6 `long` and `kern(l, r)` (the value at row value + column value; int32 with flag 1). A reader gives `null`, a `kern` 0, past the subtable. Any other format sets `unknown: true`. `opts.numGlyphs` bounds a format 0 lookup. |
| `aatKerx` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseKerx } = fw.runtime.resolve('aatKerx');
const kerx = parseKerx(sfnt.tables.kerx.bytes);
```

## Notes

- Non-format-0 subtables carry `{ format, coverage, tupleCount, body }` — the raw bytes field is named `body`, not `bytes`.
- A format 1, 2, 4 or 6 body that does not decode keeps `parsed: false` and gains `error`, the `ParseError` code (`fonts/kerx-format-short`, `fonts/aat-*`); `parseKerx` does not throw for it.
- Format 2's class values and format 1's action index are read as indices into their arrays, as HarfBuzz reads them for `kerx`.
- Requires the `fonts-apple-aat` bundle.

## See also

- [../../table/kern](../../table/kern.md) [morx](./morx.md) [ankr](./ankr.md)
