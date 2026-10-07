---
module: tableVmtx
category: table/vmtx
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableVmtx

> Table `vmtx` — Vertical Metrics (OT §6.4.11).

**Module** `tableVmtx` | **Source** `packages/front/office/fonts/src/table/vmtx.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Mirror of [hmtx](./hmtx.md) for vertical layout. Layout:

```
vMetrics[numOfLongVerMetrics]                      (advanceHeight uint16 + tsb int16)
topSideBearings[numGlyphs - numOfLongVerMetrics]   (int16)
```

The tsb-only tail reuses the **last** `advanceHeight` from `vMetrics`.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseVmtx` | function | `(bytes: Uint8Array, numOfLongVerMetrics: number, numGlyphs: number) => { metrics }`. `metrics` has `numGlyphs` entries, each `{ advanceHeight, tsb }`. |
| `encodeVmtx` | function | `(vmtx: { metrics: Array<{ advanceHeight, tsb }> }) => { bytes: Uint8Array, numOfLongVerMetrics: number }`. |
| `tableVmtx` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSfnt } = fw.runtime.resolve('fontSfnt');
const { parseVhea } = fw.runtime.resolve('tableVhea');
const { parseMaxp } = fw.runtime.resolve('tableMaxp');
const { parseVmtx, encodeVmtx } = fw.runtime.resolve('tableVmtx');

const sfnt = parseSfnt(bytes);   // bytes: Uint8Array of a font with vhea + vmtx
const vhea = parseVhea(sfnt.tables.vhea.bytes);
const { numGlyphs } = parseMaxp(sfnt.tables.maxp.bytes);
const { metrics } = parseVmtx(sfnt.tables.vmtx.bytes, vhea.numOfLongVerMetrics, numGlyphs);
console.log(metrics[0].advanceHeight, metrics[0].tsb);

// Re-encode: the trailing run of equal advances is folded into the tsb-only tail.
const { bytes: vmtxBytes, numOfLongVerMetrics } = encodeVmtx({ metrics });
```

## Notes

- The caller supplies the two counts: `numOfLongVerMetrics` comes from [vhea](./vhea.md) and `numGlyphs` from [maxp](./maxp.md).
- Glyphs beyond `numOfLongVerMetrics` get an `advanceHeight` equal to the last long metric's advance.
- `advanceHeight` is read as `uint16` and `tsb` as `int16`. On encode, `advanceHeight` is masked to 16 bits and `tsb` is truncated to an integer.
- `encodeVmtx` compacts: it keeps, as the last long metric, the first glyph of the trailing run of equal advances (at least one long metric is always kept), and returns that count as `numOfLongVerMetrics` so the caller can store it in `vhea`.
- Errors (all `ParseError`): `fonts/vmtx-bad-count` (`numOfLongVerMetrics` outside `1..numGlyphs`), `fonts/vmtx-short` (fewer bytes than `numOfLongVerMetrics * 4 + (numGlyphs - numOfLongVerMetrics) * 2`), `fonts/vmtx-empty` (`encodeVmtx` given an empty `metrics` array).

## See also

- [vhea](./vhea.md) — supplies `numOfLongVerMetrics`
- [vorg](./vorg.md) — vertical origins
- [hmtx](./hmtx.md) — horizontal counterpart
- [maxp](./maxp.md) — supplies `numGlyphs`
