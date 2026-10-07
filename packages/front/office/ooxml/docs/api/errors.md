---
module: ooxmlErrors
category: ooxml
dependencies: []
returns: object
worker-safe: true
status: stable
---

# `ooxmlErrors` — Typed error hierarchy + code catalog

**module factory**: `ooxmlErrors` (re-exported from `@awacloud/ooxml`) — **classes**: `OoxmlError`, `ParseError`, `RenderError`, `ContractError`

Every `throw` in `@awacloud/ooxml` raises one of three typed errors inheriting from `OoxmlError`. Each error carries a stable kebab-case `code`, an optional structured `context` payload, and an optional `cause` (the wrapped lower-level error when a re-throw occurs).

The classes are **declared inside the factory body** so the factory is a self-contained closure that can be serialised to a Worker via `factory.toString()`. Consumers obtain the classes by resolving the `ooxmlErrors` module — there are no top-level class exports.

## Catching strategy

### Via `ModuleRuntime` (recommended)

```js
const errors = runtime.resolve('ooxmlErrors');
const { OoxmlError, ParseError, ContractError } = errors;

try {
    docx.read(bytes);
} catch (e) {
    if (e instanceof ContractError) { /* caller bug */ }
    else if (e instanceof ParseError && e.code === 'opc/zip-bomb') {
        // Refuse oversized uploads
    } else if (e instanceof OoxmlError) {
        console.error(e.code, e.context, e.cause);
    } else throw e;
}
```

### Standalone (manual wiring)

```js
import { ooxmlErrors } from '@awacloud/ooxml';
const { OoxmlError, ParseError, ContractError, isOoxmlError } = ooxmlErrors.factory();
```

> **Breaking change.** The previous top-level imports `import { ParseError, ContractError, RenderError } from '@awacloud/ooxml'` (or `from '@awacloud/ooxml/errors'`) are no longer supported. Resolve the `ooxmlErrors` factory and destructure its return value instead.

## Code catalog

Codes are stable across patch / minor releases. Major releases may
add new codes; removals are documented in `CHANGELOG.md`.

### `opc/*` — Open Packaging Conventions

| Code | Class | Meaning |
|------|-------|---------|
| `opc/invalid-input` | ContractError | `bytes` is not a `Uint8Array`, or `pkg` is not an object |
| `opc/invalid-zip` | ParseError | `unzipSync` failed (`cause` preserved) |
| `opc/zip-bomb` | ParseError | `maxParts` / `maxUncompressed` / `maxRatio` exceeded — see `context.limit` |
| `opc/missing-content-types` | ParseError | archive has no `[Content_Types].xml` |
| `opc/invalid-content-types` | ParseError | `[Content_Types].xml` failed to parse |
| `opc/content-types-bad-root` | ParseError | root element of `[Content_Types].xml` is not `<Types>` |
| `opc/relationships-bad-root` | ParseError | a `.rels` part has a root other than `<Relationships>` |
| `opc/invalid-rels` | ParseError | a `.rels` part failed to parse (`context.partName`, `cause`) |
| `opc/render-content-types` | RenderError | serializing `[Content_Types].xml` failed |
| `opc/render-rels` | RenderError | serializing a `.rels` part failed |
| `opc/zip-failed` | RenderError | `zipSync` failed (`cause` preserved) |

### `docx/*` — WordprocessingML

| Code | Class | Meaning |
|------|-------|---------|
| `docx/invalid-document` | ContractError | `docx.write(doc)` received a non-object |
| `docx/invalid-body` | ContractError | `doc.body` is not an array |
| `docx/hyperlink-missing-rid` | ContractError | `docx.write`: a hyperlink with a non-empty `target`, in the body or any story part (header, footer, footnotes, endnotes, comments), has neither an `rId` nor an `anchor`, so its target would be lost (`context.target`) |
| `docx/hyperlink-unresolved-rid` | ContractError | `docx.write`: a hyperlink's `rId` has no relationship in the table written for its part (`context.rId`, `context.story`, `context.key?`) |
| `docx/numbering-missing` | ContractError | `docx.write`: a paragraph's `pPr.numPr` references a non-zero `numId` but `opts.numbering` is missing (`context.numId`) |
| `docx/no-random-source` | RenderError | `generateStoreItemID` (and `docx.write` for a `customXml` item without `storeItemID`): `crypto.getRandomValues` is unavailable; pass `storeItemID` explicitly |
| `docx/settings-unknown-prefix` | RenderError | `docxSettings.serialize` (and `docx.write` with `opts.settings`): the settings tree uses a prefix with no known namespace (`context.prefix`) |
| `docx/missing-officeDocument-rel` | ParseError | package has no officeDocument relationship |
| `docx/missing-document-part` | ParseError | declared `word/document.xml` not in archive |
| `docx/invalid-xml` | ParseError | `document.xml` failed to parse (`cause` preserved) |
| `docx/missing-body` | ParseError | `document.xml` has no `<w:body>` |
| `docx/comments-bad-root` | ParseError | `comments.xml` root is not `<w:comments>` |
| `docx/customxml-bad-root` | ParseError | customXml props root is not `<ds:datastoreItem>` |
| `docx/header-bad-root` | ParseError | header part root is not `<w:hdr>` |
| `docx/footer-bad-root` | ParseError | footer part root is not `<w:ftr>` |
| `docx/footnotes-bad-root` | ParseError | `footnotes.xml` root is unexpected |
| `docx/endnotes-bad-root` | ParseError | `endnotes.xml` root is unexpected |
| `docx/numbering-bad-root` | ParseError | `numbering.xml` root is not `<w:numbering>` |
| `docx/settings-bad-root` | ParseError | `settings.xml` root is not `<w:settings>` |
| `docx/styles-bad-root` | ParseError | `styles.xml` root is not `<w:styles>` |

