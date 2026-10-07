---
module: tableGvar
category: table/gvar
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableGvar

> Table `gvar` — Glyph Variations (OT §10.6.5).

**Module** `tableGvar` | **Source** `packages/front/office/fonts/src/table/gvar.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Stores, per glyph, the tuples (peak axis in F2Dot14) and X/Y point deltas describing the deformation at different axis locations.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseGvar` | function | `(bytes) => { majorVersion, minorVersion, axisCount, glyphCount, flags, sharedTuples, getGlyphVariationData(gid), parseGlyphVariations(gid) }`. `getGlyphVariationData(gid)` returns the raw per-glyph `Uint8Array` slice (or `null`); `parseGlyphVariations(gid)` decodes it via `parseGlyphVariationData`. |
| `parseGlyphVariationData` | function | `(bytes, axisCount, sharedTuples) => { tupleVariationCount, headers, serialisedData }`. |
| `unpackPointNumbers` | function | Decodes the packed point-numbers stream (RM06). |
| `unpackDeltas` | function | Decodes the packed deltas stream. |
| `EMBEDDED_PEAK_TUPLE`, `INTERMEDIATE_REGION`, `PRIVATE_POINT_NUMBERS`, `TUPLE_INDEX_MASK` | const | Tuple-index bitfield masks. |
| `tableGvar` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseGvar } = fw.runtime.resolve('tableGvar');
const gvar = parseGvar(sfnt.tables.gvar.bytes);
const variations = gvar.parseGlyphVariations(42);
```

## Notes

- Offsets are uint16 or uint32 depending on `flags & 1`.
- `EMBEDDED_PEAK_TUPLE (0x8000)` indicates an inline peak; otherwise it references a shared tuple.

## See also

- [fvar](./fvar.md) [avar](./avar.md) [hvar](./hvar.md) [mvar](./mvar.md)
- [glyf](./glyf.md) — applies the deltas
