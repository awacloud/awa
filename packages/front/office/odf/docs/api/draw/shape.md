---
module: drawShape
category: odf/draw
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# drawShape

> Typed drawing shapes — `draw:rect`, `draw:circle`, `draw:ellipse`,
> `draw:line`, `draw:polyline`, `draw:polygon`, `draw:path`,
> `draw:custom-shape` (with optional `draw:enhanced-geometry`).

**Module** `drawShape` | **Source** `packages/front/office/odf/src/draw/shape.js` | **Deps** `xml` | **Worker-safe** yes

Model:

```js
{ type: 'shape', kind, attrs: {...},
  enhancedGeometry?: { attrs, _extras? },
  children: [...rawXml],
  _extras? }
```

## API

| Method | Description |
|---------|-------------|
| `isShapeName(name)` | Indicates whether the tag is a recognised shape. |
| `parseShape(el)` | Converts a node into the model. |
| `renderShape(s)` | Builds a node: `children`, then `_extras.children`, then (custom shapes) `draw:enhanced-geometry` last, after the shape's text, as the schema orders them. |
| `KINDS` | The underlying `Set` of recognised shape tag names (`draw:rect`, `draw:circle`, `draw:ellipse`, `draw:line`, `draw:polyline`, `draw:polygon`, `draw:path`, `draw:custom-shape`). |
