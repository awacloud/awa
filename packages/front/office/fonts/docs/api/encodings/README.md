# Encodings — PDF / Type 1 byte-to-glyph mappings

256-entry encodings mapping a byte code to a PostScript glyph name. Used by single-byte PDF fonts (Type 1 / TrueType-with-Encoding).

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [winAnsi](./winAnsi.md) | `{ WIN_ANSI, lookup }` | none | WinAnsiEncoding (PDF Annex D.2). |
| [macRoman](./macRoman.md) | `{ MAC_ROMAN, lookup }` | none | MacRomanEncoding, classic Mac OS. |
| [macExpert](./macExpert.md) | `{ MAC_EXPERT, lookup }` | none | MacExpertEncoding companion fonts. |
| [standard](./standard.md) | `{ STANDARD, lookup }` | none | Adobe Type 1 base. |
| [symbol](./symbol.md) | `{ SYMBOL, lookup }` | none | Built-in Symbol font. |
| [zapfDingbats](./zapfDingbats.md) | `{ ZAPF_DINGBATS, lookup }` | none | Built-in ZapfDingbats. |
| [lookup](./lookup.md) | `{ lookupEncoding, findCode, KNOWN_ENCODINGS }` | `fontErrors`, `encodingWinAnsi`, `encodingMacRoman`, `encodingMacExpert`, `encodingStandard`, `encodingSymbol`, `encodingZapfDingbats` | Dispatcher by encoding name. |
| [aglTable](./aglTable.md) | `{ AGL_TABLE, lookup }` | none | Adobe Glyph List data table (glyph name → Unicode code points) behind `agl`. |
| [zapfDingbatsGlyphs](./zapfDingbatsGlyphs.md) | `{ ZAPF_DINGBATS_GLYPHS, lookup }` | none | ITC Zapf Dingbats Glyph List data table (the Zapf Dingbats font's glyph names → Unicode) behind `agl`'s `dingbatsNameToUnicode`. |
| [agl](./agl.md) | `{ glyphNameToUnicode, dingbatsNameToUnicode }` | `encodingAglTable`, `encodingZapfDingbatsGlyphs` | Adobe Glyph List name → Unicode resolver (glyph name → Unicode, not byte → glyph name), and the Zapf Dingbats names for a Zapf Dingbats font. |
| [texMath](./texMath.md) | `{ OMS, OML, OMX, text }` | none | The Computer Modern math layouts (cmsy, cmmi, cmex): the text at each position, not a glyph name. |
