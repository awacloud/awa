---
module: fontPath
category: glyph/path
dependencies: []
returns: object
worker-safe: true
status: complete
---

# fontPath

> Resolution-independent path — quadratic Bézier curves plus optional cubics.

**Module** `fontPath` | **Source** `packages/front/office/fonts/src/glyph/path.js` | **Deps** none | **Worker-safe** yes

Universal path model used for both TrueType glyphs (quadratic) and CFF glyphs (cubic). Each command is a compact POJO:

- `{ type: 'M', x, y }`
- `{ type: 'L', x, y }`
- `{ type: 'Q', x1, y1, x, y }`
- `{ type: 'C', x1, y1, x2, y2, x, y }`
- `{ type: 'Z' }`

## Resolve

```js
const { Path, pathFromSimpleGlyph } = runtime.resolve('fontPath');
```

## API

| Symbol | Type | Description |
|---------|------|-------------|
| `Path` | class | Mutable path. |
| `pathFromSimpleGlyph` | `(simpleGlyph) => Path` | Reconstructs a Path from a simple TT glyph. |

### `Path` — methods

| Method | Signature | Description |
|---------|-----------|-------------|
| `moveTo` | `(x, y) => this` | Starts a new subpath. |
| `lineTo` | `(x, y) => this` | Straight segment. |
| `quadTo` | `(x1, y1, x, y) => this` | Quadratic Bézier. |
| `curveTo` | `(x1, y1, x2, y2, x, y) => this` | Cubic Bézier. |
| `close` | `() => this` | Closes the current subpath. |
| `bbox` | `() => {xMin,yMin,xMax,yMax}` | Approximation from anchors + control points. |
| `toSvgPath` | `() => string` | SVG serialization, `"M ... Z"`. |
| `transform` | `(t: {a,b,c,d,e,f}) => this` | Applies an affine transform in place. |

### `pathFromSimpleGlyph` algorithm

- On-curve points are anchors.
- Two consecutive off-curve points imply an anchor at their midpoint.
- If a contour has no on-curve point at all, it starts at the midpoint of the last→first off-curve pair.
- Each contour is closed (`close`) after iteration.

## Examples

### Manual construction

```js
const { Path } = runtime.resolve('fontPath');
const p = new Path().moveTo(0, 0).lineTo(100, 0).quadTo(150, 50, 100, 100).close();
console.log(p.toSvgPath());
```

### From a TT glyph

```js
const { pathFromSimpleGlyph } = runtime.resolve('fontPath');
const p = pathFromSimpleGlyph(glyphTable[gid]);
```

### Transforming

```js
p.transform({ a: 1, d: -1, e: 0, f: 1000 });   // flip Y + translate
```

## Notes

- `bbox()` does not evaluate the interior curvature of the Béziers — it is a control-hull approximation.
- `transform` is destructive (in-place). Clone before reuse if needed.
- SVG rendering uses raw design units — call `transform` with a scale to convert to pixels.

## See also

- [glyph](./glyph.md)
- [compositeResolve](./compositeResolve.md)
- [glyf](../table/glyf.md)
