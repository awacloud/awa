# embed-pdf — PDF embedding helpers

Surface facing `@awacloud/pdf`: TrueType subsetting + PDF dicts (FontDescriptor, CIDSystemInfo, ToUnicode CMap).

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [subsetForPdf](./subsetForPdf.md) | `{ subsetForPdf }` | `fontErrors`, `fontSfnt`, `tableHead`, `tableHhea`, `tableMaxp`, `tableHmtx`, `tableLoca`, `embedFontDescriptor`, `cmapToUnicode`, `fontWriter`, `embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`, `embedHash` | Subsets a TTF + maps + descriptor + ToUnicode. |
| [fontDescriptor](./fontDescriptor.md) | `{ buildFontDescriptor, PDF_FONT_FLAG }` | `fontErrors` | FontDescriptor dict. |
| [cidSystemInfo](./cidSystemInfo.md) | `{ buildCidSystemInfo }` | none | CIDSystemInfo dict. |
| [toUnicodeBuilder](./toUnicodeBuilder.md) | `{ embedBuildToUnicode }` | `cmapToUnicode` | ToUnicode CMap stream. |
| [index](./index.md) | — | — | Section index of the four helpers above — not a module page: there is no `embed-pdf` barrel; each helper has its own sub-path export. |
