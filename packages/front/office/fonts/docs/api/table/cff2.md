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

Reads the CFF2 header, the single Top DICT, the Global Subr INDEX, the CharStrings INDEX and the location of the Item Variation Store. CFF2 differs from [CFF](./cff.md): there is no Name, String, Encoding or Charset data (names live in `name`), the Top DICT is one block rather than an INDEX, and every INDEX carries a `uint32` count.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseCff2` | function | `(bytes: Uint8Array) => { majorVersion, minorVersion, headerSize, topDictLength, topDict, globalSubrIndex, charStringsIndex, vstore, fdArray, vstoreOffset?, vstoreBytes? }`. `topDict` is a `Map<operator, operand[]>`; `charStringsIndex` is `null` when the Top DICT has no single-offset `CharStrings` entry; `vstore` and `fdArray` are always `null`; `vstoreOffset` and `vstoreBytes` are present only when the Top DICT carries a `vstore` offset. |
| `parseCff2Index` | function | `(r: BinaryReader) => { count, offSize, offsets, data, items, end }`. Reads one INDEX with a `uint32` count from the reader's current position. |
| `CFF2_TOP_DICT_OPS` | const | Frozen map of Top DICT operator code to name: `17` `CharStrings`, `18` `FDArray`, `0x0C24` `FontMatrix`, `0x0C07` `FontMatrix(legacy alias)`, `24` `vstore`. |
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
- The Top DICT is decoded through `tableCffDict` into a `Map` keyed by the packed operator (`0x0C00 | op` for two-byte operators).
- The CharStrings INDEX is read only when the `CharStrings` operand (`17`) holds exactly one offset. Charstring programs (including `blend` and `vsindex`) are returned as raw bytes and are not interpreted.
- The Item Variation Store is not decoded: `vstoreBytes` is the byte range from the `vstore` offset to the end of the table, and `vstore` stays `null`.
- The Font DICT array is not read: `fdArray` stays `null`. Private DICTs and Local Subr INDEXes are not read either.
- `parseCff2` skips ahead to `headerSize` before reading the Top DICT, so a header longer than 5 bytes is accepted.
- Errors (all `ParseError`): `fonts/cff2-short` (fewer than 5 bytes), `fonts/cff2-version` (major version is not 2), `fonts/cff2-index-offsize` (INDEX `offSize` outside 1..4), `fonts/cff2-index-first-offset` (first INDEX offset is not 1).

## See also

- [cff](./cff.md) — the CFF 1 counterpart
- [gvar](./gvar.md) — variation data for TrueType outlines
- [hvar](./hvar.md) — variation of horizontal metrics
- [sfnt](../sfnt/sfnt.md) — host container
