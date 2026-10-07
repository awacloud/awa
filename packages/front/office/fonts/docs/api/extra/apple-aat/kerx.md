---
module: aatKerx
category: extra/apple-aat/kerx
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# aatKerx

> Table `kerx` — Extended Kerning (Apple TT RM06).

**Module** `aatKerx` | **Source** `packages/front/office/fonts/src/extra/apple-aat/kerx.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Successor to `kern` for AAT: 32-bit lengths, extended coverage, formats 4 (anchor-point) and 6 (full lookup). Format 0 (sorted pairs) is decoded inline; formats 1/2/4/6 are kept raw.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseKerx` | function | `(bytes) => { version, nTables, tables }`. Every `tables[i]` shares `{ length, coverage, format, vertical, crossStream, variation, tupleCount, parsed }`. Format 0 subtables add `{ pairs: {left,right,value}[], map: Map, kern(l,r) => number, parsed: true }`. Formats 1/2/4/6 add `{ body: Uint8Array, parsed: false }`; any other format additionally sets `unknown: true` (`kerx.js` lines 46–105). |
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

- Non-format-0 subtables carry `{ format, coverage, tupleCount, body }` — the raw bytes field is named `body`, not `bytes` (`kerx.js` line 73).
- Requires the `fonts-apple-aat` bundle.

## See also

- [../../table/kern](../../table/kern.md) [morx](./morx.md) [ankr](./ankr.md)
