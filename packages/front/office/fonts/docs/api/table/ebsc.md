---
module: tableEbsc
category: table/ebsc
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableEbsc

> Table `EBSC` — Embedded Bitmap Scaling (OT §8.4).

**Module** `tableEbsc` | **Source** `packages/front/office/fonts/src/table/ebsc.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Lists the strikes that should be produced by scaling another strike instead of storing bitmaps for them. Each record is 28 bytes: two line-metrics blocks, the requested ppem and the substitute ppem.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseEbsc` | function | `(bytes: Uint8Array) => { majorVersion, minorVersion, sizes: BitmapScale[] }`. |
| `tableEbsc` | factory | Factory `{ name, dependencies, factory }`. |

### `BitmapScale`

| Field | Type |
|-------|------|
| `hori`, `vert` | `SbitLineMetrics` (same shape as in [eblc](./eblc.md): `ascender`, `descender`, `widthMax`, `caretSlopeNumerator`, `caretSlopeDenominator`, `caretOffset`, `minOriginSB`, `minAdvanceSB`, `maxBeforeBL`, `minAfterBL`, `pad1`, `pad2`) |
| `ppemX`, `ppemY` | uint8 — the strike being produced |
| `substitutePpemX`, `substitutePpemY` | uint8 — the strike it is scaled from |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSfnt } = fw.runtime.resolve('fontSfnt');
const { parseEbsc } = fw.runtime.resolve('tableEbsc');

const sfnt = parseSfnt(bytes);   // bytes: Uint8Array of a font with an EBSC table
const ebsc = parseEbsc(sfnt.tables.EBSC.bytes);
for (const s of ebsc.sizes) console.log(`${s.ppemX}x${s.ppemY} <- ${s.substitutePpemX}x${s.substitutePpemY}`);
```

## Notes

- The whole table is decoded: header, then `numSizes` fixed-size records. There is no raw remainder.
- Errors (all `ParseError`): `fonts/ebsc-short` (fewer than 8 bytes), `fonts/ebsc-version` (major version is neither 2 nor 3).

## See also

- [eblc](./eblc.md) — the strikes that exist
- [ebdt](./ebdt.md) — their bitmap data
- [cblc](./cblc.md) — color bitmap location counterpart
- [cbdt](./cbdt.md) — color bitmap data counterpart
