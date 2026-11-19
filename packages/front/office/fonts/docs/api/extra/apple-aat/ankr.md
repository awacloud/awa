---
module: aatAnkr
category: extra/apple-aat/ankr
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# aatAnkr

> Table `ankr` — Anchor Points (Apple TT RM06).

**Module** `aatAnkr` | **Source** `packages/front/office/fonts/src/extra/apple-aat/ankr.js` | **Deps** `fontErrors`, `fontReader`, `aatLookup` | **Worker-safe** yes

Per-glyph anchor coordinates that `kerx` format 4 references. Header + lookup table (glyph → offset of its anchor block, decoded through [`aatLookup`](./lookup.md) by `anchors`) + glyph data blocks.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseAnkr` | function | `(bytes, opts?) => { version, flags, lookupTableOffset, glyphDataTableOffset, lookupFormat, lookupBytes, glyphDataBytes, anchors(glyph) }`; `anchors(glyph)` gives the glyph's anchor points `[{ x, y }]`, `[]` when it has none or its lookup or block does not decode. `opts.numGlyphs` bounds a format 0 lookup. |
| `readAnchorBlock` | function | `(glyphDataBytes, offset) => Array<{x,y}>` — a plain array, **not** `{ numAnchors, anchors }` (`ankr.js` lines 86–98: `return out;`, where `out` is the anchor array itself). |
| `aatAnkr` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseAnkr, readAnchorBlock } = fw.runtime.resolve('aatAnkr');
const ankr = parseAnkr(sfnt.tables.ankr.bytes);
```

## Notes

- The lookup is decoded on the first `anchors` call.
- Requires the `fonts-apple-aat` bundle.

## See also

- [kerx](./kerx.md) [lcar](./lcar.md)
