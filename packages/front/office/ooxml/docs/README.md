# Documentation `@awacloud/ooxml`

Pure-JS reader/writer for Office Open XML documents (`.docx`, `.xlsx`, `.pptx`). See the [package README](../README.md) for the high-level pitch.

## Guides

| Guide | Topic |
|-------|-------|
| [Getting started](./guide/getting-started.md) | Install, the three core formats, `ModuleRuntime` registration, the `.use()` hook |
| [Read+write docx](./guide/read-write-docx.md) | Walking paragraphs / runs / tables, `docx-large` and `docx-full` end-to-end |
| [Read+write xlsx](./guide/read-write-xlsx.md) | Cells, sheet config, pivot tables, form controls |
| [Read+write pptx](./guide/read-write-pptx.md) | Slides, layouts, animations, transitions, advanced shapes |
| [Extending](./guide/extending.md) | Write your own `extra/` module: hooks + `.use()` + tests |
| [Coverage](./guide/coverage.md) | Coverage tiers + running extras opt-in |
| [OPC overview](./guide/opc-overview.md) | The OPC container model |

## API reference

Top-level: see the [API index](./api/README.md). Per sub-domain:

- [docx core](./api/docx/docx.md) (plus [`docxWalker`](./api/docx/docx-walker.md) and [`docxText`](./api/docx/docx-text.md))
- [xlsx core](./api/xlsx/xlsx.md) (plus [`xlsxWalker`](./api/xlsx/xlsx-walker.md))
- [pptx core](./api/pptx/pptx.md) (plus [`pptxWalker`](./api/pptx/pptx-walker.md))
- [DrawingML](./api/drawingml/drawingml.md)
- [Math (OMML)](./api/math.md)
- [OPC container](./api/opc/package.md)
- [Markup Compatibility](./api/mc.md)
- XML parser: consumed from [`@awacloud/fw/io/codec/xml.js`](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/api/io/codec/xml.md)
- **[Extras (opt-in modules)](./api/extra/README.md)** — the opt-in modules that promote elements from the `_extras` fallback to typed fields
- **[Bundles](./api/bundles/README.md)** — `docx-large`, `docx-full`, `xlsx-large`, `xlsx-full`, `pptx-large`, `pptx-full`

## Core module index

The modules registered in `modules[]` (`src/main.js`), topologically ordered.

