---
module: tableCff
category: table/cff
dependencies: [fontErrors, fontReader, tableCffIndexRecord, tableCffDict, tableCffCharstring]
returns: object
worker-safe: true
status: complete
---

# tableCff

> Table `CFF ` — Compact Font Format Type 2 (OT §10).

**Module** `tableCff` | **Source** `packages/front/office/fonts/src/table/cff.js` | **Deps** `fontErrors`, `fontReader`, `tableCffIndexRecord`, `tableCffDict`, `tableCffCharstring` | **Worker-safe** yes

Parses the CFF container: 5-byte header + INDEX (Name / Top DICT / String / Global Subr), then per font the Charset / CharStrings / Private DICT / Local Subr INDEX. Type 2 charstrings are decoded glyph-by-glyph via `decodeCharstring`.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseIndex` | function | `(r: BinaryReader) => { count, offSize, offsets, data, items, end }` |
| `parseDict` | function | Decodes an alternating stream of CFF DICT operands / operators into a `Map<operator, operand[]>`. |
| `TOP_DICT_OPS` | const | Frozen map of Top DICT operators (version, FamilyName, CharStrings, …). |
| `parseCff` | function | `(bytes: Uint8Array) => { major, minor, hdrSize, offSize, nameIndex, topDictIndex, stringIndex, globalSubrIndex, fonts }`. `fonts[i]` is `{ name, topDict, charStringsIndex, privateDict, localSubrIndex, charset }`. |
| `subrBias` | function | Computes the Type 2 subroutine index bias (107 / 1131 / 32768). |
| `decodeCharstring` | function | Interprets a Type 2 charstring and returns its operations (path-like). |
| `tableCff` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseCff } = fw.runtime.resolve('tableCff');
const cff = parseCff(sfnt.tables['CFF '].bytes);
const font = cff.fonts[0];
console.log(font.topDict, font.charStringsIndex.count);
```

## Notes

- Header `offSize` ∈ {1..4} drives the offset width of every INDEX.
- Operand `30` = real number encoded as nibbles terminated by `0xF`.
- CFF2 (uint32 count) is **not** supported at this level.
- Per-font data (`topDict`, `charStringsIndex`, `privateDict`, `localSubrIndex`, `charset`) lives under `cff.fonts[i]`, not at the top level.

## See also

- [sfnt](../sfnt/sfnt.md) — host container
- [glyph/path](../glyph/path.md) — typical output of a decoded charstring
