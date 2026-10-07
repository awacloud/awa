---
module: tablePost
category: table/post
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tablePost

> Table `post` — PostScript Information (OT §6.4.9), versions 1.0 / 2.0 / 3.0 / 4.0.

**Module** `tablePost` | **Source** `packages/front/office/fonts/src/table/post.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Versions:

- **1.0** — fixed header (32 bytes); glyph names implicitly = the Mac standard 258.
- **2.0** — header + `numGlyphs` index + pascal strings.
- **2.5** — **not supported** (deprecated, throws).
- **3.0** — header only, no glyph names.
- **4.0** — the version tag is recognised but decoding is **not implemented**: `parsePost` falls through with only the base header fields, no character-code array.

## Resolve

```js
const { parsePost, encodePost, MAC_GLYPH_NAMES } = runtime.resolve('tablePost');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parsePost` | `(bytes: Uint8Array, numGlyphs?: number) => PostTable` | `numGlyphs` required for v2.0. |
| `encodePost` | `(post: PostTable) => Uint8Array` | Emits the 32-byte header only, whatever `post.version` — glyph names are never encoded. |
| `MAC_GLYPH_NAMES` | `string[]` | The 258 standard Mac names (Apple TT Manual / OT spec post v1.0). |

### `PostTable`

`version: number` (decimal, e.g. `2.0`), `italicAngle`, `underlinePosition`, `underlineThickness`, `isFixedPitch`, `minMemType42`, `maxMemType42`, `minMemType1`, `maxMemType1`, `glyphNames?: string[]`.

## Examples

```js
const { parsePost } = runtime.resolve('tablePost');
const post = parsePost(sfnt.tables.post.bytes, maxp.numGlyphs);
console.log(post.version, post.glyphNames?.[42]);
```

## Notes

- v2.0 throws `'fonts/post-num-mismatch'` if the internal `numberOfGlyphs` differs from `maxp.numGlyphs`, and `'fonts/post-need-numGlyphs'` if `numGlyphs` was not passed.
- v2.5 throws `'fonts/post-v2-5-unsupported'` — no fallback.
- Indices `≥ 258` in v2.0 point to the custom pascal strings following the index table.
- v1.0 also accepts an optional `numGlyphs` to populate `glyphNames` (Mac standard names, `glyphN` beyond 258).
- v4.0 is recognised but its character-code array is not decoded — treat it as unsupported for `glyphNames`.

## See also

- [maxp](./maxp.md) — provides `numGlyphs`
- [fonts](../fonts.md) — `font.getGlyphByIndex` reads `post.glyphNames[gid]` there
