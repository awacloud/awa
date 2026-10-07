---
module: smlSheetConfig
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# smlSheetConfig

> SML — typed worksheet-level configuration (`sheetPr`, `sheetFormatPr`, printOptions, pageMargins, …).

**Module** `smlSheetConfig` | **Source** `packages/front/office/ooxml/src/extra/sml-sheet-config.js` | **Deps** `xml` | **Worker-safe** yes

Adds typed fields for the per-sheet configuration block surrounding the actual `<sheetData>` (sheetPr, dimension, sheetFormatPr, page setup, headers/footers, breaks, custom views, phoneticPr, sheetCalcPr).

## Resolve

```js
const ext = smlSheetConfig.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseSheetConfig` / `renderSheetConfig` | `(rootChildren) => SheetConfig` / `(s) => xmlNode[]` | the whole per-sheet block in one pass (`sheetPr`, `dimension`, `sheetFormatPr`, `sheetCalcPr`, `phoneticPr`, `printOptions`, `pageMargins`, `pageSetup`, `headerFooter`, `rowBreaks`, `colBreaks`, `sheetProtection`, `protectedRanges[]`, `customSheetViews[]`) |
| `parseSheetPr` / `renderSheetPr` | — | `<sheetPr>` (codeName, filterMode, published, …, `tabColor`, `outlinePr`, `pageSetUpPr`) |
| `parseHeaderFooter` / `renderHeaderFooter` | — | `<headerFooter>` (oddHeader/oddFooter/evenHeader/evenFooter/firstHeader/firstFooter text + attrs) |
| `parseBreaks` / `renderBreaks` | `(node) => Breaks` / `(name, b) => xmlNode` | `<rowBreaks>`/`<colBreaks>` (shared shape, `renderBreaks` needs the tag name) |
| `parseCustomSheetView` / `renderCustomSheetView` | — | one `<customSheetView>` (pageMargins/pageSetup/printOptions/headerFooter/rowBreaks/colBreaks) |

`printOptions`, `pageMargins`, `pageSetup`, `sheetFormatPr`, `protectedRanges` and `sheetCalcPr` are typed only *inside* `parseSheetConfig`/`renderSheetConfig` (plain attribute picks) — there is no standalone `parsePageSetup`/`parsePrintOptions`/etc.

## Elements typed

`sheetPr` (tabColor, outlinePr, pageSetUpPr, codeName), `dimension`, `sheetFormatPr`, `sheetCalcPr`, `phoneticPr`, `printOptions`, `pageMargins`, `pageSetup`, `headerFooter` (oddHeader/oddFooter/evenHeader/…), `rowBreaks`, `colBreaks`, `sheetProtection`, `protectedRanges`, `customSheetViews`.

## Notes

- Custom views are kept as raw nodes (rare).
- Header/footer text uses Excel codes (`&L`, `&C`, `&R`, `&P`, `&N`); preserved as strings.

## See also

- [sml-workbook-config](./sml-workbook-config.md)
