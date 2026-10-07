---
module: tableMvar
category: table/mvar
dependencies: [fontErrors, fontReader, fontTag]
returns: object
worker-safe: true
status: complete
---

# tableMvar

> Table `MVAR` — Metrics Variations (OT §10.6.7).

**Module** `tableMvar` | **Source** `packages/front/office/fonts/src/table/mvar.js` | **Deps** `fontErrors`, `fontReader`, `fontTag` | **Worker-safe** yes

Deltas for named metrics (`hasc`, `hdsc`, `cpht`, …) as a function of axis location. Each value-record carries a tag + an IVS index (outer/inner).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseMvar` | function | `(bytes) => { majorVersion, minorVersion, valueRecordSize, valueRecordCount, records: { valueTag, deltaSetOuterIndex, deltaSetInnerIndex }[], itemVariationStoreBytes }`. |
| `tableMvar` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseMvar } = fw.runtime.resolve('tableMvar');
const mvar = parseMvar(sfnt.tables.MVAR.bytes);
```

## Notes

- `valueRecordSize` is read from the table but not validated against the spec's `8` — a non-conforming value is accepted as-is.
- The `ItemVariationStore` is not decoded: to apply a delta, resolve it yourself from `itemVariationStoreBytes`.

## See also

- [hvar](./hvar.md) [fvar](./fvar.md) [os2](./os2.md)
