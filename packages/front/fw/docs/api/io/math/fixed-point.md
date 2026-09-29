---
module: fixedPoint
category: io/math
dependencies: []
returns: object
worker-safe: true
status: complete
---

# fixedPoint

> Fixed-point ↔ float conversions for binary format I/O (SFNT, TIFF, DSP).

**Module** `fixedPoint` | **Source** `packages/front/fw/src/io/math/fixed-point.js` | **Deps** none | **Worker-safe** yes

Conversions between fixed-point representations (Fixed16.16, F2Dot14, FUnit) and JS floats. Covers SFNT / OpenType formats (matrices, axis coords, design units), TIFF and audio/DSP variants. Includes a generic parameterizable helper (arbitrary intBits + fracBits).

## Resolve

```js
const fp = runtime.resolve('fixedPoint');
// Returns: { fixed16ToFloat, floatToFixed16, ufixed16ToFloat, floatToUfixed16,
//             f2dot14ToFloat, floatToF2dot14, funitToPx, fixedToFloat, floatToFixed }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `fixed16ToFloat` | `(raw: number) => number` | Float from signed Fixed16.16 |
| `floatToFixed16` | `(value: number, opts?) => number` | Signed Fixed16.16 (bit-pattern uint32) |
| `ufixed16ToFloat` | `(raw: number) => number` | Float from unsigned UFix16.16 |
| `floatToUfixed16` | `(value: number, opts?) => number` | UFix16.16 (bit-pattern uint32) |
| `f2dot14ToFloat` | `(raw: number) => number` | Float from signed F2Dot14 (16 bits) |
| `floatToF2dot14` | `(value: number, opts?) => number` | F2Dot14 (bit-pattern uint16, 0x0000–0xFFFF) |
| `funitToPx` | `(unitsPerEm: number, fontSize: number, funit: number) => number` | Design units → pixels |
| `fixedToFloat` | `(raw, intBits, fracBits, signed?) => number` | Generic: raw → float |
| `floatToFixed` | `(value, intBits, fracBits, signed?, opts?) => number` | Generic: float → bit-pattern |

### Option `opts`

The `floatTo*` functions accept an optional `{ strict: boolean }` object:

- `strict: false` (default) — out-of-range values are clamped; NaN/Infinity return `0` or the max value.
- `strict: true` — throws `RangeError` on NaN, Infinity, or range overflow.

### Supported formats

| Type | Total bits | Integer bits | Fraction bits | Range |
|------|-----------:|-------------:|--------------:|-------|
| Signed Fixed16.16 | 32 | 16 | 16 | -32768 to 32767.99998… |
| Unsigned UFix16.16 | 32 | 16 | 16 | 0 to 65535.99998… |
| Signed F2Dot14 | 16 | 2 | 14 | -2 to 1.99993… |
| FUnit | variable | — | — | integer × (1 / unitsPerEm) |

## Examples

### SFNT / OpenType — matrices and axis coords

```js
const fp = runtime.resolve('fixedPoint');

// Read a Fixed16.16 matrix from a DataView
const m00 = fp.fixed16ToFloat(view.getUint32(offset, false)); // → e.g. 1.0

// Axis coordinate F2Dot14 (avar / gvar)
const coord = fp.f2dot14ToFloat(view.getUint16(offset, false)); // → -1.0 … 1.99993…

// Design-unit → pixels (layout)
const px = fp.funitToPx(2048, 16, 1024); // → 8.0
```

### Generic Fixed8.8 (unsigned)

```js
const fp = runtime.resolve('fixedPoint');

const value = fp.fixedToFloat(0x0180, 8, 8, false); // → 1.5
const raw   = fp.floatToFixed(1.5, 8, 8, false);    // → 0x0180
```

### Strict conversion (throws on overflow)

```js
const fp = runtime.resolve('fixedPoint');

fp.floatToFixed16(100000);                      // → 0x7FFFFFFF (clamp)
fp.floatToFixed16(100000, { strict: true });    // throws RangeError
fp.floatToFixed16(NaN);                         // → 0
fp.floatToFixed16(NaN, { strict: true });       // throws RangeError
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const result = libs.fixedPoint.fixed16ToFloat(args.raw);
        self.postMessage(result);
    },
    { dependencies: ['fixedPoint'], args: { raw: 0x00018000 } } // → 1.5
);
```

## Notes

- **float64 precision**: Fixed16.16 (32 bits) fits comfortably within `Number.MAX_SAFE_INTEGER`; no `BigInt` needed in v1.
- **F2Dot14 boundary**: `floatToF2dot14(2.0)` → `0x7FFF` (max representable), `floatToF2dot14(-2.0)` → `0x8000` (min).
- **Unsigned representation**: `floatTo*` methods always return an unsigned bit-pattern (positive JS integer), even for signed formats — conforming to the DataView/ArrayBuffer standard.
- **No npm dependencies**: pure JS implementation, worker-safe.

## See also

- [linalg](./linalg.md) — transformation matrices (uses Fixed16.16 in SFNT)
- [geom](./geom.md) — 2D geometry (FUnit coordinates for typographic layouts)
