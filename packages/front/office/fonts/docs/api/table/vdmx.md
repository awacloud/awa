---
module: tableVdmx
category: table/vdmx
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableVdmx

> Table `VDMX` — vertical device metrics (OT §6.4.20).

**Module** `tableVdmx` | **Source** `packages/front/office/fonts/src/table/vdmx.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Provides yMin/yMax per ppem for line-height calculation on Windows.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseVdmx` | function | `(bytes) => { version, numRecords, numRatios, ratRanges, offsets }`. |
| `tableVdmx` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseVdmx } = fw.runtime.resolve('tableVdmx');
const vdmx = parseVdmx(sfnt.tables.VDMX.bytes);
```

## Notes

- Only the header + ratios + offsets are decoded. The vTable groups are left to the application.
- Mainly useful for legacy GDI fidelity.

## See also

- [hdmx](./hdmx.md) — horizontal counterpart
- [os2](./os2.md) — default vertical metrics
