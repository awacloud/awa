---
module: tableKern
category: table/kern
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableKern

> Table `kern` — legacy Kerning (OT §6.4.14 / TT RM02), MS and Apple.

**Module** `tableKern` | **Source** `packages/front/office/fonts/src/table/kern.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Supports both headers: Microsoft/OT (`version=0`, 16-bit subtables) and Apple TrueType (`version=1.0`, 32-bit subtables). Format 0 (sorted `(leftGid, rightGid, value)` pairs) is decoded inline.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseKern` | function | `(bytes: Uint8Array) => { version, tables: Subtable[] }`. |
| `tableKern` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseKern } = fw.runtime.resolve('tableKern');
const kern = parseKern(sfnt.tables.kern.bytes);
for (const sub of kern.tables) if (sub.format === 0) console.log(sub.pairs);
```

## Notes

- Prefer GPOS Type 2 (`kern` feature) on modern fonts.
- Non-format-0 subtables (1/2/3) are skipped, not captured — the parser only keeps `{ format, length, parsed: false }` for them; their bytes are not retained.

## See also

- [gpos](./gpos.md) — OT successor
- [extra/apple-aat/kerx](../extra/apple-aat/kerx.md) — AAT extension
