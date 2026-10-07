---
module: tableCbdt
category: table/cbdt
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableCbdt

> Table `CBDT` — Color Bitmap Data (OT §8.6).

**Module** `tableCbdt` | **Source** `packages/front/office/fonts/src/table/cbdt.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Companion of `CBLC`. Stores per-glyph color bitmaps (formats 17/18/19 = PNG). This module exposes only the header + a raw-bytes accessor; individual glyph pulls go through `CBLC`'s offsets.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseCbdt` | function | `(bytes) => { majorVersion, minorVersion, getRaw(offset, length) }`. `getRaw` returns a `Uint8Array` view or `null` if out of range. |
| `tableCbdt` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseCbdt } = fw.runtime.resolve('tableCbdt');
const cbdt = parseCbdt(sfnt.tables.CBDT.bytes);
```

## Notes

- Supported versions: 2 and 3.
- Coupled access with `CBLC` is left to the consumer (read by offset via `getRaw`).

## See also

- [cblc](./cblc.md) [sbix](./sbix.md) [colr](./colr.md)
