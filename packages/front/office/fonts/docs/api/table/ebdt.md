---
module: tableEbdt
category: table/ebdt
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableEbdt

> Table `EBDT` — Embedded Bitmap Data (OT §8.4).

**Module** `tableEbdt` | **Source** `packages/front/office/fonts/src/table/ebdt.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Monochrome counterpart of [cbdt](./cbdt.md), with an identical layout. The table holds the bitmap glyph data; where each glyph's record sits is described by [eblc](./eblc.md), so a consumer joins the two tables itself.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseEbdt` | function | `(bytes: Uint8Array) => { majorVersion, minorVersion, getRaw }`. `getRaw(offset, length)` returns a `Uint8Array` view of that byte range, or `null` when `offset + length` exceeds the table. |
| `tableEbdt` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSfnt } = fw.runtime.resolve('fontSfnt');
const { parseEbdt } = fw.runtime.resolve('tableEbdt');

const sfnt = parseSfnt(bytes);   // bytes: Uint8Array of a font with EBDT + EBLC
const ebdt = parseEbdt(sfnt.tables.EBDT.bytes);
// offset / length come from an EBLC index subtable
const glyphData = ebdt.getRaw(offset, length);
```

## Notes

- Only the version header is decoded. No glyph image format is interpreted: every glyph record is returned as raw bytes through `getRaw`, whatever its image format.
- `getRaw` returns a zero-copy view over the table bytes and performs only the upper-bound check; it does not validate a negative `offset`.
- Errors (all `ParseError`): `fonts/ebdt-short` (fewer than 4 bytes), `fonts/ebdt-version` (major version is neither 2 nor 3).

## See also

- [eblc](./eblc.md) — locates the bitmaps stored here
- [ebsc](./ebsc.md) — strikes obtained by scaling
- [cbdt](./cbdt.md) — color bitmap data counterpart
- [cblc](./cblc.md) — color bitmap location counterpart
