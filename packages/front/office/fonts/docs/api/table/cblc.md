---
module: tableCblc
category: table/cblc
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableCblc

> Table `CBLC` — Color Bitmap Location (OT §8.6).

**Module** `tableCblc` | **Source** `packages/front/office/fonts/src/table/cblc.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Locates bitmap entries in `CBDT`. Layout shared with EBLC (monochrome): a 48-byte `bitmapSizeTable` per strike.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseCblc` | function | `(bytes) => { majorVersion, minorVersion, sizes: BitmapSizeTable[] }`. |
| `tableCblc` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseCblc } = fw.runtime.resolve('tableCblc');
const cblc = parseCblc(sfnt.tables.CBLC.bytes);
console.log(cblc.sizes[0].ppemX);
```

## Notes

- `sbitLineMetrics` (12 bytes) decoded for both horizontal and vertical.
- The `indexSubTables` (internal offset) are left to the consumer to load.

## See also

- [cbdt](./cbdt.md)
