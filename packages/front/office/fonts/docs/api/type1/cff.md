---
module: fontCffProgram
category: type1/cff
dependencies: [fontErrors, tableCff, encodingStandard]
returns: object
worker-safe: true
status: complete
---

# fontCffProgram

> A bare CFF program read as a font.

**Module** `fontCffProgram` | **Source** `packages/front/office/fonts/src/type1/cff.js` | **Deps** `fontErrors`, `tableCff`, `encodingStandard` | **Worker-safe** yes

Reads CFF data outside an sfnt: a PDF `/FontFile3` stream of subtype `Type1C` or `CIDFontType0C` (ISO 32000-2 §9.9). It reads the first font of the CFF through [`tableCff.parseCff`](../table/cff.md); a PDF program holds one font.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `readCff` | function | `(bytes) => CffFont`. |
| `fontCffProgram` | factory | Factory. |

`CffFont`:

| Member | Description |
|--------|-------------|
| `fontName` | The Name INDEX entry. |
| `fontMatrix`, `fontBBox` | The Top DICT's (default `[0.001 0 0 0.001 0 0]`; `[0 0 0 0]`). |
| `cidKeyed` | True for a CID-keyed font (its Top DICT has `ROS`). |
| `encoding` | A name-keyed font's built-in encoding: 256 glyph names, `null` for an empty slot (see [`tableCff`](../table/cff.md)); `null` for a CID-keyed font. |
| `glyphNames` | A name-keyed font's glyph names, by glyph index; `null` for a CID-keyed font. |
| `cids` | A CID-keyed font's CIDs, by glyph index; `null` for a name-keyed font. |
| `numGlyphs` | The CharStrings count. |
| `glyph(gid)` | `{ gid, name, cid, advanceWidth, path, fontMatrix }`, or `null` past the glyphs. Computed on the first call, then kept. |
| `gidOfName(name)`, `gidOfCid(cid)` | The first glyph index of a name or CID, `-1` when none. |

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/fonts';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { readCff } = runtime.resolve('fontCffProgram');

const font = readCff(program); // a /FontFile3 Type1C stream, decoded
const a = font.glyph(font.gidOfName(font.encoding[0x41]));
```

## Notes

- **The charstring** is decoded with its Private DICT and the subroutines. A CID-keyed font uses the Private DICT of the glyph's Font DICT (`FDSelect`).
- **The advance** is the charstring's width plus `nominalWidthX`, else `defaultWidthX`.
- **Every contour is closed** (`Z`), as Type 2 contours are.
- **`seac`**: the glyph is drawn as its base, then its accent moved by (adx, ady). The two are found by their `StandardEncoding` names, whichever the font holds.
- **`fontMatrix`**: a glyph has the Top DICT's matrix. A CID-keyed glyph whose Font DICT states a matrix gets that one instead, times the Top DICT's when the Top DICT states one too.
- **Errors**:
  - bytes that are not a `Uint8Array` throw `ContractError` `fonts/cff-bad-input`;
  - a font without CharStrings throws `ParseError` `fonts/cff-no-charstrings`;
  - `parseCff`'s errors (`fonts/cff-version`, …) are thrown as they are, and so are the charstring decoder's (`fonts/cff-cs-*`, on `glyph(gid)`).
- **Measured** by the axis-C suite `fonttools-cff` (office-scorecard): every glyph of the pinned PDFs' `Type1C` and `CIDFontType0C` programs, compared with fontTools 4.66.1's `cffLib`.

## See also

- [table/cff](../table/cff.md) · [type1](./type1.md) · [encodings/standard](../encodings/standard.md)
