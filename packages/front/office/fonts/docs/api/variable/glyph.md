---
module: varGlyph
category: variable/glyph
dependencies: [fontErrors, tableFvar, tableAvar, tableGvar, tableHvar, varCoordsConvert, varInstance, varItemStore, fontCompositeResolve, fontPath, tableCff, tableCff2]
returns: object
worker-safe: true
status: complete
---

# varGlyph

> A glyph at variation coordinates — `glyf` through `gvar`, CFF2 through its `blend`s: its outline and advance, as FreeType draws them.

**Module** `varGlyph` | **Source** `packages/front/office/fonts/src/variable/glyph.js` | **Deps** `fontErrors`, `tableFvar`, `tableAvar`, `tableGvar`, `tableHvar`, `varCoordsConvert`, `varInstance`, `varItemStore`, `fontCompositeResolve`, `fontPath`, `tableCff`, `tableCff2` | **Worker-safe** yes

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `glyphAt` | function | `(font, gid, coords) => { path, advanceWidth }`: the glyph at the user coordinates `coords` (`{ tag: value }`). |
| `normalise` | function | `(font, coords) => number[]`: the normalised coordinates, in `fvar` axis order. |
| `variations` | function | `(font) => { axes, normalise(coords), glyphAt(gid, coords), outlineAt(gid, coords) }`: the same, with the font's tables parsed once; `outlineAt` (a `glyf` font) gives `{ glyphs, advanceWidth, pp1 }`, the glyph table with the glyph and its components at the coordinates (unshifted), the advance and the moved left side bearing point's x, which [instantiate](./instantiate.md) writes. |
| `varGlyph` | factory | Factory. |

`font` is a `fonts.read` result.

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/fonts';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const fonts = runtime.resolve('fonts');
const { variations } = runtime.resolve('varGlyph');

const font = fonts.read(bytes);
const v = variations(font);
const bold = v.glyphAt(font.glyphIndexForCodePoint(0x41), { wght: 700 });
// bold.path.commands, bold.advanceWidth
```

## Notes

- **Normalisation**: each axis's user value is clamped to its range and mapped to `[-1, 1]` (the default where a tag is missing), then through `avar`'s segment maps (version 2's variation-store step is not applied). A tag may leave out the spaces that pad it to four characters (`HV` for `'HV  '`).
- **Tuples**: every `gvar` tuple whose scalar at the coordinates is not 0 adds its deltas, scaled. Its points are its private point numbers, else the glyph's shared ones, else all of them (the glyph's points or components, then the four phantom points).
- **IUP**: a simple glyph's untouched points are inferred contour by contour and axis by axis. Between two touched neighbours, a point takes the linear interpolation inside their range and the nearer one's delta outside it; two neighbours at one coordinate give their delta when it is equal, else 0. One touched point shifts its whole contour.
- **Composites**: the deltas move the components' offsets, and each component is itself taken at the coordinates.
- **Rounding and origin**: each point's summed delta is rounded to the nearest unit (half up); the outline is then shifted so that the left side bearing point (the first phantom point) sits at x = 0.
- **Advance**: `hmtx`'s plus `HVAR`'s rounded delta (through its advance map, else the glyph index) when the font has `HVAR`, else the distance between the moved first two phantom points.
- A font without `fvar` or `gvar` gives the default glyph (shifted as above). A `gvar`, `avar` or `HVAR` that does not parse is not applied.
- **CFF2**: on a font with a `CFF2` table and no `glyf`, the glyph's charstring is decoded (its global and local subroutines) with every `blend` at the coordinates, its region scalars from the font's variation store (`varItemStore`'s `scalars`); the advance is `hmtx`'s plus `HVAR`'s. A CFF2 font with several Font DICTs throws `fonts/var-cff2-fds`, as `subsetForPdf` rejects it.
- **`cvar` is not applied**: it varies the `cvt` values, which only hinting reads, and these outlines are unhinted.
- A font with neither `glyf` nor `CFF2` throws `fonts/var-glyf-only`; bad coordinates throw `fonts/var-bad-coords` (both `ContractError`s).
- **Measured** by the axis-E suite `text-rendering-tests-variation` (tools/office-scorecard).

## See also

- [instance](./instance.md) [coordsConvert](./coordsConvert.md) [itemVariationStore](./itemVariationStore.md)
- [gvar](../table/gvar.md) [hvar](../table/hvar.md) [fvar](../table/fvar.md) [avar](../table/avar.md)
