---
module: tableCmap
category: table/cmap
dependencies: [fontErrors, fontReader, tableCmapFormats]
returns: object
worker-safe: true
status: complete
---

# tableCmap

> Table `cmap` — Character to Glyph Index Mapping (OT §6.4.1).

**Module** `tableCmap` | **Source** `packages/front/office/fonts/src/table/cmap.js` | **Deps** `fontErrors`, `fontReader`, `tableCmapFormats` | **Worker-safe** yes

Parses the header + every `encodingRecords` entry and its subtable. Formats decoded into `Map<codePoint, glyphID>`:

- **Format 0** — 256-byte direct array (Mac Roman legacy).
- **Format 2** — high-byte mapping (legacy CJK).
- **Format 4** — segment mapping to delta values (Windows BMP).
- **Format 6** — trimmed table mapping.
- **Format 12** — segmented coverage (Unicode full repertoire, uint32).
- **Format 13** — many-to-one segmented coverage.
- **Format 14** — Unicode Variation Sequences (defaultUVS + nonDefaultUVS).

Other formats (including format 10) are recognised at metadata level only (`{ format, parsed: false, length }`) and left unparsed.

### Parser hardening

- **`fonts/cmap-range-bomb`** — Formats 12 and 13 declared
  `startCharCode`/`endCharCode` as `uint32`. A malicious font could
  declare `(0, 0xFFFFFFFF)` → a loop of 4 billion entries (OOM/hang).
  Each group is now bounded to the Unicode domain `[0..0x10FFFF]`
  and the materialised total is capped at `2 × 0x110000`. Any
  violation throws `ParseError('fonts/cmap-range-bomb')`.
- **Format 14 — independent sub-readers** — `parseFormat14` used to
  rely on `r.peek(rr => { rr.seek(...); return rr; })` to obtain its
  sub-tables. `peek` restores the parent cursor on return, so every
  subsequent `sub.readUint*` call was reading from the *pre-peek*
  position. `defaultUVS` / `nonDefaultUVS` were therefore silently
  corrupted. The code now uses `r.sub(rel, length)`, which returns an
  independent reader. Locked in by two regression tests in
  `tests/fuzz.test.js`.
- **`fonts/cmap-too-many-subtables`** — `cmap.numTables ≤ 64`.

## Resolve

```js
const { parseCmap, pickUnicodeMap } = runtime.resolve('tableCmap');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseCmap` | `(bytes: Uint8Array) => { version, encodings: Array }` | One `encodings[i]` entry per directory record. |
| `pickUnicodeMap` | `(cmap) => Map<number, number> \| null` | Selects the best Unicode subtable. |

### `pickUnicodeMap` preference order

1. Windows / Unicode full repertoire (3, 10)
2. Unicode platform / Unicode 2.0 full (0, 4)
3. Windows / Unicode BMP (3, 1)
4. Unicode platform / any
5. Any subtable exposing `.map`

### Shape of a record

```js
{
    platformID, encodingID, subtableOffset,
    subtable: { format, length, language, map: Map<cp, gid>, ... }
}
```

## Examples

### Parse + pick

```js
const { parseCmap, pickUnicodeMap } = runtime.resolve('tableCmap');
const cmap = parseCmap(sfnt.tables.cmap.bytes);
const unicode = pickUnicodeMap(cmap);
const gidA = unicode.get(0x41);
```

## Notes

- An out-of-bounds subtable offset throws `ParseError('fonts/cmap-bad-offset')`.
- Format 4 implements the OT pointer arithmetic exactly (`idRangeOffset[i]/2 + (c - startCode[i]) + &idRangeOffset[i]`).
- Format 12 uses `uint32` throughout — supports codepoints beyond the BMP — always under the Unicode cap (see "Parser hardening").
- See [errors](../errors.md) for the complete list of `fonts/cmap-*`
  error codes thrown.

## See also

- [fonts](../fonts.md) — consumes `pickUnicodeMap` for `unicodeMap`
- [name](./name.md)
