---
module: tableHhea
category: table/hhea
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableHhea

> Table `hhea` — Horizontal Header (OT §6.4.3), 36 bytes.

**Module** `tableHhea` | **Source** `packages/front/office/fonts/src/table/hhea.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Drives how advance widths are interpreted in `hmtx` via `numberOfHMetrics`, which decides how many full records precede the lsb-only tail.

## Resolve

```js
const { parseHhea, encodeHhea } = runtime.resolve('tableHhea');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseHhea` | `(bytes: Uint8Array) => HheaTable` | Throws if `< 36` bytes. |
| `encodeHhea` | `(hhea: HheaTable) => Uint8Array` | Exactly 36 bytes. |

### `HheaTable`

| Field | Type |
|-------|------|
| `majorVersion`, `minorVersion` | uint16 |
| `ascender`, `descender`, `lineGap` | int16 |
| `advanceWidthMax` | uint16 |
| `minLeftSideBearing`, `minRightSideBearing`, `xMaxExtent` | int16 |
| `caretSlopeRise`, `caretSlopeRun`, `caretOffset` | int16 |
| `metricDataFormat` | int16 |
| `numberOfHMetrics` | uint16 |

## Examples

```js
const { parseHhea } = runtime.resolve('tableHhea');
const hhea = parseHhea(sfnt.tables.hhea.bytes);
console.log(hhea.ascender, hhea.numberOfHMetrics);
```

## Notes

- 4 reserved `int16` records (between `caretOffset` and `metricDataFormat`) are read then discarded at parse time, written as zero at encode.
- `numberOfHMetrics` must be ≥ 1 and ≤ `maxp.numGlyphs` — validated on the `hmtx` side.

## See also

- [hmtx](./hmtx.md) — depends on `numberOfHMetrics`
- [maxp](./maxp.md)
