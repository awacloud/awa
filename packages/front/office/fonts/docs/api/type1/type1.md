---
module: fontType1
category: type1/type1
dependencies: [fontErrors, encodingStandard, fontType1Charstring]
returns: object
worker-safe: true
status: complete
---

# fontType1

> A Type 1 font program read, and its glyphs drawn.

**Module** `fontType1` | **Source** `packages/front/office/fonts/src/type1/type1.js` | **Deps** `fontErrors`, `encodingStandard`, `fontType1Charstring` | **Worker-safe** yes

Reads the program of an Adobe Type 1 font (*Adobe Type 1 Font Format*): a PFB file, a PFA file, or a PDF `/FontFile` stream (ISO 32000-2 §9.9). It is not an sfnt font: [`fonts.read`](../fonts.md) does not take it, and the result has no tables.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `readType1` | function | `(bytes, opts?) => Type1Font`; `opts.length1` and `opts.length2`, a PDF stream's `/Length1` and `/Length2`, split the program when given. |
| `fontType1` | factory | Factory. |

`Type1Font`:

| Member | Description |
|--------|-------------|
| `fontName` | The `/FontName`, or `null`. |
| `fontMatrix` | The six numbers of `/FontMatrix` (default `[0.001 0 0 0.001 0 0]`). |
| `fontBBox` | The four numbers of `/FontBBox`. |
| `encoding` | The built-in encoding: 256 glyph names, `null` for an empty (`.notdef`) slot; `StandardEncoding` when the font names it or has no `/Encoding`. |
| `glyphNames` | The `CharStrings` keys, in the program's order. |
| `glyph(name)` | `{ name, advanceWidth, leftSideBearing, path }`, or `null` for a name the font lacks. `path` is the commands `M`, `L`, `C`, `Z` in character space (see [charstring](./charstring.md)); a `seac` glyph's base and accent are drawn into it. Computed on the first call, then kept. |

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/fonts';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { readType1 } = runtime.resolve('fontType1');

// a PDF /FontFile stream, decoded, with its /Length1 and /Length2
const font = readType1(program, { length1, length2 });
const a = font.glyph(font.encoding[0x41]);
```

## Notes

- **Forms**: a PFB is read by its `0x80` segments (ASCII, binary, end). Otherwise the text must start with `%!`; the eexec section starts at `opts.length1` when an `eexec` token ends there, else after the `eexec` token. After a token found by search, the white space before the section is skipped, unless reading one of its bytes as the section's start decrypts to text and skipping it does not. A section whose first four characters are hex digits is read as hex.
- **The trailer** (512 zeros and `cleartomark`) is optional, as PDF producers often leave it out.
- **eexec** is decrypted with key 55665 and its first four bytes dropped; each charstring and subroutine with key 4330 and its first `lenIV` bytes dropped (`lenIV` from the Private dict, default 4; −1 stores them unencrypted).
- **The Private dict**: `lenIV`, `Subrs` (`dup <i> <n> RD <bytes> NP`) and the `CharStrings` dict (`/<name> <n> RD <bytes> ND`), whatever tokens the font names its `RD`, `ND` and `NP` procedures with (`-|`, `|-`, `|` are common).
- **Errors** (`ParseError`): `fonts/type1-not-type1` (neither a PFB nor text starting `%!`), `fonts/type1-no-eexec`, `fonts/type1-bad-dict` (no `CharStrings` dict, or a binary string past the end). A glyph's charstring throws its error on `glyph(name)`, not on the read ([charstring](./charstring.md)). Bytes that are not a `Uint8Array` throw `ContractError` `fonts/type1-bad-input`.
- **Not read**: the hints (the outlines are unhinted), the `OtherSubrs` PostScript procedures (their effect is built in, see [charstring](./charstring.md)), and Multiple Master blending.
- **Measured** by the axis-C suite `fonttools-type1` (office-scorecard): every glyph of the pinned PDFs' Type 1 programs against fontTools 4.66.1.

## See also

- [charstring](./charstring.md) · [encodings/standard](../encodings/standard.md)
