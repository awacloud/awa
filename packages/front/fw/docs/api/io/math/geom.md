---
module: geom
category: io/math
dependencies: [linalg]
returns: object
worker-safe: true
status: complete
---

# geom

> 2D geometry — Point, Rect, Circle, Line, Polygon, hit-testing, intersections.

**Module** `geom` | **Source** `packages/front/fw/src/io/math/geom.js` | **Deps** `linalg` | **Worker-safe** yes

2D geometric primitives with hit-testing, intersections, polygon simplification (Ramer-Douglas-Peucker) and transform via `linalg.mat3`. No 3D geometry, polygon clipping, or Voronoi.

## Resolve

```js
const geom = runtime.resolve('geom');
// Returns: { Point, Rect, Circle, Line, Polygon, hitTest, transform }
```

## API

### Point

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(x, y) => {x, y}` | Point |
| `distance` | `(a, b) => number` | Euclidean distance |
| `midpoint` | `(a, b) => Point` | Midpoint |
| `equals` | `(a, b, eps?) => boolean` | Comparison with epsilon |

### Rect (left/top inclusive, right/bottom exclusive)

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(x, y, w, h) => Rect` | Rectangle |
| `contains` | `(rect, point) => boolean` | Hit-test |
| `intersects` | `(a, b) => boolean` | Overlap |
| `intersection` | `(a, b) => Rect \| null` | Overlap area |
| `union` | `(a, b) => Rect` | Bounding union |
| `area` | `(rect) => number` | w×h |
| `center` | `(rect) => Point` | Center |
| `normalize` | `(rect) => Rect` | Ensures w,h ≥ 0 |

### Circle

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(cx, cy, r) => Circle` | Circle |
| `contains` | `(circle, point) => boolean` | Point inside the circle |
| `intersectsCircle` | `(a, b) => boolean` | Two circles |
| `intersectsRect` | `(circle, rect) => boolean` | Circle/rectangle |

### Line (segment)

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(x1, y1, x2, y2) => Line` | Segment |
| `length` | `(line) => number` | Length |
| `intersects` | `(a, b) => boolean` | Intersecting |
| `intersection` | `(a, b) => Point \| null` | Intersection point |
| `distanceToPoint` | `(line, point) => number` | Minimum distance |
| `closestPoint` | `(line, point) => Point` | Closest point on the segment |

### Polygon

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `(points: Point[]) => Polygon` | Polygon |
| `area` | `(poly) => number` | Signed area (> 0 = CCW) |
| `isCcw` | `(poly) => boolean` | Counter-clockwise orientation |
| `contains` | `(poly, point) => boolean` | Ray-casting |
| `bbox` | `(poly) => Rect` | Bounding box |
| `simplify` | `(poly, tolerance) => Polygon` | Ramer-Douglas-Peucker |

### Global helpers

| Method | Description |
|--------|-------------|
| `hitTest(shape, point)` | Dispatches to Rect / Circle / Polygon |
| `transform(point, mat3)` | Applies `linalg.mat3.transform` |

## Examples

### Generic hit-test

```js
const geom = runtime.resolve('geom');

const rect = geom.Rect.create(0, 0, 100, 50);
const circle = geom.Circle.create(50, 25, 30);

geom.hitTest(rect, { x: 10, y: 10 });   // true
geom.hitTest(circle, { x: 50, y: 25 }); // true
```

### Rectangle intersection

```js
const a = geom.Rect.create(0, 0, 10, 10);
const b = geom.Rect.create(5, 5, 10, 10);

if (geom.Rect.intersects(a, b)) {
    const overlap = geom.Rect.intersection(a, b);
    // { x: 5, y: 5, w: 5, h: 5 }
}
```

### Simplify a GPS polygon

```js
const path = geom.Polygon.create(gpsPoints);
const simplified = geom.Polygon.simplify(path, 0.001); // tolerance in degrees
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const geom = libs.geom;
        const rect = geom.Rect.create(args.x, args.y, args.w, args.h);
        const hits = args.points.filter(p => geom.Rect.contains(rect, geom.Point.create(p[0], p[1])));
        self.postMessage(hits);
    },
    { dependencies: ['geom'], args: { x: 0, y: 0, w: 100, h: 100, points: [[10, 10], [200, 200]] } }
);
```

## Notes

- **Border convention**: `Rect.contains` — left/top inclusive, right/bottom exclusive (`x < rect.x + rect.w`).
- **Non-closed polygon**: the last point is auto-closed back to the first for `area` and `contains`.
- `Polygon.area` returns a signed value — positive = CCW, negative = CW. Use `Math.abs` for the geometric area.
- `hitTest` dispatches by duck-typing: presence of `w`/`h` → Rect, `cx`/`r` → Circle, `points` → Polygon.

## See also

- [linalg](./linalg.md) — linear algebra (matrix transforms)
- [interp](./interp.md) — spatial interpolation (Bézier, barycentric)