| Module | Source | Role |
|--------|--------|------|
| `ooxmlErrors` | [`src/errors.js`](../src/errors.js) | Typed error hierarchy (`OoxmlError`, `ParseError`, `RenderError`, `ContractError`). |
| `ooxmlShared` | [`src/_shared/index.js`](../src/_shared/index.js) | Namespaces, relationship types, content-types, EMU helpers. |
| `ooxmlMath` | [`src/math/math.js`](../src/math/math.js) | OMML — `<m:oMath>` + builders. |
| `markupCompatibility` | [`src/mc/markupCompatibility.js`](../src/mc/markupCompatibility.js) | mc:AlternateContent / Ignorable / ProcessContent. |
| `opcContentTypes` | [`src/opc/contentTypes.js`](../src/opc/contentTypes.js) | `[Content_Types].xml`. |
| `opcRelationships` | [`src/opc/relationships.js`](../src/opc/relationships.js) | `*.rels`. |
| `opcPackage` | [`src/opc/package.js`](../src/opc/package.js) | OPC container (ZIP + content-types + rels). |
| `drawingml` | [`src/drawingml/drawingml.js`](../src/drawingml/drawingml.js) | Shared DrawingML — typed text bodies + EMU helpers. |
| `drawingmlChart` | [`src/drawingml/chart.js`](../src/drawingml/chart.js) | `<c:chartSpace>`. |
| `drawingmlShape` | [`src/drawingml/shape.js`](../src/drawingml/shape.js) | Preset shape properties. |
| `docxProperties` | [`src/docx/properties.js`](../src/docx/properties.js) | `rPr` / `pPr` bags. |
| `docxDrawing` | [`src/docx/drawing.js`](../src/docx/drawing.js) | `<w:drawing>` + media. |
| `docxStructure` | [`src/docx/structure.js`](../src/docx/structure.js) | runs / paragraphs / tables / sections. |
| `docxStyles` | [`src/docx/styles.js`](../src/docx/styles.js) | `word/styles.xml`. |
| `docxNumbering` | [`src/docx/numbering.js`](../src/docx/numbering.js) | `word/numbering.xml`. |
| `docxSettings` | [`src/docx/settings.js`](../src/docx/settings.js) | `word/settings.xml`. |
| `docxComments` | [`src/docx/comments.js`](../src/docx/comments.js) | `word/comments.xml`. |
| `docxFootnotes` | [`src/docx/footnotes.js`](../src/docx/footnotes.js) | footnotes / endnotes. |
| `docxHeaders` | [`src/docx/headers.js`](../src/docx/headers.js) | headers / footers. |
| `docxCustomXml` | [`src/docx/customXml.js`](../src/docx/customXml.js) | customXml / SDT binding. |
| `docxWalker` | [`src/docx/docx-walker.js`](../src/docx/docx-walker.js) | `.use()` extension dispatch for docx. |
| `docxText` | [`src/docx/docx-text.js`](../src/docx/docx-text.js) | Flat text extraction helpers (`toText`). |
| `docx` | [`src/docx/docx.js`](../src/docx/docx.js) | docx orchestrator. |
| `xlsxStyles` | [`src/xlsx/styles.js`](../src/xlsx/styles.js) | `xl/styles.xml`. |
| `xlsxTables` | [`src/xlsx/tables.js`](../src/xlsx/tables.js) | `xl/tables/`. |
| `xlsxConditionalFormatting` | [`src/xlsx/conditionalFormatting.js`](../src/xlsx/conditionalFormatting.js) | CF rules. |
| `xlsxComments` | [`src/xlsx/comments.js`](../src/xlsx/comments.js) | comments + VML legacy. |
| `xlsxThreadedComments` | [`src/xlsx/threadedComments.js`](../src/xlsx/threadedComments.js) | Office 2018+ threaded comments. |
| `xlsxDrawings` | [`src/xlsx/drawings.js`](../src/xlsx/drawings.js) | charts + anchored images. |
| `xlsxWalker` | [`src/xlsx/xlsx-walker.js`](../src/xlsx/xlsx-walker.js) | `.use()` extension dispatch for xlsx. |
| `xlsx` | [`src/xlsx/xlsx.js`](../src/xlsx/xlsx.js) | xlsx orchestrator. |
| `pptxTheme` | [`src/pptx/theme.js`](../src/pptx/theme.js) | `ppt/theme/`. |
| `pptxPicture` | [`src/pptx/picture.js`](../src/pptx/picture.js) | slide pictures. |
| `pptxTable` | [`src/pptx/table.js`](../src/pptx/table.js) | slide tables. |
| `pptxChart` | [`src/pptx/chart.js`](../src/pptx/chart.js) | slide chart wrapper. |
| `pptxSlide` | [`src/pptx/slide.js`](../src/pptx/slide.js) | slides / layouts / masters. |
| `pptxWalker` | [`src/pptx/pptx-walker.js`](../src/pptx/pptx-walker.js) | `.use()` extension dispatch for pptx. |
| `pptx` | [`src/pptx/pptx.js`](../src/pptx/pptx.js) | pptx orchestrator. |

## Project documents

- [README](../README.md) — package overview
- [Changelog](../CHANGELOG.md)

## See also

- [`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/ooxml@1.0.0/packages/front/fw) — runtime + zip + crc32 + codecs (mandatory dependency)
- [Doc format spec (fw)](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/guide/doc-format.md) — page convention used here
