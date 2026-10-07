---
module: tableColr
category: table/colr
dependencies: [fontErrors, fontReader, tableColrPaint]
returns: object
worker-safe: true
status: complete
---

# tableColr

> Table `COLR` — Color Glyph Layers v0 + v1 (OT §8.8.5).

**Module** `tableColr` | **Source** `packages/front/office/fonts/src/table/colr.js` | **Deps** `fontErrors`, `fontReader`, `tableColrPaint` | **Worker-safe** yes

Two versions: v0 (flat layers `(layerGid, paletteIndex)`) and v1 (paint graph: linear/radial/sweep gradients, transforms, composites). Pairs with `CPAL` for colors.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `PAINT_FORMAT` | const | Frozen enum of the 32 COLR v1 paint formats, numbered per the OpenType 1.9 COLR specification (see [Paint formats](#paint-formats)). |
| `BLEND_MODES` | const | Porter-Duff + blend modes enum (the spec's `CompositeMode`, 0–27). |
| `parseColr` | function | `(bytes) => { version, baseGlyphs, layers, v1, baseLayer(gid) }`. `baseGlyphs[i]` is `{ glyphID, firstLayerIndex, numLayers }`; `layers[i]` is `{ glyphID, paletteIndex }`; `v1` is `null` for version 0, else `{ baseGlyphListOffset, layerListOffset, clipListOffset, varIndexMapOffset, itemVariationStoreOffset, baseGlyphPaintRecords? }`. `baseLayer(gid)` returns the layer slice for a base glyph. |
| `decodeColorLine` | function | `(bytes, offset) => { extend, numStops, stops }`; each stop is `{ stopOffset, paletteIndex, alpha }`. |
| `decodePaint` | function | `(bytes, offset) => { format, name, ...fields }` for every format 1–32 (`name` is the spec table name, e.g. `'PaintScaleAroundCenter'`); a format outside 1–32 returns `{ format, parsed: false }`. Child paint offsets stay raw (`paintOffset`, or `paintOffsetSrc` / `paintOffsetDst` for `PaintComposite`). |
| `decodePaintGraph` | function | `(bytes, rootOffset, maxDepth=16) => PaintGraph` — `decodePaint` plus `offset`, with child offsets resolved into `paint` (or `paintSrc` / `paintDst`); cycles yield `{ cycle: true, offset }`, depth overflow `{ truncated: true, offset }`. |
| `tableColr` | factory | Factory. |

## Paint formats

Numbering and field layouts follow the OpenType 1.9 COLR specification,
§ "Paint tables" ("Thirty-two paint table formats are defined (formats 1
to 32)"). Every paint starts with a `uint8 format`; the fields below are the
keys `decodePaint` returns after `format` and `name`. Types: F2DOT14 is
decoded to a float (`raw / 16384`), FWORD / UFWORD to an integer in design
units, Offset24 child offsets are relative to the start of the paint.

| Format | `PAINT_FORMAT` key | Spec table | Decoded fields |
|-------:|--------------------|------------|----------------|
| 1 | `COLR_LAYERS` | PaintColrLayers | `numLayers`, `firstLayerIndex` |
| 2 | `SOLID` | PaintSolid | `paletteIndex`, `alpha` |
| 3 | `VAR_SOLID` | PaintVarSolid | `paletteIndex`, `alpha`, `varIndexBase` |
| 4 | `LINEAR_GRADIENT` | PaintLinearGradient | `colorLineOffset`, `x0`, `y0`, `x1`, `y1`, `x2`, `y2` |
| 5 | `VAR_LINEAR_GRADIENT` | PaintVarLinearGradient | as 4, + `varIndexBase` |
| 6 | `RADIAL_GRADIENT` | PaintRadialGradient | `colorLineOffset`, `x0`, `y0`, `r0`, `x1`, `y1`, `r1` (spec `radius0` / `radius1`) |
| 7 | `VAR_RADIAL_GRADIENT` | PaintVarRadialGradient | as 6, + `varIndexBase` |
| 8 | `SWEEP_GRADIENT` | PaintSweepGradient | `colorLineOffset`, `centerX`, `centerY`, `startAngle`, `endAngle` |
| 9 | `VAR_SWEEP_GRADIENT` | PaintVarSweepGradient | as 8, + `varIndexBase` |
| 10 | `GLYPH` | PaintGlyph | `paintOffset`, `glyphID` |
| 11 | `COLR_GLYPH` | PaintColrGlyph | `glyphID` |
| 12 | `TRANSFORM` | PaintTransform | `paintOffset`, `affineOffset` (spec `transformOffset`, to an Affine2x3) |
| 13 | `VAR_TRANSFORM` | PaintVarTransform | `paintOffset`, `affineOffset` (to a VarAffine2x3) |
| 14 | `TRANSLATE` | PaintTranslate | `paintOffset`, `dx`, `dy` |
| 15 | `VAR_TRANSLATE` | PaintVarTranslate | as 14, + `varIndexBase` |
| 16 | `SCALE` | PaintScale | `paintOffset`, `scaleX`, `scaleY` |
| 17 | `VAR_SCALE` | PaintVarScale | as 16, + `varIndexBase` |
| 18 | `SCALE_AROUND_CENTER` | PaintScaleAroundCenter | `paintOffset`, `scaleX`, `scaleY`, `centerX`, `centerY` |
| 19 | `VAR_SCALE_AROUND_CENTER` | PaintVarScaleAroundCenter | as 18, + `varIndexBase` |
| 20 | `SCALE_UNIFORM` | PaintScaleUniform | `paintOffset`, `scale` |
| 21 | `VAR_SCALE_UNIFORM` | PaintVarScaleUniform | as 20, + `varIndexBase` |
| 22 | `SCALE_UNIFORM_AROUND_CENTER` | PaintScaleUniformAroundCenter | `paintOffset`, `scale`, `centerX`, `centerY` |
| 23 | `VAR_SCALE_UNIFORM_AROUND_CENTER` | PaintVarScaleUniformAroundCenter | as 22, + `varIndexBase` |
| 24 | `ROTATE` | PaintRotate | `paintOffset`, `angle` |
| 25 | `VAR_ROTATE` | PaintVarRotate | as 24, + `varIndexBase` |
| 26 | `ROTATE_AROUND_CENTER` | PaintRotateAroundCenter | `paintOffset`, `angle`, `centerX`, `centerY` |
| 27 | `VAR_ROTATE_AROUND_CENTER` | PaintVarRotateAroundCenter | as 26, + `varIndexBase` |
| 28 | `SKEW` | PaintSkew | `paintOffset`, `xSkewAngle`, `ySkewAngle` |
| 29 | `VAR_SKEW` | PaintVarSkew | as 28, + `varIndexBase` |
| 30 | `SKEW_AROUND_CENTER` | PaintSkewAroundCenter | `paintOffset`, `xSkewAngle`, `ySkewAngle`, `centerX`, `centerY` |
| 31 | `VAR_SKEW_AROUND_CENTER` | PaintVarSkewAroundCenter | as 30, + `varIndexBase` |
| 32 | `COMPOSITE` | PaintComposite | `paintOffsetSrc`, `compositeMode`, `paintOffsetDst` (spec `sourcePaintOffset` / `backdropPaintOffset`) |

Rotate and skew angles are returned as the raw F2DOT14 float, where the
spec defines 1.0 as 180° counter-clockwise (no bias, unlike the sweep
gradient angles).

**Var deltas not applied.** The Var formats (odd 3–31) decode their
`varIndexBase` only. No variation deltas are resolved or applied — the
`DeltaSetIndexMap` / `ItemVariationStore` offsets are exposed on
`parseColr(...).v1`, but instancing the paint values is out of scope, as is
COLR v1 rendering / compositing.

Earlier releases bound `SCALE_AROUND_CENTER` / `ROTATE` / `SKEW` to 17 / 18 /
19 (so formats 17–19 were decoded with the wrong layout) and returned
`parsed: false` for 20–31; the keys now carry the specification numbers 18 /
24 / 28.

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseColr, decodePaintGraph } = fw.runtime.resolve('tableColr');
const colr = parseColr(sfnt.tables.COLR.bytes);
const layers = colr.baseLayer(42);
```

## Notes

- `maxDepth=16` avoids cycles in the paint graph.
- Colors are resolved via [cpal](./cpal.md).

## See also

- [cpal](./cpal.md) [svg](./svg.md) [sbix](./sbix.md)
