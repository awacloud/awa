---
module: varInstantiate
category: variable/instantiate
dependencies: [fontErrors, fontSfnt, tableHead, tableHhea, tableMaxp, tableHmtx, tableLoca, tableMvar, fontWriter, fontCompositeResolve, varGlyph, varItemStore]
returns: object
worker-safe: true
status: complete
---

# varInstantiate

> A static instance of a variable TrueType font.

**Module** `varInstantiate` | **Source** `packages/front/office/fonts/src/variable/instantiate.js` | **Deps** `fontErrors`, `fontSfnt`, `tableHead`, `tableHhea`, `tableMaxp`, `tableHmtx`, `tableLoca`, `tableMvar`, `fontWriter`, `fontCompositeResolve`, `varGlyph`, `varItemStore` | **Worker-safe** yes

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `instantiate` | function | `(font, coords) => Uint8Array`: a static TrueType font at the user coordinates `coords` (`{ tag: value }`, as [glyph](./glyph.md) takes them). |
| `varInstantiate` | factory | Factory. |

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/fonts';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const fonts = runtime.resolve('fonts');
const { instantiate } = runtime.resolve('varInstantiate');
const { subsetForPdf } = runtime.resolve('embedSubsetForPdf');

const bold = fonts.read(instantiate(fonts.read(variableBytes), { wght: 700 }));
const embedded = subsetForPdf(bold, codePoints);
```

## Notes

- **`glyf` / `loca`**: every glyph at the coordinates ([glyph](./glyph.md)'s `outlineAt`), re-encoded. A simple glyph keeps its moved points, its flags (short vectors) and its instructions; a composite its moved offsets (word arguments when they no longer fit a byte), its transform and its instructions. Each bounding box is recomputed.
- **`hmtx`**: the advance at the coordinates, and the left side bearing that keeps the moved left side bearing point (`xMin − pp1`), so the instance draws where the variable font did.
- **`head`** gets the font's bounding box and the `loca` format; **`hhea`** gets `advanceWidthMax`, the side bearings and `xMaxExtent`.
- **`MVAR`**: its rounded deltas at the coordinates are added to the fields its tags name:
  - `hasc`, `hdsc`, `hlgp`, `hcla`, `hcld`, `xhgt`, `cpht`, and the sub- and superscript and strikeout fields of `OS/2`;
  - `hcrs`, `hcrn`, `hcof` of `hhea`;
  - `unds`, `undo` of `post`.

  An unknown tag is ignored.
- **Dropped**: `fvar`, `gvar`, `avar`, `HVAR`, `VVAR`, `MVAR`, `cvar`, `STAT`. Every other table is kept as read. The layout tables' variation data (FeatureVariations, GPOS devices) are not baked into them; shape the variable font with `fontShaper`'s `opts.coords` for those.
- A font without `fvar` gives its default instance, re-encoded.
- **Errors**: a font without `glyf` throws `fonts/var-glyf-only` (a CFF2 instance is not produced); bad coordinates throw `fonts/var-bad-coords` (both `ContractError`s).
- **Measured**: the 112 `glyf` cases of the axis-E suite `text-rendering-tests-variation`, rendered from their instances without coordinates, match their expected renderings.

## See also

- [glyph](./glyph.md) [itemVariationStore](./itemVariationStore.md) [instance](./instance.md)
- [`subsetForPdf`](../embed-pdf/subsetForPdf.md)
