# OpenType tables

One factory per OT table. Each module exposes `parse<Name>` and, for the tables that can be written, `encode<Name>` (encoding is limited to simple signatures; `glyf` is read-only).

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [head](./head.md) | `{parseHead, encodeHead, HEAD_MAGIC}` | `fontErrors`, `fontReader`, `fontWriter` | Font Header (54 fixed bytes). |
| [hhea](./hhea.md) | `{parseHhea, encodeHhea}` | `fontErrors`, `fontReader`, `fontWriter` | Horizontal Header (36 bytes). |
| [maxp](./maxp.md) | `{parseMaxp, encodeMaxp, ...}` | `fontErrors`, `fontReader`, `fontWriter` | Maximum Profile v0.5 / v1.0. |
| [hmtx](./hmtx.md) | `{parseHmtx, encodeHmtx}` | `fontErrors`, `fontReader`, `fontWriter` | Horizontal Metrics (compacted tail). |
| [cmap](./cmap.md) | `{parseCmap, pickUnicodeMap}` | `fontErrors`, `fontReader`, `tableCmapFormats` | Char→Glyph, formats 0/4/6/12. |
| [name](./name.md) | `{parseName, encodeName, getNameString, ...}` | `fontErrors`, `fontReader`, `fontWriter`, `fontEncoding` | Naming Table (format 0/1). |
| [os2](./os2.md) | `{parseOs2, encodeOs2}` | `fontErrors`, `fontReader`, `fontWriter` | OS/2 Metrics (v0–v5). |
| [post](./post.md) | `{parsePost, encodePost, MAC_GLYPH_NAMES}` | `fontErrors`, `fontReader`, `fontWriter` | PostScript Info (v1/v2/v3/v4). |
| [loca](./loca.md) | `{parseLoca, encodeLoca}` | `fontErrors`, `fontReader`, `fontWriter` | Index to Location (short/long). |
| [glyf](./glyf.md) | `{parseGlyph, parseGlyf, ...}` | `fontErrors`, `fontReader` | Glyph Data (simple + composite). |

## Common pattern

```js
const { parseHead } = runtime.resolve('tableHead');
const head = parseHead(sfnt.tables.head.bytes);
```
