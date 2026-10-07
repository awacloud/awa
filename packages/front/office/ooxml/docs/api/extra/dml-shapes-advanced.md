---
module: dmlShapesAdvanced
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlShapesAdvanced

> DML — custom-geometry shapes, connectors and 3D scene.

**Module** `dmlShapesAdvanced` | **Source** `packages/front/office/ooxml/src/extra/dml-shapes-advanced.js` | **Deps** `xml` | **Worker-safe** yes

Parses / renders `<a:custGeom>` (avLst, gdLst, ahLst, cxnLst, rect, pathLst with the full path command set + adjust handles + connection sites), connector shapes (`<a:cxnSp>`, `<a:cNvCxnSpPr>`) and the 3D scene (`scene3d`, `sp3d`, `bevelT`/`bevelB`, `lightRig`, `flatTx`, `extrusionClr`, `contourClr`).

## Resolve

```js
const ext = dmlShapesAdvanced.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseAny` | `(el) => *` | dispatches by element name across every entry below |
| `parseCustGeom` / `renderCustGeom` | — | `{ avLst, gdLst, ahLst, cxnLst, rect?, pathLst }` |
| `parsePath` / `renderPath` | — | a single `<a:path>` (`{ attrs, commands[] }`) |
| `parsePathLst` / `renderPathLst` | — | `<a:pathLst>` (list of `<a:path>`) |
| `parsePathCommand` / `renderPathCommand` | — | `moveTo`, `lnTo`, `arcTo`, `quadBezTo`, `cubicBezTo`, `close` |
| `parseGd` / `renderGd` | — | `<a:gd>` formula guide (`{ name, fmla }`) |
| `parseAvLst` / `renderAvLst` | — | `<a:avLst>` (list of `<a:gd>` adjust values) |
| `parseGdLst` / `renderGdLst` | — | `<a:gdLst>` (list of `<a:gd>` guides) |
| `parseAhLst` / `renderAhLst` | — | `<a:ahLst>` (list of `ahPolar`/`ahXY` adjust handles) |
| `parseAhPolar` / `renderAhPolar` | — | `<a:ahPolar>` (attrs + `<a:pos>`) |
| `parseAhXY` / `renderAhXY` | — | `<a:ahXY>` (attrs + `<a:pos>`) |
| `parseCxnLst` / `renderCxnLst` | — | `<a:cxnLst>` (list of `<a:cxn>` connection sites) |
| `parseCxn` / `renderCxn` | — | `<a:cxn>` (attrs + `<a:pos>`) |
| `parseRect` / `renderRect` | — | `<a:rect>` (`l`/`t`/`r`/`b`) |
| `parsePt` / `renderPt` | — | `<a:pt>` (`x`, `y`) |
| `parseCxnSp` / `renderCxnSp` | — | connector shape (`<a:cxnSp>` + `cNvCxnSpPr`) |
| `parseScene3d` / `renderScene3d` | — | `<a:scene3d>` (camera / lightRig / flatTx) |
| `parseSp3d` / `renderSp3d` | — | `<a:sp3d>` (bevelT / bevelB / extrusionClr / contourClr) |
| `parseLightRig` / `renderLightRig` | — | `<a:lightRig>` |
| `PATH_OPS` | — | `['moveTo', 'lnTo', 'arcTo', 'cubicBezTo', 'quadBezTo', 'close']` |

## Elements typed

`custGeom`, `avLst`, `gdLst`, `gd`, `ahLst`, `ahXY`, `ahPolar`, `cxnLst`, `cxn`, `rect`, `pathLst`, `path`, `moveTo`, `lnTo`, `arcTo`, `quadBezTo`, `cubicBezTo`, `close`, `pt`, `cxnSp`, `cNvCxnSpPr`, `scene3d`, `camera`, `lightRig`, `rot`, `flatTx`, `sp3d`, `bevelT`, `bevelB`, `extrusionClr`, `contourClr`.

## Notes

- Coordinates are EMUs unless the `path` element sets `w` / `h` (then they are local).
- Guide formulas reference adjustment values by name — kept as raw strings.

## See also

- [dml-fills-advanced](./dml-fills-advanced.md)
- [dml-xdr-advanced](./dml-xdr-advanced.md)
