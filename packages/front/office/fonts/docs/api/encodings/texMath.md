---
module: encodingTexMath
category: encodings/texMath
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingTexMath

> The Computer Modern math layouts: the text at each position of cmsy, cmmi and cmex.

**Module** `encodingTexMath` | **Source** `packages/front/office/fonts/src/encodings/texMath.js` | **Deps** _(none)_ | **Worker-safe** yes

A font converted from TeX's math fonts may name its glyphs by position and carry no truthful Unicode mapping (a PDF's `/ToUnicode` and `/Differences` both repeating the names). This module gives the character each position draws, so a reader that knows a font follows one of these layouts can recover its text. Unlike the other encoding tables, it maps a code to **text**, not to a glyph name.

The layouts are the TeXbook's (Appendix F, the font tables of cmsy10, cmmi10 and cmex10). The glyph names at 68 cmsy, 86 cmmi and 51 cmex positions were checked against the built-in encodings of pdfTeX `CMSY*`, `CMMI*` and `CMEX*` Type 1 programs embedded in the reference corpus, with no conflict; the other positions follow the TeXbook.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `OMS` | const `(string\|null)[128]` | cmsy: the math symbols (`OMS[0x00]` is `−`, `OMS[0x6A]` is `\|`). |
| `OML` | const `(string\|null)[128]` | cmmi: the math italic, Greek letters included (`OML[0x0B]` is `α`, `OML[0x3D]` is `/`). |
| `OMX` | const `(string\|null)[128]` | cmex: the sized delimiters and large operators (`OMX[0x00]` is `(`, `OMX[0x58]` is `∑`). |
| `text` | function | `(layout: 'OMS'\|'OML'\|'OMX', code: number) => string\|null` — the layout's text at `code`; `null` past 127 or for another layout name. Never throws. |
| `encodingTexMath` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import { encodingTexMath } from '@awacloud/fonts';
const { text } = encodingTexMath.factory();
text('OMS', 0x00); // '−'
text('OMX', 0x00); // '(' — the same code, another layout
text('OMX', 0x30); // null — an assembly piece
```

## Notes

- `null` marks a position with no character of its own: the assembly pieces of large delimiters, radicals and braces (top, bottom, extension, middle, brace tips), the wide accents, the overlays (`negationslash`, `mapsto`, the hook pieces) and the empty slots. A caller keeps its own reading there.
- The calligraphic capitals of cmsy, the italic letters of cmmi and cmmi's old-style digits read as their plain letters and digits.
- The arrays are frozen.

## See also

- [symbol](./symbol.md) — the Symbol font's built-in encoding (glyph names)
- [agl](./agl.md) — glyph name → Unicode
