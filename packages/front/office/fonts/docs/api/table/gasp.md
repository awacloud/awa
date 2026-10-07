---
module: tableGasp
category: table/gasp
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableGasp

> Table `gasp` — grid-fitting/anti-aliasing per ppem (OT §6.4.18).

**Module** `tableGasp` | **Source** `packages/front/office/fonts/src/table/gasp.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Indicates, for each ppem slice, how the rasteriser should handle hinting and smoothing. Version 0 or 1, format `{ rangeMaxPPEM, rangeGaspBehavior }`.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `GASP_FLAG` | const | Bitfield `{ GRIDFIT, DOGRAY, SYMMETRIC_GRIDFIT, SYMMETRIC_SMOOTHING }`. |
| `parseGasp` | function | `(bytes) => { version, ranges: Range[] }`. |
| `tableGasp` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseGasp, GASP_FLAG } = fw.runtime.resolve('tableGasp');
const gasp = parseGasp(sfnt.tables.gasp.bytes);
const useGridfit = gasp.ranges[0].rangeGaspBehavior & GASP_FLAG.GRIDFIT;
```

## Notes

- `rangeMaxPPEM = 0xFFFF` marks the last range (catch-all).
- Version 1 adds `SYMMETRIC_*`; unknown bits are preserved.

## See also

- [extra/tt-hinting](../extra/tt-hinting.md) — RM05 VM consumer
