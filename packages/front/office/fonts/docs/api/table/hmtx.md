---
module: tableHmtx
category: table/hmtx
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableHmtx

> Table `hmtx` — Horizontal Metrics (OT §6.4.4).

**Module** `tableHmtx` | **Source** `packages/front/office/fonts/src/table/hmtx.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Layout:

```
hMetrics[numberOfHMetrics]       (advanceWidth uint16 + lsb int16)
leftSideBearings[numGlyphs - numberOfHMetrics]   (int16)
```

The lsb-only tail reuses the **last** `advanceWidth` from `hMetrics` — a compaction trick for monospaced suffixes.

## Resolve

```js
const { parseHmtx, encodeHmtx } = runtime.resolve('tableHmtx');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseHmtx` | `(bytes, numberOfHMetrics, numGlyphs) => { metrics: Array<{advanceWidth, lsb}> }` | Always `numGlyphs` entries (tail advances are propagated). |
| `encodeHmtx` | `({ metrics }) => { bytes, numberOfHMetrics }` | Compresses the tail of identical advances. |

## Examples

### Parse

```js
const { parseHmtx } = runtime.resolve('tableHmtx');
const hmtx = parseHmtx(sfnt.tables.hmtx.bytes, hhea.numberOfHMetrics, maxp.numGlyphs);
console.log(hmtx.metrics[0]);   // { advanceWidth, lsb }
```

### Encode and update hhea

```js
const { bytes, numberOfHMetrics } = encodeHmtx({ metrics });
hhea.numberOfHMetrics = numberOfHMetrics;   // keep in sync
```

## Notes

- `numberOfHMetrics` outside `[1, numGlyphs]` throws `ParseError('fonts/hmtx-bad-count')`.
- The encoder walks back from the end while `m[n-1].advanceWidth === m[n-2].advanceWidth` — no tolerance / fuzzy matching.

## See also

- [hhea](./hhea.md) — provides `numberOfHMetrics`
- [maxp](./maxp.md)
