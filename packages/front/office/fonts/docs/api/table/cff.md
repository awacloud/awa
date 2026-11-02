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
| `parseDict` | function | `(bytes, opts?: { cff2?: boolean })` — decodes an alternating stream of CFF DICT operands / operators into a `Map<operator, operand[]>`. With `opts.cff2`, the CFF2 operators `22` `vsindex`, `23` `blend` and `24` `vstore` are read too; without it those bytes throw `fonts/cff-dict-bad-byte` as in CFF1. |
| `TOP_DICT_OPS` | const | Frozen map of Top DICT operators (version, FamilyName, CharStrings, …). |
| `parseCff` | function | `(bytes: Uint8Array) => { major, minor, hdrSize, offSize, nameIndex, topDictIndex, stringIndex, globalSubrIndex, fonts }`. `fonts[i]` is `{ name, topDict, charStringsIndex, privateDict, localSubrIndex, charset, glyphNames, fdArray, fdSelect }`; `charset` is the SID (CID in a CID-keyed font) of every glyph, glyph 0 being 0 (charset formats 0, 1, 2 and the predefined ISOAdobe one; `null` for the predefined Expert charsets or malformed data) and `glyphNames` each glyph's name for a name-keyed font (a standard string or a String INDEX entry; `null` for a CID-keyed font or a SID naming no string); for a CID-keyed font `fdArray` lists its Font DICTs as `{ fontDict, privateDict, localSubrIndex }` (FDArray, 12 36) and `fdSelect` is the `Uint8Array` Font DICT index of every glyph (FDSelect, 12 37, formats 0 and 3) — both `null` for a name-keyed font, or when the data is malformed (never a throw). |
| `privateForGlyph` | function | `(font, gid) => { privateDict, localSubrIndex }` — the Private DICT and local subroutines a glyph's charstring runs with: its Font DICT's in a CID-keyed font (`fdArray[fdSelect[gid]]`), else the font's own. Pass its `localSubrIndex.items` and its `privateDict` widths to `decodeCharstring`. |
| `subrBias` | function | Computes the Type 2 subroutine index bias (107 / 1131 / 32768). |
| `decodeCharstring` | function | `(bytes, ctx?) => { commands, hintCount, width?, seac? }` — interprets a Type 2 charstring. An `endchar` with four operands (five with a width) is `seac` (TN 5177 Appendix C): the result gains `seac: { adx, ady, bchar, achar }`, and with `ctx.seacGlyph(code)` — the charstring of the glyph a Standard Encoding code names, or `null` — the commands are the base glyph's then the accent's translated by `(adx, ady)`, when both resolve. |
| `CFF_STANDARD_STRINGS` | const | The 391 standard strings of the CFF specification (Appendix A), frozen: SIDs 0..390. |
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
- An INDEX whose offsets go backwards (an item ending before it starts) throws `ParseError` `fonts/cff-index-bad-offset`; the last offset then bounds every item to the INDEX data.
- Operand `30` = real number encoded as nibbles terminated by `0xF`.
- `decodeCharstring` draws every Type 2 path operator: `rlinecurve` draws its lines then one curve from the last six arguments; in `hvcurveto` / `vhcurveto` the optional fifth argument belongs to the last curve only; `flex`, `hflex`, `hflex1` and `flex1` (`12 35`, `12 34`, `12 36`, `12 37`) draw their two curves (the flex depth, a hinting value, is ignored). Hint operators only count stems; an `endchar` with accent arguments (`seac`) draws nothing.
- CFF2 (uint32 count) is **not** supported at this level.
- Per-font data (`topDict`, `charStringsIndex`, `privateDict`, `localSubrIndex`, `charset`, `fdArray`, `fdSelect`) lives under `cff.fonts[i]`, not at the top level.
- `seac` components are found by name: `ctx.seacGlyph = (code) => font.charStringsIndex.items[font.glyphNames.indexOf(STANDARD[code])]`, with `STANDARD` from `encodingStandard` (guard a missing name).
- A CID-keyed font's glyphs use the subroutines of their own Font DICT: decode glyph `gid` with `privateForGlyph(font, gid)`, never with the Top DICT's `localSubrIndex` alone.

## See also

- [sfnt](../sfnt/sfnt.md) — host container
- [glyph/path](../glyph/path.md) — typical output of a decoded charstring