### `xlsx/*` — SpreadsheetML

| Code | Class | Meaning |
|------|-------|---------|
| `xlsx/invalid-workbook` | ContractError | `xlsx.write(wb)` received a non-object |
| `xlsx/invalid-sheets` | ContractError | `workbook.sheets` is not an array |
| `xlsx/no-random-source` | RenderError | `generateId` (and `xlsx.write` for a threaded comment or person without an `id`): `crypto.getRandomValues` is unavailable; pass the comment / person id explicitly |
| `xlsx/missing-officeDocument-rel` | ParseError | package has no officeDocument relationship |
| `xlsx/missing-workbook-part` | ParseError | declared workbook XML missing from archive |
| `xlsx/invalid-workbook-xml` | ParseError | workbook XML failed to parse (`cause`) |
| `xlsx/limit-exceeded` | ParseError | one of `maxSheets`, `maxRowsPerSheet`, `maxCellsPerSheet` breached (`context.limit`) |
| `xlsx/comments-bad-root` | ParseError | comments root is not `<comments>` |
| `xlsx/threaded-comments-bad-root` | ParseError | threadedComments root unexpected |
| `xlsx/persons-bad-root` | ParseError | persons root is not `<personList>` |
| `xlsx/styles-bad-root` | ParseError | styles root is not `<styleSheet>` |
| `xlsx/tables-bad-root` | ParseError | table root is not `<table>` |
| `xlsx/drawings-bad-root` | ParseError | drawings root is not `<xdr:wsDr>` |
| `xlsx/oleObjects-bad-root` | ParseError | extra/sml-form-controls — `<oleObjects>` expected |
| `xlsx/controls-bad-root` | ParseError | extra/sml-form-controls — `<controls>` expected |
| `xlsx/pivotTable-bad-root` | ParseError | extra/sml-pivot-tables — `<pivotTableDefinition>` |
| `xlsx/pivotCacheDefinition-bad-root` | ParseError | extra/sml-pivot-tables — `<pivotCacheDefinition>` |
| `xlsx/pivotCacheRecords-bad-root` | ParseError | extra/sml-pivot-tables — `<pivotCacheRecords>` |

### `pptx/*` — PresentationML

| Code | Class | Meaning |
|------|-------|---------|
| `pptx/invalid-presentation` | ContractError | `pptx.write(pres)` received a non-object |
| `pptx/invalid-slides` | ContractError | `presentation.slides` is not an array |
| `pptx/missing-officeDocument-rel` | ParseError | package has no officeDocument relationship |
| `pptx/missing-presentation-part` | ParseError | declared presentation XML missing from archive |
| `pptx/invalid-presentation-xml` | ParseError | presentation XML failed to parse (`cause`) |
| `pptx/<tag>-bad-root` | ParseError | a slide / layout / master part has an unexpected root (`<tag>` matches the expected local name without `p:` prefix) |
| `pptx/theme-bad-root` | ParseError | theme root is not `<a:theme>` |

### `drawingml/*` — Shared graphics

| Code | Class | Meaning |
|------|-------|---------|
| `drawingml/chart-bad-root` | ParseError | chart XML root is not `<c:chartSpace>` |
| `drawingml/chart-missing` | ParseError | `<c:chartSpace>` has no `<c:chart>` child |

### `math/*` — OMML

| Code | Class | Meaning |
|------|-------|---------|
| `math/unknown-node-type` | ParseError | renderer encountered an unmapped OMML node type (`context.type`) |

## Conventions

- **Format** — `<namespace>/<kebab-case-detail>`. Namespace prefixes group codes by surface (`opc/`, `docx/`, `xlsx/`, `pptx/`, `drawingml/`, `math/`).
- **`context`** — structured payload, never interpolated into `message`. Typical keys: `partName`, `elementName`, `path`, `received`, `limit`, `max`, `actual`, `cause` (only via the constructor option).
- **`cause`** — preserved for re-throws of lower-level errors (XML parse, zip failures). Walk the chain via `e.cause`.

## See also

- [`errors.js`](../../src/errors.js) — class definitions
- [`README.md`](../../README.md#security) — security policy
- [`tests/fuzz.test.js`](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/office/ooxml/tests/fuzz.test.js) — regression fence
