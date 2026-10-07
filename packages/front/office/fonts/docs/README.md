# @awacloud/fonts — Documentation

General index of the `@awacloud/fonts` package documentation.

**Prerequisites**: the `@awacloud/fonts` package, an `@awacloud/fw` runtime to resolve its module descriptors, and a JavaScript runtime that provides `Uint8Array`, `DataView`, `TextEncoder` and `TextDecoder` (the package uses no other platform API).

**Maturity: L4** (`awa.maturity` in `package.json`). Surface covered: SFNT +
WOFF1/WOFF2 + TTC containers, the OpenType v1.9 tables, required and
advanced (CFF/CFF2, GSUB/GPOS/GDEF, variable fonts, colour fonts, vertical
metrics, bitmaps), the `embed-pdf` helpers, ToUnicode CMap, Standard 14,
PDF/legacy encodings, extras (RM05 hinting, Apple AAT parsers, Arabic/Indic/CJK
shaper helpers, WOFF2 write, DSIG/MATH/JSTF) and bundles (`fonts-large`,
`fonts-full`, `fonts-apple-aat`). The known limits (layout lookups parsed but
not applied, WOFF2 `glyf` transform not reversed, TrueType-only subsetting,
Apple AAT state machines not decoded) are listed in the package README.

## Sections

| Section | Target |
|---------|--------|
| [User guide](./guide/) | Getting started: read a font, get a glyph, extend with `.use(...)`, typed errors |
| [API by module](./api/) | Reference pages, organised like `src/`; the entry point is [api/main](./api/main.md) |
| [API: errors](./api/errors.md) | Error classes, security codes, validation caps and code families |

## Getting started

- [Quick Start](./guide/getting-started.md) — Read a TTF, extract a glyph, list metrics.
- [API: fonts](./api/fonts.md) — Top-level orchestrator (`fonts.read`, `.use()`).
- [API: sfnt](./api/sfnt/sfnt.md) — SFNT container + table directory.
- [API: errors](./api/errors.md) — `ParseError` / `ContractError` /
  `RenderError` + security codes (`fonts/cmap-range-bomb`,
  `fonts/glyf-too-many-components`, `fonts/inconsistent-tables`, …).

## See also

- `@awacloud/ooxml` ([docs](https://github.com/awacloud/awa/tree/@awacloud/fonts@1.0.0/packages/front/office/ooxml/docs)) — the sibling package whose docs layout (`api/` + `bundles/` + `guide/`) this one follows.
- OpenType spec: <https://learn.microsoft.com/en-us/typography/opentype/spec/>.
- TrueType Reference Manual: <https://developer.apple.com/fonts/TrueType-Reference-Manual/>.
