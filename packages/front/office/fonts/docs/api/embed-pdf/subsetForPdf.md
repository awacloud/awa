---
module: embedSubsetForPdf
category: embed-pdf/subsetForPdf
dependencies: [fontErrors, fontSfnt, tableHead, tableHhea, tableMaxp, tableHmtx, tableLoca, embedFontDescriptor, cmapToUnicode, fontWriter, embedClosure, embedCmapBuilder, embedGlyphRewriter, embedHash]
returns: object
worker-safe: true
status: complete
---

# embedSubsetForPdf

> Minimal TrueType subset for PDF Type0 / FontFile2 embedding.

**Module** `embedSubsetForPdf` | **Source** `packages/front/office/fonts/src/embed-pdf/subsetForPdf.js` | **Deps** `fontErrors`, `fontSfnt`, `tableHead`, `tableHhea`, `tableMaxp`, `tableHmtx`, `tableLoca`, `embedFontDescriptor`, `cmapToUnicode`, `fontWriter`, plus the sibling sub-modules `embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`, `embedHash` | **Worker-safe** yes

Computes the composite-glyph closure covering a set of code points, renumbers gids, re-encodes `glyf`/`loca`/`hmtx`/`cmap`/`post`/`name`/`head`, and also produces the FontDescriptor + ToUnicode CMap for the PDF Font dictionary.

Rewritten tables (vs. a verbatim copy of the source font's bytes):

- `glyf`, `loca`, `hmtx`, `cmap`, `head`, `hhea`, `maxp` — recomputed for the renumbered/reduced glyph set (see Algorithm above).
- `post` — the 32-byte header is preserved bit-for-bit for the fields shared across versions (italicAngle, underline, isFixedPitch, memory hints); the version tag itself is forced to `3.0` (no glyph names) unless the source is already `3.0`, in which case the whole table is copied verbatim. A source `post` shorter than 32 bytes, or absent, yields no `post` table in the subset.
- `name`, `OS/2` — copied verbatim from the source font (unmodified).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `subsetForPdf` | function | `(font, codePoints, opts?) => { subsetBytes, gidMap, glyphMap, encoding, widths, toUnicodeCmap, postScriptName, fontDescriptor }`. |
| `embedSubsetForPdf` | factory | Factory. |

## Usage

`embedSubsetForPdf` depends on four sub-modules (`embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`, `embedHash`). The package's `modules` array registers all four, placed before `embedSubsetForPdf`, so a runtime seeded with `fw_require` and `modules` resolves it with no further registration:

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const font = fw.runtime.resolve('fonts').read(bytes);   // bytes: Uint8Array of a TrueType font
const { subsetForPdf } = fw.runtime.resolve('embedSubsetForPdf');
const subset = subsetForPdf(font, new Set([0x41, 0x42, 0x4F]));
// subset.subsetBytes ready for FontFile2
```

## Notes

- `gid 0` (.notdef) is always kept.
- A deterministic 6-letter prefix (e.g. `ABCDEF+`) is added to the PostScript name per PDF convention.
- Composites are recursively expanded before renumbering.
- `encoding` is always `null` — Type0/Identity-H addressing goes through the rebuilt `cmap`, not a PDF `/Encoding` entry.
- `widths` is a per-new-gid advance-width array, in the same order as the renumbered glyphs (suitable for the PDF `/W` entry).
- A font without `glyf` / `loca` tables (for example a CFF-flavoured OpenType font) is rejected with `ContractError('fonts/subset-bad-font')`; variable-font tables and the GSUB/GPOS layout tables are not carried through to the subset.
- A source `post` table is never copied verbatim unless it is already version 3.0: a v1.0/v2.0/v4.0 `post` carries glyph-name data keyed to the SOURCE font's gid count/order, which the subset's renumbered/reduced glyph set invalidates — `fonts.read()` on the resulting bytes would otherwise throw `fonts/post-num-mismatch`.

## See also

- [fontDescriptor](./fontDescriptor.md) [cidSystemInfo](./cidSystemInfo.md) [toUnicodeBuilder](./toUnicodeBuilder.md)
