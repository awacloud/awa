---
module: dmlChart3d
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlChart3d

> DML chart — 3D scenes: `view3D`, floor / sideWall / backWall, `bandFmts`, 3D series.

**Module** `dmlChart3d` | **Source** `packages/front/office/ooxml/src/extra/dml-chart-3d.js` | **Deps** `xml` | **Worker-safe** yes

Provides typed parse/render for the 3D camera and surface elements that wrap a chart.

## Resolve

```js
const ext = dmlChart3d.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseView3D` / `renderView3D` | — | `{ rotX, rotY, perspective, rAngAx, depthPercent, hPercent }` |
| `parseFloor` / `renderFloor` | — | `<c:floor>` |
| `parseSideWall` / `renderSideWall` | — | `<c:sideWall>` |
| `parseBackWall` / `renderBackWall` | — | `<c:backWall>` |
| `parseBandFmt` / `renderBandFmt` | — | per-band formatting |
| `parseBandFmts` / `renderBandFmts` | — | wrapping list |
| `parseDPt` / `renderDPt` | — | per-point overrides |
| `parseSer` / `renderSer` | — | series with 3D extras |
| `parseChart3D` / `renderChart3D` | `(el) => Chart3D` | generic 3D chart shape (`kind` + `ser[]` + gap/wireframe/band settings) for `bar3DChart`/`line3DChart`/`pie3DChart`/`area3DChart`/`surfaceChart`/`surface3DChart` |
| `parseChartByName` | `(el) => Chart3D` | dispatcher — same result as `parseChart3D` for any of the six kinds |
| `renderBar3DChart` / `renderLine3DChart` / `renderPie3DChart` / `renderArea3DChart` / `renderSurfaceChart` / `renderSurface3DChart` | `(c) => xmlNode` | kind-specific convenience wrappers over `renderChart3D` |
| `CHART_TYPES_3D` | `string[]` | `['bar3DChart', 'line3DChart', 'pie3DChart', 'area3DChart', 'surfaceChart', 'surface3DChart']` |

## Elements typed

`view3D`, `rotX`, `rotY`, `perspective`, `rAngAx`, `depthPercent`, `hPercent`, `floor`, `sideWall`, `backWall`, `bandFmt`, `bandFmts`, `dPt`, `ser`, `bubble3D`, `gapDepth`.

## Notes

- `view3D.rotX` / `rotY` are integers in degrees (0..360).
- `bandFmts` apply to surface charts where alternating bands carry distinct fills.

## See also

- [dml-chart-axes-advanced](./dml-chart-axes-advanced.md)
- [dml-chart-other-types](./dml-chart-other-types.md)
