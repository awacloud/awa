# API `@awacloud/ooxml`

Per-module reference, organised by sub-domain. Mirrors `src/`.

## Core

| Module | Source | Description |
|--------|--------|-------------|
| [`ooxmlErrors`](./errors.md) | `src/errors.js` | Typed error hierarchy + stable code catalog. |
| [`ooxmlShared`](./_shared/README.md) | `src/_shared/index.js` | Namespaces, relationship types, EMU helpers, colour codecs. |

> The XML parser is consumed from [`@awacloud/fw/io/codec/xml.js`](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/api/io/codec/xml.md); the ZIP container from [`@awacloud/fw/io/compress/zip.js`](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/api/io/compress/zip.md).

## OPC — Open Packaging Conventions

The ZIP container shared by the three formats (ECMA-376 part 2).

| Module | Source | Description |
|--------|--------|-------------|
| [`opcPackage`](./opc/package.md) | `src/opc/package.js` | Read/write an OPC package (ZIP + parts + rels). |
| [`opcContentTypes`](./opc/content-types.md) | `src/opc/contentTypes.js` | `[Content_Types].xml` — MIME registry. |
| [`opcRelationships`](./opc/relationships.md) | `src/opc/relationships.js` | `.rels` files — typed link graph. |

## Markup Compatibility

| Module | Source | Description |
|--------|--------|-------------|
| [`markupCompatibility`](./mc.md) | `src/mc/markupCompatibility.js` | Resolves `mc:AlternateContent` / `mc:Ignorable` (ECMA-376 part 3). |

## Math (OMML)

| Module | Source | Description |
|--------|--------|-------------|
| [`ooxmlMath`](./math.md) | `src/math/math.js` | Office Math Markup Language — typed model + builders. |

## DrawingML

Shared graphics (ECMA-376 part 1 §20).

| Module | Source | Description |
|--------|--------|-------------|
| [`drawingml`](./drawingml/drawingml.md) | `src/drawingml/drawingml.js` | Typed text bodies + EMU helpers. |
| [`drawingmlChart`](./drawingml/chart.md) | `src/drawingml/chart.js` | `<c:chartSpace>` — read/write of a chart part. |
| [`drawingmlShape`](./drawingml/shape.md) | `src/drawingml/shape.js` | `<a:prstGeom>`, `<a:xfrm>`, fills, lines. |

## docx — WordprocessingML

| Module | Source | Description |
|--------|--------|-------------|
| [`docx`](./docx/docx.md) | `src/docx/docx.js` | **Top-level orchestrator**: read/write `.docx`. |
| [`docxProperties`](./docx/properties.md) | `src/docx/properties.js` | Typed run/paragraph properties. |
| [`docxStructure`](./docx/structure.md) | `src/docx/structure.js` | Runs, paragraphs, tables, sections, SDTs. |
| [`docxStyles`](./docx/styles.md) | `src/docx/styles.js` | `word/styles.xml` part. |
| [`docxNumbering`](./docx/numbering.md) | `src/docx/numbering.js` | Lists — abstract + concrete numberings. |
| [`docxSettings`](./docx/settings.md) | `src/docx/settings.js` | `word/settings.xml` part. |
| [`docxComments`](./docx/comments.md) | `src/docx/comments.js` | `word/comments.xml` part. |
| [`docxFootnotes`](./docx/footnotes.md) | `src/docx/footnotes.js` | Footnotes + endnotes (shared model). |
| [`docxHeaders`](./docx/headers.md) | `src/docx/headers.js` | Headers/footers (`header*.xml` / `footer*.xml` parts). |
| [`docxDrawing`](./docx/drawing.md) | `src/docx/drawing.js` | `<w:drawing>` — inline images, charts, shapes. |
| [`docxCustomXml`](./docx/customxml.md) | `src/docx/customXml.js` | Custom XML data parts + props. |
| [`docxWalker`](./docx/docx-walker.md) | `src/docx/docx-walker.js` | `.use(...)` registry and `hydrate*` / `dehydrate*` hook dispatch. |
| [`docxText`](./docx/docx-text.md) | `src/docx/docx-text.js` | Plain-text extraction (`toText`). |
| [templating](./docx/templating.md) | `src/docx/docx.js` | SDT / content-control templating helpers (cross-cutting). |

