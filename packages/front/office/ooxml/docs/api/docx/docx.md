---
module: docx
category: ooxml/docx
dependencies: [ooxmlErrors, docxText, opcPackage, xml, opcRelationships, docxStructure, docxStyles, docxNumbering, docxSettings, docxComments, docxFootnotes, docxHeaders, docxDrawing, markupCompatibility, drawingmlChart, docxCustomXml, docxWalker, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docx

> `.docx` reader/writer (WordprocessingML, ECMA-376 part 1 §17) — top-level orchestrator.

**Module** `docx` | **Source** `packages/front/office/ooxml/src/docx/docx.js` | **Deps** `ooxmlErrors`, `docxText`, `opcPackage`, `xml`, `opcRelationships`, `docxStructure`, `docxStyles`, `docxNumbering`, `docxSettings`, `docxComments`, `docxFootnotes`, `docxHeaders`, `docxDrawing`, `markupCompatibility`, `drawingmlChart`, `docxCustomXml`, `docxWalker`, `ooxmlShared` | **Worker-safe** yes

Unzips the package, parses `word/document.xml`, follows the relationships to the linked parts (styles / numbering / settings / comments / footnotes / endnotes / headers / footers / hyperlinks / images / charts / customXml). On write, only the auxiliary parts you supply are emitted. Builder helpers are provided for paragraphs, runs, hyperlinks, tables, lists, bookmarks, drawings, fields and SDTs (templating).

## Resolve

```js
const d = runtime.resolve('docx');
// Returns: { read, write, use,
//            fromText, paragraph, run, hyperlink, tableFromRows,
//            bookmark, listParagraph, imageRun, chartRun, shapeRun,
//            fieldSimple, fieldComplex,
//            boundText, blockSdt, repeatingSection, repeatingSectionItem,
//            walkSdts, cloneNode, substituteByTag, expandRepeating,
//            toText,
//            W_NS, REL_TYPE_DOC, REL_TYPE_HYPERLINK, CT_DOCUMENT }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `read` | `(bytes: Uint8Array, opts?) => Result` | See [Result shape](#result-shape). |
| `write` | `(doc, opts?) => Uint8Array` | `.docx` bytes. |
| `use` | `(...exts) => api` | Plugs extras in (`hydrate*` / `dehydrate*` hooks). |
| `fromText` | `(strings: string[]) => doc` | Document from an array of paragraph strings. |
| `paragraph` | `(text: string, {pPr?, rPr?}?) => paragraph` | Single-run paragraph. |
| `run` | `(text: string, rPr?) => run` | Text run. |
| `hyperlink` | `(text, target, {rId, rPr?, external?}) => hyperlink` | Hyperlink. `rId` is REQUIRED when `target` is set, and must resolve on write — `write()` throws `docx/hyperlink-missing-rid` / `docx/hyperlink-unresolved-rid` otherwise (see [Notes](#notes)). |
| `tableFromRows` | `(rows: string[][]) => table` | 2D table. |
| `bookmark` | `(name, id, children) => [...]` | Wraps children between bookmark markers. |
| `listParagraph` | `(text, numId, ilvl=0, opts?) => paragraph` | Paragraph bound to a list. Requires `write(doc, { numbering })` — `write()` throws `docx/numbering-missing` without `opts.numbering` (see Notes). |
| `imageRun` | `(bytes, {cx, cy, contentType?, …}) => run` | Run carrying an inline drawing. |
| `chartRun` | `(spec, {cx, cy, …}) => run` | Run carrying an inline chart. |
| `shapeRun` | `(spec, {cx, cy, …}) => run` | Run carrying an inline shape. |
| `fieldSimple` / `fieldComplex` | `(instr, opts?) => run` | Fields (`PAGE`, `DATE`, …). |
| `boundText`, `blockSdt`, `repeatingSection`, `repeatingSectionItem` | SDT builders | Templating (see [templating](./templating.md)). The repeating-section builders produce the Word 2012 (`w15`) elements; `write()` then declares `w15` (ignorable) on the document root. |
| `walkSdts`, `cloneNode`, `substituteByTag`, `expandRepeating` | SDT helpers | Post-read template processing. |
| `toText` | `(doc) => string` | Flat text extraction (skips `<w:del>`). |
| `W_NS`, `REL_TYPE_DOC`, `REL_TYPE_HYPERLINK`, `CT_DOCUMENT` | constants | Namespaces / OPC types. |

## Result shape

```js
{
    document: { type: 'document', body, sectPr? },
    package, documentPart,
    hyperlinks: { [rId]: { target, external } },
    headers:    { [rId]: { type: 'header', body } },
    footers:    { [rId]: { type: 'footer', body } },
    images:     { [rId]: { partName, data, contentType } },
    charts?:    { [rId]: { partName, chart } },
    customXml?: [{ id, xml, partName, storeItemID?, schemaRefs?, propsPart? }],
    styles?, numbering?, settings?, comments?, footnotes?, endnotes?,
    unmodelledParts: [{ partName, contentType }]
}
```

`hyperlinks`, `headers`, `footers`, `images` and `unmodelledParts` are always
present (possibly empty); `charts`, `customXml` and the auxiliary parts appear
only when the package carries them. `package` is the plain OPC package
(`{ contentTypes, parts, rels }`).

`hyperlinks` holds the hyperlink relationships of `word/document.xml`. A
`hyperlink` node whose `rId` resolves to a hyperlink relationship of the part
that holds it also carries `target` and `external` (copied from that
relationship): a body node against the document's relationships, a header,
footer, footnotes, endnotes or comments node against that part's own
relationships. So `write(result.document, { headers, footers, footnotes,
endnotes, comments })` keeps every resolvable link without passing
`hyperlinks`.

`unmodelledParts` is the loss record of the read: every package part the read
did not consume, sorted by `partName`, with its content type from
`[Content_Types].xml` (`null` when none is declared). `[Content_Types].xml` and
the relationship parts are never listed. `write()` produces the parts its model
carries; a part `read()` did not model is not written back — `read()` lists it
in `unmodelledParts`. For example, a Word-written file typically lists its
theme, font table, web settings and document properties.

`write(doc, opts)` takes the model, not this envelope: `result.document` as
`doc`, and the part objects (`styles`, `numbering`, `settings`, `comments`,
`footnotes`, `endnotes`, `headers`, `footers`, `hyperlinks`, `customXml`) as
`opts`.

### `write` options

| Option | Type | Description |
|--------|------|-------------|
| `styles` | `docxStyles` object | `word/styles.xml` part |
| `numbering` | `docxNumbering` object | Lists — see Notes. |
| `settings` | `docxSettings` object | Toggles + zoom |
| `comments` | `docxComments` object | Comments |
| `footnotes`, `endnotes` | `docxFootnotes` objects | Notes |
| `headers`, `footers` | `{[rId]: {type, body}}` | Must match `sectPr.headerReferences` / `footerReferences`. |
| `hyperlinks` | `{[rId]: {target, external?}}` | Hyperlink relationships of the document body; REPLACES the map derived from the body's nodes — see Notes. |
| `images` | `{[rId]: {data, contentType?, fileName?}}` | Caller-supplied image parts, pre-registered so their rIds do not collide with the ones allocated for inline drawings. |
| `customXml` | `[{xml, storeItemID?, schemaRefs?}]` | Custom XML data parts (data-binding source for content controls); a missing `storeItemID` is generated and patched back onto the item. |

## Examples

### Minimal document

```js
const d = runtime.resolve('docx');
const doc = d.fromText(['First line.', 'Second line.']);
const bytes = d.write(doc);
```

### Numbered list + header

```js
const numbering = { abstractNums: [{ abstractNumId: 0,
    levels: [{ ilvl: 0, numFmt: 'decimal', lvlText: '%1.',
               pPr: { indent: { left: 720, hanging: 360 } } }] }],
    nums: [{ numId: 1, abstractNumId: 0 }] };
const doc = {
    type: 'document',
    body: [d.listParagraph('Item A', 1), d.listParagraph('Item B', 1)],
    sectPr: { pageSize: { w: 12240, h: 15840 },
              headerReferences: [{ type: 'default', rId: 'rIdH1' }] }
};
d.write(doc, { numbering,
    headers: { rIdH1: { type: 'header', body: [d.paragraph('Confidential')] } } });
```

### Plugging extras in (`.use(...)`)

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/ooxml';
import { wmlRunFormatting } from '@awacloud/ooxml/extra/wml-run-formatting';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);  // the @awacloud/fw modules the package consumes
runtime.registerAll(modules);
runtime.register(wmlRunFormatting);

const rich = runtime.resolve('wmlRunFormatting');
const d    = runtime.resolve('docx').use(rich);
const r    = d.read(bytes);
// → every run's `rPr` now carries the strikethrough / highlight fields
//   typed by `wmlRunFormatting.hydrateRunProperties`.
```

The extras are **not** re-exported by name from the `@awacloud/ooxml` root — use the
`@awacloud/ooxml/extra/<file>` sub-path, or register the whole `extras` array.

For a complete wiring, prefer the `docxLargeBundle` (an estimated ~95% of
real-world usage) or the `docxFullBundle` (every WordprocessingML schema element
typed or preserved) bundles (see the [bundles guide](../bundles/README.md)): they
declare every extra as a dependency and call `.use(...)` for you before
returning the enriched instance.

## Notes

- `opts.maxParts`, `opts.maxUncompressed` and `opts.maxRatio` override the archive limits of [`opc.read`](../opc/package.md) (defaults kept; `0` disables a check).
- Inside a modelled part, unknown elements at any level land in `_extras` and are re-emitted verbatim. A whole part outside the model is not written back; `read()` lists it in `unmodelledParts`.
- `headers`/`footers` are never auto-generated; pass them explicitly with an `rId` matching `sectPr`.
- `markupCompatibility.process` runs on read on `word/document.xml` and on every header, footer, footnotes, endnotes and comments part, with `keepElements` = the two repeating-section elements and no `supportedPrefixes`, so every `mc:Choice` falls through to its Fallback branch and other ignorable `w14` / `w15` content is dropped.
- Inline drawings materialise as `{type:'drawing'}` runs; the binary image is reachable through `embedRef` → `result.images[rId]` (or `pkg.parts`).
- Extension hooks recognised by [`docxWalker`](../../../src/docx/docx-walker.js): `hydrate*` / `dehydrate*` for `RunProperties`, `ParagraphProperties`, `Table`, `Row`, `TcPr` and `Settings`.
- Hyperlink relationships are written per part. The document part's table is the map derived from the body's `hyperlink` nodes (each node's `rId` + `target`; `TargetMode="External"` unless the node's `external` is `false`), or `opts.hyperlinks` when passed. `write()` also writes each header, footer, footnotes, endnotes and comments part's hyperlink relationships, derived the same way from that part's nodes, into the part's own relationship table (none is written for a part without a hyperlink). `opts.hyperlinks` only covers the document body.
- A hyperlink node with a non-empty `target`, no `rId` and no `anchor` makes `write()` throw `ContractError` `docx/hyperlink-missing-rid` (`context.target`) before any part is rendered, instead of writing a `<w:hyperlink>` whose target is lost; the check covers the body and every header, footer, footnotes, endnotes and comments body, whether or not `opts.hyperlinks` is passed. Pass an explicit `rId`, using a prefix distinct from the `rId1`, `rId2`… ids `write()` auto-allocates for the `styles`/`numbering`/`settings`/etc. parts (a collision duplicates the `Id` in the relationships part). An internal link (`anchor`, no `rId`) and a hyperlink with neither `target`, `rId` nor `anchor` are written as given.
- A hyperlink node whose non-empty `rId` is not a key of the table written for its part makes `write()` throw `ContractError` `docx/hyperlink-unresolved-rid` before any part is rendered, instead of writing an `r:id` that dangles. `context` is `{ rId, story }` — `story` is `'document'`, `'header'`, `'footer'`, `'footnotes'`, `'endnotes'` or `'comments'` — plus `key` (the `opts.headers` / `opts.footers` key) for a header or footer. In practice: a node with an `rId` but no `target` (a node `read()` could not resolve, or one built by hand), or a body node whose `rId` is not a key of a supplied `opts.hyperlinks` — `opts.hyperlinks`, when passed, REPLACES the whole derived map rather than merging into it, so a body node whose `rId` is a key of it is written with the map's target, not the node's.
- `write()` never derives `word/numbering.xml`: a paragraph whose `pPr.numPr` references a non-zero `numId` (body, header or footer), written without `opts.numbering`, makes `write()` throw `ContractError` `docx/numbering-missing` (`context.numId`) before any part is rendered. `numId` 0 removes numbering and is not a reference. Pass the `numbering` object `read()` returned, or build one as in the example above.
- All checks run in this order — every missing-rid check, then unresolved-rid, then numbering; the first offending node in document order wins — and before the extension dehydrate pass, so a throw leaves the caller's tree untouched.

## See also

- [docx-structure](./structure.md) — inline elements.
- [docx-styles](./styles.md), [docx-numbering](./numbering.md), [docx-settings](./settings.md) — auxiliary parts.
- [docx-comments](./comments.md), [docx-footnotes](./footnotes.md), [docx-headers](./headers.md), [docx-drawing](./drawing.md), [docx-customxml](./customxml.md) — other parts.
- [Bundles guide](../bundles/README.md) — ergonomic wiring with extras.
