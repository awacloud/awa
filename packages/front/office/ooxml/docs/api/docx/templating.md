---
module: docx
category: ooxml/docx
dependencies: [ooxmlErrors, docxText, opcPackage, xml, opcRelationships, docxStructure, docxStyles, docxNumbering, docxSettings, docxComments, docxFootnotes, docxHeaders, docxDrawing, markupCompatibility, drawingmlChart, docxCustomXml, docxWalker, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# Templating helpers (docx)

> Cross-cutting SDT / content-control helpers exposed on the `docx` instance.

**Module** `docx` | **Source** `packages/front/office/ooxml/src/docx/docx.js` | **Worker-safe** yes

Cross-cutting helpers for producing Word documents from templates with
content controls. They build on SDTs (see [`docxStructure`](./structure.md))
and on data binding through custom XML (see
[`docxCustomXml`](./customxml.md)).

This page documents a subset of the [`docx`](./docx.md) module's surface —
there is no separate `docxTemplating` descriptor. Every function below lives
on the `docx` instance:

```js
const d = runtime.resolve('docx');
```

## Builders

### `d.boundText(props, defaultText, rPr?)`

Builds an inline SDT of kind **text** wrapping a single run.

```js
d.boundText(
    { tag: 'customer',
      alias: 'Customer name',
      dataBinding: { xpath: '/order/customer',
                     storeItemID: '{…GUID…}' } },
    '(default value)',
    { bold: true }
)
```

### `d.blockSdt(props, children)`

A block-level content control wrapping paragraphs / tables / nested SDTs.
For an inline SDT, type the node directly as
`{ type: 'sdt', properties, children }`.

### `d.repeatingSection(props, items)`

Builds a `<w:sdt>` carrying `<w15:repeatingSection>` — a Word 2012
extension in the `http://schemas.microsoft.com/office/word/2012/wordml`
namespace ([MS-DOCX] §2.5.1.10, type `CT_SdtRepeatedSection` §2.5.3.8), not
an ECMA-376 element. Word renders it as a list of rows the user can add to
or remove from.

Two optional `props` become child elements, in schema order:

| `props` field | Written as |
|---|---|
| `sectionTitle: string` | `<w15:sectionTitle w:val="…"/>` — the display name of the section |
| `doNotAllowInsertDeleteSection: true` | `<w15:doNotAllowInsertDeleteSection/>` — the user cannot insert or delete items |

```js
d.repeatingSection(
    { tag: 'rows',
      sectionTitle: 'Rows',
      dataBinding: { xpath: '/orders/order',
                     storeItemID: '{…GUID…}' } },
    [d.repeatingSectionItem([/* template content */])]
)
```

`items` is typically a single `repeatingSectionItem` (the template). Word
duplicates that template when the user adds a row.

When a written part contains a `w15` element, `write()` declares
`xmlns:mc`, `xmlns:w15` and `mc:Ignorable="w15"` on the root of the part
that holds it (`w:document`, `w:hdr`, `w:ftr`, `w:footnotes`, `w:endnotes`,
`w:comments`), so consumers that do not know the extension skip it. A part
without one keeps the `w` and `r` declarations only.

On read, `<w15:repeatingSection>` and `<w15:repeatingSectionItem/>` are
kept through markup-compatibility processing and typed as
`properties.kind` (plus `sectionTitle` and `doNotAllowInsertDeleteSection`);
every other `w15` element is still dropped. The main-namespace form
`<w:repeatingSection w:sectionTitle="…"/>` / `<w:repeatingSectionItem/>`
that earlier versions of this module wrote is still read, and written back
in the `w15` form.

### `d.repeatingSectionItem(children, props?)`

Builds a `<w:sdt>` carrying `<w15:repeatingSectionItem/>` ([MS-DOCX]
§2.5.1.11). Wraps the paragraphs / tables that make up one row.

## Templating helpers

### `d.walkSdts(node, cb)`

Walks the tree from `node` and calls `cb(sdt)` on every SDT (inline or
block-level), recursing through `body` / `children` / `rows` / `cells`.

### `d.cloneNode(node)`

Deep-clones a node of the docx model. Raw XML nodes (`type: 'element'` /
`type: 'text'`) are preserved by reference; typed structures are cloned.
Used internally by `expandRepeating`, exposed for advanced use.

### `d.substituteByTag(node, data)`

For every SDT (inline or block) in the subtree whose `properties.tag`
matches a key of `data`:

- **Inline SDT** → children replaced by a single run carrying the value as text
- **Block SDT** → children replaced by a single paragraph carrying the value as text

`repeatingSection` / `repeatingSectionItem` SDTs are **skipped** (they are
handled by `expandRepeating`). Mutates `node` in place.

### `d.expandRepeating(section, data)`

The **main templating helper**. The first child of `section` is the **item
template**; for every record in `data` the template is cloned with
`cloneNode` and `substituteByTag` is applied with that record. The clones
become the new `section.children`.

Mutates `section` in place.

## Full example — an invoice with line rows

```js
const d = runtime.resolve('docx');

// Template with a single "row template"
const orderList = d.repeatingSection(
    { tag: 'orders',
      alias: 'Order rows',
      dataBinding: {
          xpath: '/invoice/orders/order',
          prefixMappings: "xmlns:ns0='http://example.com'",
          storeItemID: '{…GUID…}'
      } },
    [d.repeatingSectionItem([
        {
            type: 'paragraph',
            pPr: { indent: { left: 360 } },
            children: [
                d.run('• '),
                d.boundText({ tag: 'customer',
                              dataBinding: { xpath: 'customer' } },
                            '(customer)', { bold: true }),
                d.run(' — $'),
                d.boundText({ tag: 'amount',
                              dataBinding: { xpath: 'amount' } },
                            '0.00')
            ]
        }
    ])]
);

// Client-side expansion (not through Word — straight from our own data)
d.expandRepeating(orderList, [
    { customer: 'Acme Corp', amount: '1200.50' },
    { customer: 'Globex',    amount: '850.00' },
    { customer: 'Initech',   amount: '2000.00' }
]);

const doc = {
    type: 'document',
    body: [
        d.paragraph('Q4 Invoice', { rPr: { bold: true, size: 32 } }),
        d.paragraph('Outstanding orders:'),
        orderList
    ]
};

const bytes = d.write(doc);
// Word opens this document with the 3 rows materialised and the content
// controls functional. The user can add or remove rows from the Word UI.
```

## Client-side vs Word-side templating

Two complementary ways to use repeating sections:

1. **Client-side templating** (the typical case here) — the data is
   available in the consuming code and materialised into the document
   before export. `expandRepeating` does that work. The final document
   contains concrete rows; the XPath data binding is not required (but the
   SDT properties are kept so Word can still bind them to a customXml part).

2. **Word-side templating** — the author prepares a template with a single
   row template plus a customXml part holding the data. Word materialises
   the rows on open. See [`docxCustomXml`](./customxml.md) for the
   `storeItemID` / part-wiring side of that setup.

Both modes compose — a document can be pre-expanded on the client AND carry
a `dataBinding` so Word re-syncs when the user edits the customXml.

## Coverage

**Implemented**:
- `<w15:repeatingSection>` + `<w15:repeatingSectionItem>` parse / render
  (including the `<w15:sectionTitle>` and
  `<w15:doNotAllowInsertDeleteSection>` children); the legacy
  `<w:repeatingSection w:sectionTitle>` form is read
- The `boundText`, `blockSdt`, `repeatingSection`, `repeatingSectionItem`
  builders
- The `walkSdts`, `cloneNode`, `substituteByTag`, `expandRepeating` helpers

**Not implemented**:
- Library-side XPath resolution (Word performs that binding at runtime)
- Nested dropdown / date / picture content controls inside a row template —
  the kind is modelled through `properties.kind`, but the type-specific
  element is preserved verbatim in `properties._kindNode`
- `<w15:repeatingSectionItem>` around table rows (a `<w:sdt>` directly
  inside `<w:tr>` or `<w:tc>`) — structurally supported but not deeply
  tested
- Read/write is verified against markup reconstructed from the [MS-DOCX]
  specification and by a read / write / re-read round trip of one document
  saved by Microsoft Word 16.0 (one repeating section with one item). Opening
  the written document back in Word is not part of the automated tests.
- Other `w15` content-control properties (`w15:appearance`, `w15:color`)
  are dropped on read when the document lists `w15` in `mc:Ignorable`, as
  Word does.

## Notes

- The helpers mutate their argument in place and return nothing useful — clone first with `d.cloneNode(node)` when the original must survive.
- `substituteByTag` only replaces content for SDTs whose `properties.tag` is a key of `data`; unmatched SDTs keep their default content.

## See also

- [docx](./docx.md) — the full orchestrator surface.
- [docx-structure](./structure.md) — `parseSdt` / `renderSdt` and the SDT model.
- [docx-customxml](./customxml.md) — data stores and `storeItemID`.
