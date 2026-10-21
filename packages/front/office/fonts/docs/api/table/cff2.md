---
module: tableCff2
category: table/cff2
dependencies: [fontErrors, fontReader, tableCffDict]
returns: object
worker-safe: true
status: complete
---

# tableCff2

> Table `CFF2` — Compact Font Format 2, the variable-aware outline container (OT §10.2).

**Module** `tableCff2` | **Source** `packages/front/office/fonts/src/table/cff2.js` | **Deps** `fontErrors`, `fontReader`, `tableCffDict` | **Worker-safe** yes

Reads the CFF2 header, the single Top DICT, the Global Subr INDEX, the CharStrings INDEX, the Font DICT array with each Private DICT, and the bytes of the Item Variation Store. CFF2 differs from [CFF](./cff.md): there is no Name, String, Encoding or Charset data (names live in `name`), the Top DICT is one block rather than an INDEX, and every INDEX carries a `uint32` count.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseCff2` | function | `(bytes: Uint8Array) => { majorVersion, minorVersion, headerSize, topDictLength, topDict, globalSubrIndex, charStringsIndex, vstore, fdArray, vstoreOffset?, vstoreBytes? }`. `topDict` is a `Map<operator, operand[]>`; `charStringsIndex` is `null` when the Top DICT has no single-offset `CharStrings` entry; `fdArray` is `null` without a single-offset `FDArray` (`12 36`) entry, else one `{ fontDict, private }` per Font DICT — `fontDict` a `Map`, `private` `{ size, offset, bytes, dict }` from its `Private` (`18`) entry (`null` when absent); `vstore` is `null` without a single-offset `vstore` (`24`) entry, else `{ offset, length, data }` — the declared `uint16` length and a zero-copy view of the Item Variation Store that follows it; `vstoreOffset` and `vstoreBytes` (from the offset to the end of the table) are present with it. |
| `parseCff2Index` | function | `(r: BinaryReader) => { count, offSize, offsets, data, items, end }`. Reads one INDEX with a `uint32` count from the reader's current position. |
| `CFF2_TOP_DICT_OPS` | const | Frozen map of Top DICT operator code to name (OpenType CFF2): `17` `CharStrings`, `24` `vstore`, `0x0C07` `FontMatrix`, `0x0C24` `FDArray`, `0x0C25` `FDSelect`. |
| `tableCff2` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSfnt } = fw.runtime.resolve('fontSfnt');
const { parseCff2 } = fw.runtime.resolve('tableCff2');

const sfnt = parseSfnt(bytes);   // bytes: Uint8Array of an OpenType font with a CFF2 table
const cff2 = parseCff2(sfnt.tables.CFF2.bytes);
console.log(cff2.charStringsIndex?.count, cff2.vstoreOffset);
```

## Notes

- `parseCff2Index` returns `{ count: 0, offSize: 0, offsets: [], data: <empty Uint8Array>, items: [], end }` for an empty INDEX. Otherwise `items[i]` is a zero-copy view into the source bytes, and `offsets` holds `count + 1` entries.
- The Top, Font and Private DICTs are decoded through `tableCffDict` (`parseDict(bytes, { cff2: true })`, which also reads the CFF2 operators `22` `vsindex`, `23` `blend` and `24` `vstore`) into a `Map` keyed by the packed operator (`0x0C00 | op` for two-byte operators). A `blend` in a Private DICT is recorded with its raw operands; it is not evaluated against the variation store.
- The CharStrings INDEX is read only when the `CharStrings` operand (`17`) holds exactly one offset. Charstring programs (including `blend` and `vsindex`) are returned as raw bytes and are not interpreted.
- The Item Variation Store is located and sized (`vstore.data`) but not decoded into regions and deltas.
- `FDSelect` (`12 37`) is labelled but not decoded, and Local Subr INDEXes (`Subrs` in a Private DICT) are not read.
- `parseCff2` skips ahead to `headerSize` before reading the Top DICT, so a header longer than 5 bytes is accepted.
- Errors (all `ParseError`): `fonts/cff2-short` (fewer than 5 bytes), `fonts/cff2-version` (major version is not 2), `fonts/cff2-index-offsize` (INDEX `offSize` outside 1..4), `fonts/cff2-index-first-offset` (first INDEX offset is not 1), `fonts/cff2-index-truncated` (the `uint32` count needs more offset bytes than the reader holds, checked before anything is allocated), `fonts/cff2-index-bad-offset` (an INDEX offset below the previous one), `fonts/cff2-vstore-range` (the VariationStore or its declared length runs past the table), `fonts/cff2-fdarray-range` (the FDArray offset is outside the table), `fonts/cff2-private-range` (a Private DICT `[size, offset]` runs past the table).

## See also

- [cff](./cff.md) — the CFF 1 counterpart
- [gvar](./gvar.md) — variation data for TrueType outlines
- [hvar](./hvar.md) — variation of horizontal metrics
- [sfnt](../sfnt/sfnt.md) — host container
