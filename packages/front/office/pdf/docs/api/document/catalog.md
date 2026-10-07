---
module: pdfCatalog
category: pdf/document
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfCatalog

> Typing of the `/Type /Catalog` dictionary, ISO 32000-2 §7.7.2 — root of the document tree.

**Module** `pdfCatalog` | **Source** `packages/front/office/pdf/src/document/catalog.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Extracts the canonical entries of the root dictionary referenced by
`trailer.root`. Unrecognised entries are preserved in `_extras` — useful for
extensions and non-destructive round trips. `/Type` is validated strictly (when
present it must be `/Catalog`) so that a bad xref offset cannot silently type an
arbitrary dictionary as the catalog.

## Resolve

```js
const cat = runtime.resolve('pdfCatalog');
// Returns: { typeCatalog }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeCatalog` | `(dict: PdfDict) => TypedCatalog` | Typed record. |

### `TypedCatalog` shape

```js
{
    pages:    { num, gen },         // /Pages — required
    version?: string,               // /Version (overrides the header)
    pageLayout?: string,            // /PageLayout
    pageMode?:   string,            // /PageMode
    lang?:       string,            // /Lang
    outlines?:   PdfRef,            // /Outlines
    metadata?:   PdfRef,            // /Metadata (XMP stream)
    structTreeRoot?: PdfRef,        // /StructTreeRoot (tagged PDF)
    acroForm?:   PdfObject,         // /AcroForm
    names?:      PdfObject,         // /Names
    dests?:      PdfObject,         // /Dests
    viewerPrefs?: PdfObject,        // /ViewerPreferences
    pageLabels?:  PdfObject,        // /PageLabels
    markInfo?:    PdfObject,        // /MarkInfo
    ocProperties?: PdfObject,       // /OCProperties
    outputIntents?: PdfObject,      // /OutputIntents
    raw:      PdfDict,
    _extras:  Object<string, PdfObject>
}
```

## Examples

### Reaching the Catalog

```js
const doc = api.read(bytes);
doc.catalog.pages;          // { num, gen } — page-tree root
doc.catalog.metadata;       // reference to the XMP stream, when present
```

### Following the Outlines reference

```js
if (doc.catalog.outlines) {
    const root = doc._raw.resolve(doc.catalog.outlines);
    const items = runtime.resolve('pdfOutline').walkOutline(root, doc._raw.resolve);
}
```

### Inspecting `_extras`

```js
Object.keys(doc.catalog._extras);
// e.g. ['MyProprietaryKey'] when the PDF carries an entry outside §7.7.2
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/catalog/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/catalog/bad-type` | `ParseError` | `/Type` present but not `/Catalog`. |
| `pdf/catalog/missing-pages` | `ParseError` | `/Pages` missing or not a reference. |

## See also

- [`pdfPages`](./pages.md) — consumes `catalog.pages` as its root.
- [`pdfDocument`](./document.md)
- [`pdfErrors`](../errors.md)
