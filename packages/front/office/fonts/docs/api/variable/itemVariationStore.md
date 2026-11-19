---
module: varItemStore
category: variable/itemVariationStore
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# varItemStore

> The OpenType item variation store and delta-set index map, as `HVAR`, `VVAR`, `MVAR`, `GDEF` and `CFF2` use them.

**Module** `varItemStore` | **Source** `packages/front/office/fonts/src/variable/itemVariationStore.js` | **Deps** `fontErrors` | **Worker-safe** yes

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseItemVariationStore` | function | `(bytes, offset) => { regionCount, delta(outer, inner, coords), scalars(outer, coords) }`: the store at `offset`; `delta` sums the item's deltas, each scaled by its region's scalar at the normalised `coords` (`fvar` axis order), and gives 0 for an item the store does not hold; `scalars` gives the scalars of item variation data `outer`'s regions, in its order (what a CFF2 `blend` under `vsindex` `outer` multiplies), `[]` for data it does not hold. |
| `parseDeltaSetIndexMap` | function | `(bytes, offset) => { mapCount, get(i) }`: a format 0 or 1 map; `get(i)` gives `{ outer, inner }`, the last entry for an index past the map. |
| `varItemStore` | factory | Factory. |

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/fonts';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { parseItemVariationStore } = runtime.resolve('varItemStore');

const store = parseItemVariationStore(hvarBytes, hvarItemVariationStoreOffset);
const advanceDelta = store.delta(0, glyphId, normalisedCoords);
```

## Notes

- **A region's scalar** is the product of its axes' scalars: 1 for an axis whose peak is 0 or whose range is invalid (start past the peak, the peak past the end, or a range across 0), 0 outside `[start, end]`, else the linear ramp to 1 at the peak. A missing coordinate is 0.
- **Deltas**: the word deltas are 16-bit, or 32-bit when the `LONG_WORDS` bit (`0x8000`) is set; the others are 8-bit, or 16-bit with `LONG_WORDS`.
- **Entries** of a delta-set index map are 1 to 4 bytes (`entryFormat` bits 4–5) with 1 to 16 inner bits (bits 0–3).
- **Errors** are `ParseError`s: `fonts/ivs-short` (a structure past the bytes, or not a `Uint8Array`), `fonts/ivs-format` (another format).

## See also

- [glyph](./glyph.md) — reads `HVAR` through this store
- [hvar](../table/hvar.md) [mvar](../table/mvar.md)
