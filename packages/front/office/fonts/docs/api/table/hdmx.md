---
module: tableHdmx
category: table/hdmx
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableHdmx

> Table `hdmx` — pre-computed advance widths per ppem (OT §6.4.16).

**Module** `tableHdmx` | **Source** `packages/front/office/fonts/src/table/hdmx.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

For each listed ppem, gives the `maxWidth` and a `uint8` width array indexed by glyphID — avoids rounding on every render.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseHdmx` | function | `(bytes, numGlyphs) => { version, numRecords, sizeDeviceRecord, records }`. |
| `tableHdmx` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseHdmx } = fw.runtime.resolve('tableHdmx');
const hdmx = parseHdmx(sfnt.tables.hdmx.bytes, font.maxp.numGlyphs);
console.log(hdmx.records[0].widths[42]); // width of gid 42 at the 1st ppem
```

## Notes

- `numGlyphs` is required since it isn't stored in hdmx.
- `sizeDeviceRecord` includes padding; that alignment is respected between records.

## See also

- [maxp](./maxp.md) — provides `numGlyphs`
- [ltsh](./ltsh.md) — associated linearity threshold