## xlsx — SpreadsheetML

| Module | Source | Description |
|--------|--------|-------------|
| [`xlsx`](./xlsx/xlsx.md) | `src/xlsx/xlsx.js` | **Top-level orchestrator**: read/write `.xlsx`. |
| [`xlsxStyles`](./xlsx/styles.md) | `src/xlsx/styles.js` | `xl/styles.xml` part — indexed registries. |
| [`xlsxTables`](./xlsx/tables.md) | `src/xlsx/tables.js` | Excel tables (header/totals/style). |
| [`xlsxConditionalFormatting`](./xlsx/conditional-formatting.md) | `src/xlsx/conditionalFormatting.js` | `<conditionalFormatting>` blocks. |
| [`xlsxComments`](./xlsx/comments.md) | `src/xlsx/comments.js` | Legacy comments + VML drawing. |
| [`xlsxThreadedComments`](./xlsx/threaded-comments.md) | `src/xlsx/threadedComments.js` | Threaded comments, Office 2018+. |
| [`xlsxDrawings`](./xlsx/drawings.md) | `src/xlsx/drawings.js` | Drawing parts — image/chart/shape anchors. |
| [`xlsxWalker`](./xlsx/xlsx-walker.md) | `src/xlsx/xlsx-walker.js` | `.use(...)` registry and `hydrate*` / `dehydrate*` hook dispatch. |

## pptx — PresentationML

| Module | Source | Description |
|--------|--------|-------------|
| [`pptx`](./pptx/pptx.md) | `src/pptx/pptx.js` | **Top-level orchestrator**: read/write `.pptx`. |
| [`pptxTheme`](./pptx/theme.md) | `src/pptx/theme.js` | Theme — clrScheme + fontScheme + fmtScheme. |
| [`pptxSlide`](./pptx/slide.md) | `src/pptx/slide.js` | Slide / layout / master shape model. |
| [`pptxPicture`](./pptx/picture.md) | `src/pptx/picture.js` | `<p:pic>` — slide-level pictures. |
| [`pptxTable`](./pptx/table.md) | `src/pptx/table.js` | Slide tables via `<p:graphicFrame>`. |
| [`pptxChart`](./pptx/chart.md) | `src/pptx/chart.js` | Slide-level chart wrapper. |
| [`pptxWalker`](./pptx/pptx-walker.md) | `src/pptx/pptx-walker.js` | `.use(...)` registry and `hydrate*` / `dehydrate*` hook dispatch. |

## Extras and bundles

- [`extra/`](./extra/README.md) — the opt-in modules (typed per-schema modules + `*-misc` sweepers), exported as `extras` from `@awacloud/ooxml`.
- [`bundles/`](./bundles/README.md) — pre-wired collections (`docxLargeBundle`, `docxFullBundle`, `xlsxLargeBundle`, `xlsxFullBundle`, `pptxLargeBundle`, `pptxFullBundle`), exported as `bundle`.

## Typical usage pattern

```js
const docx = runtime.resolve('docx');
const r = docx.read(bytes);
const out = docx.write(r.document, { styles: r.styles });
```

To plug in extra typing modules (advanced run formatting, pivot tables,
animations, …), use the `.use(...)` hook exposed by `docx` / `xlsx` /
`pptx`. See the [bundles guide](bundles/README.md) for the ergonomic
compositions.

## See also

- [OPC guide](../guide/opc-overview.md) — container overview.
- [Bundles guide](bundles/README.md) — ergonomic wiring with extras.
