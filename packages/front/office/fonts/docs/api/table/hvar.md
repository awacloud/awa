---
module: tableHvar
category: table/hvar
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableHvar

> Table `HVAR` — Horizontal Metrics Variations (OT §10.6.6).

**Module** `tableHvar` | **Source** `packages/front/office/fonts/src/table/hvar.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Deltas to apply to `hmtx.advanceWidth` / `lsb` / `rsb` depending on axis location. The `ItemVariationStore` table (deltas shared per region) is kept as raw bytes and not decoded.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseHvar` | function | `(bytes) => { majorVersion, minorVersion, itemVariationStoreOffset, advanceWidthMappingOffset, lsbMappingOffset, rsbMappingOffset, itemVariationStoreBytes }`. |
| `tableHvar` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseHvar } = fw.runtime.resolve('tableHvar');
const hvar = parseHvar(sfnt.tables.HVAR.bytes);
```

## Notes

- If a mapping offset is 0, the delta-set index is directly the glyph ID.
- The `ItemVariationStore` is not decoded: only its raw bytes (`itemVariationStoreBytes`) are returned, so applying the deltas is up to the caller.

## See also

- [hmtx](./hmtx.md) [mvar](./mvar.md)
