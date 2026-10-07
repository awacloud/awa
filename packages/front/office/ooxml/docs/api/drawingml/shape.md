---
module: drawingmlShape
category: ooxml/drawingml
dependencies: [xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# drawingmlShape

> DrawingML shape properties — `<a:prstGeom>`, `<a:xfrm>`, `<a:solidFill>`, `<a:ln>`.

**Module** `drawingmlShape` | **Source** `packages/front/office/ooxml/src/drawingml/shape.js` | **Deps** `xml`, `ooxmlShared` | **Worker-safe** yes

Models the content of `<spPr>`, shared by the pptx (`<p:sp>`), docx (`<wps:wsp>`) and xlsx (`<xdr:sp>`) hosts. Covers geometry (`rect`, `roundRect`, `ellipse` and other presets), the 2D transform (offset/extent/rotation/flip), simple fills and lines. Anything not modelled stays in `_extras` for round-trip fidelity.

## Resolve

```js
const sh = runtime.resolve('drawingmlShape');
// Returns: { parseShapeProperties, renderShapeProperties,
//            parsePrstGeom, renderPrstGeom,
//            parseXfrm, renderXfrm,
//            parseFill, renderFill,
//            parseLine, renderLine,
//            shapeProps,
//            toEmu, EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
//            PRESETS, A_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseShapeProperties` | `(spPrEl) => shapeProps` | Typed model. |
| `renderShapeProperties` | `(props) => element` | `<*:spPr>`. |
| `parsePrstGeom` / `renderPrstGeom` | symmetric | Preset geometry. |
| `parseXfrm` / `renderXfrm` | symmetric | 2D transform. |
| `parseFill` / `renderFill` | symmetric | solid / scheme / none. |
| `parseLine` / `renderLine` | symmetric | Typed `<a:ln>`. |
| `shapeProps` | `({geom, cx, cy, offsetX?, offsetY?, fill?, line?, …}) => props` | Convenience builder. |
| `toEmu` | `(value: string\|number) => number` | Converts `'2in'`, `'5cm'`, `'12pt'`, `'96px'` or a raw EMU number. |
| `EMU_PER_INCH`, `EMU_PER_CM`, `EMU_PER_PT`, `EMU_PER_PX_96` | number | EMU constants. |
| `PRESETS` | frozen object | Catalogue of 38 `prst` ids (rect, roundRect, ellipse, arrows, callouts, …). |
| `A_NS` | string | DrawingML namespace. |

## Model

```js
shapeProps := {
    geom?: string,                  // 'rect'|'roundRect'|'ellipse'|'triangle'|…
    avLst?: [{ name, fmla }],
    cx?, cy?, offsetX?, offsetY?,   // EMU
    rotation?: number,              // 60000ths of a degree
    flipH?: boolean, flipV?: boolean,
    fill?: 'none' | { color: 'RRGGBB' } | { schemeColor: string },
    line?: 'none' | {
        width?: number,             // EMU
        color?: 'RRGGBB',
        dash?: 'solid'|'dash'|'dot'|'dashDot'|…,
        cap?: 'flat'|'rnd'|'sq',
        compound?: 'sng'|'dbl'|'thickThin'|'thinThick'|'tri'
    },
    _extras?: [xmlNode]
}
```

## Examples

### Blue rectangle with a border

```js
const sh = runtime.resolve('drawingmlShape');
const props = sh.shapeProps({
    geom: sh.PRESETS.roundRect,
    cx: sh.toEmu('3in'),
    cy: sh.toEmu('1in'),
    fill: { color: '4472C4' },
    line: { width: 12700, color: '2E5597' }   // 1pt
});
sh.renderShapeProperties(props);
```

### Position and rotation

```js
sh.shapeProps({
    geom: 'ellipse',
    offsetX: sh.toEmu('1cm'), offsetY: sh.toEmu('1cm'),
    cx: sh.toEmu('5cm'),      cy: sh.toEmu('5cm'),
    rotation: 30 * 60000      // 30°
});
```

## Notes

- Line `width` is in EMU (12700 = 1pt). There is no unit inference — compute it with `toEmu`.
- `PRESETS` is a convenience catalogue of 38 entries, not the full ECMA list; any string passed as `geom` is accepted.
- `fill: 'none'` emits `<a:noFill/>`; omitting `fill` emits no element at all (inheritance from the parent).
- `<a:gradFill>`, `<a:effectLst>` and similar are not modelled here — see the DrawingML extras (`dmlFillsAdvanced`, `dmlEffects`, `dmlShapesAdvanced`).

## See also

- [drawingml](./drawingml.md) — the text body inserted into the shape.
- [docx-drawing](../docx/drawing.md), [pptx-slide](../pptx/slide.md), [xlsx-drawings](../xlsx/drawings.md) — hosts.
