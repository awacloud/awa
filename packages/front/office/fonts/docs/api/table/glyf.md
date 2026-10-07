---
module: tableGlyf
category: table/glyf
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableGlyf

> Table `glyf` — Glyph Data (OT §6.4.12, TT §1.2), simple & composite glyphs.

**Module** `tableGlyf` | **Source** `packages/front/office/fonts/src/table/glyf.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Every glyph starts with a header (`numberOfContours`, bbox). `≥ 0` ⇒ simple; `< 0` ⇒ composite. Simple flags encode coordinate compaction (`X_SHORT`, `Y_SAME`, `REPEAT`, …); composites chain references with offset/anchor and a 2×2 F2Dot14 transform.

## Resolve

```js
const { parseGlyph, parseGlyf, GLYF_FLAG, COMPONENT_FLAG } = runtime.resolve('tableGlyf');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseGlyph` | `(bytes: Uint8Array) => SimpleGlyph \| CompositeGlyph \| null` | `null` for an empty glyph (length 0). |
| `parseGlyf` | `(bytes: Uint8Array, locaOffsets: Uint32Array) => Array<glyph\|null>` | One entry per glyph. |
| `GLYF_FLAG` | frozen object | Simple-point flag bits. |
| `COMPONENT_FLAG` | frozen object | Composite-component flag bits. |

### `SimpleGlyph`

```js
{
    kind: 'simple',
    bbox: { xMin, yMin, xMax, yMax },
    numberOfContours,
    endPtsOfContours: number[],
    instructions: Uint8Array,
    points: [{ x, y, onCurve }]
}
```

### `CompositeGlyph`

```js
{
    kind: 'composite',
    bbox,
    components: [{
        flags, glyphIndex, arg1, arg2,
        xy: boolean,                       // ARGS_ARE_XY_VALUES
        transform: { a, b, c, d },         // F2Dot14
        useMyMetrics: boolean
    }],
    instructions: Uint8Array
}
```

### `GLYF_FLAG`

`ON_CURVE 0x01`, `X_SHORT 0x02`, `Y_SHORT 0x04`, `REPEAT 0x08`, `X_SAME_OR_POS 0x10`, `Y_SAME_OR_POS 0x20`, `OVERLAP_SIMPLE 0x40`.

### `COMPONENT_FLAG`

`ARG_1_AND_2_ARE_WORDS 0x0001`, `ARGS_ARE_XY_VALUES 0x0002`, `ROUND_XY_TO_GRID 0x0004`, `WE_HAVE_A_SCALE 0x0008`, `MORE_COMPONENTS 0x0020`, `WE_HAVE_AN_X_AND_Y_SCALE 0x0040`, `WE_HAVE_A_TWO_BY_TWO 0x0080`, `WE_HAVE_INSTRUCTIONS 0x0100`, `USE_MY_METRICS 0x0200`, `OVERLAP_COMPOUND 0x0400`, `SCALED_COMPONENT_OFFSET 0x0800`, `UNSCALED_COMPONENT_OFFSET 0x1000`.

## Examples

### Parse all glyphs

```js
const { parseGlyf } = runtime.resolve('tableGlyf');
const glyphs = parseGlyf(sfnt.tables.glyf.bytes, loca);
const g = glyphs[42];
if (g && g.kind === 'simple') console.log(g.points.length);
```

## Parser hardening

- **`fonts/glyf-too-many-components`** — Composite glyphs used to be
  decoded via `do { ... } while (flags & MORE_COMPONENTS)` with no
  upper bound. A malicious font could emit millions of components →
  OOM. The number of components per glyph is now capped at **256**
  (OT validators recommend ≤ 8 — the limit leaves a comfortable
  margin). The resolution-depth cap (`MAX_DEPTH = 16` in
  `compositeResolve.js`) is unchanged: both width and depth are now
  bounded.
- **`fonts/inconsistent-tables`** — Cross-table check: every
  `component.glyphIndex` must stay within `[0, maxp.numGlyphs)`.
  Thrown from `buildFont` (`fonts.js`).

## Notes

- Coordinates are absolute (cumulative delta reconstructed at parse
  time) — `points[i].x` are final design units.
- A truncated glyph header (< 10 bytes and non-empty) throws
  `ParseError('fonts/glyf-short')`.
- Encoding is implemented on the writer side (the `embed-pdf` subsetter).

## See also

- [loca](./loca.md) — provides the offsets
- [path](../glyph/path.md) — `pathFromSimpleGlyph` consumes the `simple` shape
- [compositeResolve](../glyph/compositeResolve.md) — flattens composites
