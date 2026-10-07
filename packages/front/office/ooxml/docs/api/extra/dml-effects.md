---
module: dmlEffects
category: extra
dependencies: [xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# dmlEffects

> DML — shared effect lists: shadow / glow / blur / reflection / softEdge.

**Module** `dmlEffects` | **Source** `packages/front/office/ooxml/src/extra/dml-effects.js` | **Deps** `xml`, `ooxmlShared` | **Worker-safe** yes

Parses / renders the `<a:effectLst>` and `<a:effectDag>` containers used by every DrawingML shape, run, table cell, and chart element. The color codec is delegated to `ooxmlShared.createDmlColorCodec` (`withMods: true`, so `lumMod`/`lumOff`/`tint`/`shade`/`alpha*`/`lum`/`grayscl`/`duotone`/`clrChange`/`clrRepl`/`biLevel` land on `color.mods`).

## Resolve

```js
const ext = dmlEffects.factory(xml, ooxmlShared);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseAny` | `(el) => *` | dispatches by element name across every entry below |
| `parseEffectLst` / `renderEffectLst` | — | linear effect list `{ effects: [] }` |
| `parseEffectDag` / `renderEffectDag` | — | DAG variant (`{ attrs, effects: [] }`) |
| `parseEffect` / `renderEffect` | — | single effect (outerShdw / innerShdw / prstShdw / glow / reflection / softEdge / blur / fillOverlay) |
| `parseColor` / `renderColor` | — | DML color with mods (srgb / scheme / sys / hsl / scrgb / prst) |
| `parseColorMod` / `renderColorMod` | — | single color-mod child (lum, tint, shade, …) |
| `parseXfrm` / `renderXfrm` | — | `<a:xfrm>` effect transform |
| `parseEffectRef` / `renderEffectRef` | — | named `<a:effect ref="…">` inside an `effectDag` |
| `parseEffectStyle` / `renderEffectStyle` | — | theme `<a:effectStyle>` (effectLst + effectDag) |
| `parseEffectStyleLst` / `renderEffectStyleLst` | — | theme `<a:effectStyleLst>` |
| `COLOR_TAGS` | — | tag list re-exported from the shared color codec |

3D scene/camera/`sp3d` elements are typed by [dml-shapes-advanced](./dml-shapes-advanced.md), not by this module.

## Elements typed (effects)

`effectLst`, `effectDag`, `outerShdw`, `innerShdw`, `prstShdw`, `glow`, `blur`, `softEdge`, `reflection`, `fillOverlay`, `lum`, `tint`, `shade`, `alphaMod`, `alphaModFix`, `alphaCeiling`, `alphaFloor`, `alphaRepl`, `biLevel`, `lumMod`, `lumOff`, `duotone`, `clrChange`, `clrRepl`, `grayscl`, `xfrm`, `effect` (ref), `effectStyle`, `effectStyleLst`.

## Notes

- Color modifications are kept as an ordered `mods[]` array on every color object — order matters in DrawingML.
- `effectDag` is rare; `effectLst` covers ~99% of fixtures.

## See also

- [dml-fills-advanced](./dml-fills-advanced.md)
