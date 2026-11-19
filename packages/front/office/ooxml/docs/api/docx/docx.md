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
| `toText` | `(doc) => string` | Flat text extraction, the accepted view: the content of `<w:ins>` and `<w:moveTo>` is read (a hyperlink's included), `<w:del>` and `<w:moveFrom>` are skipped. |
| `W_NS`, `REL_TYPE_DOC`, `REL_TYPE_HYPERLINK`, `CT_DOCUMENT` | constants | Namespaces / OPC types. |

## Result shape

```js
{
    document: { type: 'document', body, sectPr?, _relationships? },
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

`document._relationships` is present when the body's XML names
relationships the model does not write itself — an OLE object, an
ActiveX control, a SmartArt diagram, an external picture link, a chart
the read did not parse … (the hyperlinks, headers, footers, pictures and
charts the read returns in its own maps are written from them and left
out: pass the pictures back as `images`). It is `{ part, package }`: `part` the source document part name,
`package` the slice of the source package those relationships reach,
shaped as `package` (`parts`: their internal targets and, recursively,
the targets' own — the bytes as read, shared, not copied; `rels`: the
part's kept relationships and those targets' own; `contentTypes`: the
source defaults and those targets' overrides). `write()` writes them back
(see the write without `carry` in Notes). It is built after the typed read,
so `unmodelledParts` lists those parts as before. `preserveInput` and
`cleanup` clone it with the document, bytes included. An internal
relationship whose target the package lacks (a truncated source) is not
kept.

Each header and footer model (`headers[rId]`, `footers[rId]`), the
`comments`, `footnotes` and `endnotes` objects and the `numbering` and
`settings` objects carry the same `_relationships` for their own part: the
ids that part names (the numbering's and the settings' as written — an
attached template, a mail-merge source; the others once markup
compatibility is processed), its hyperlinks and the pictures and charts of its typed
drawings left out — a VML picture, fill or stroke, an OLE object, a
picture bullet, a picture inside a group. Each chart model the read
returns (`charts[rId].chart`, a story part's, a kept read's) carries one
for its chart part: every id it names, its embedded workbook among them.

`hyperlinks` holds the hyperlink relationships of `word/document.xml`. A
`hyperlink` node whose `rId` resolves to a hyperlink relationship of the part
that holds it also carries `target` and `external` (copied from that
relationship): a body node against the document's relationships, a header,
footer, footnotes, endnotes or comments node against that part's own
relationships. So `write(result.document, { headers, footers, footnotes,
endnotes, comments })` keeps every resolvable link without passing
`hyperlinks`.

Pictures and charts follow the same rule. `images` and `charts` hold the
document part's relationships; a drawing in a header, footer, footnotes,
endnotes or comments part is resolved against that part's own
relationships, and its bytes (`drawing.image`) or chart spec
(`drawing.chart`) are copied onto the drawing. On write, each story part
gets its own image / chart relationships (rIds kept clear of its hyperlink
rIds) to media parts shared with the body — the same bytes (by identity)
are written once — and to its own chart parts, numbered after the body's.
So `write(result.document, { headers, footers, footnotes, endnotes,
comments, images })` writes every story picture back.

`unmodelledParts` is the loss record of the read: every package part the read
did not consume, sorted by `partName`, with its content type from
`[Content_Types].xml` (`null` when none is declared). `[Content_Types].xml` and
the relationship parts are never listed. `write()` produces the parts its model
carries; a part `read()` did not model is not written back — `read()` lists it
in `unmodelledParts` — unless the `carry` option is passed. For example, a
Word-written file typically lists its theme, font table, web settings and
document properties.

`write(doc, opts)` takes the model, not this envelope: `result.document` as
`doc`, and the part objects (`styles`, `numbering`, `settings`, `comments`,
`footnotes`, `endnotes`, `headers`, `footers`, `hyperlinks`, `customXml`) as
`opts`.

To save a document back with what the model does not read, pass the
envelope as `carry` (and the pictures the read returned as `images`, which
writes back a picture that no drawing places, such as one a VML shape
uses):

```js
const r = docx.read(bytes);
const out = docx.write(r.document, {
    styles: r.styles, settings: r.settings, numbering: r.numbering,
    headers: r.headers, footers: r.footers, hyperlinks: r.hyperlinks,
    comments: r.comments, footnotes: r.footnotes, endnotes: r.endnotes,
    customXml: r.customXml, images: r.images,
    danglingNumbering: 'keep',
    carry: r
});
```

With `carry`, every part `unmodelledParts` lists is written with its bytes
and its content type (its override, else the default of its extension — an
override when the written package's default for that extension differs);
the relationships to it from the package, the document, the headers and
footers (matched through the `opts.headers` / `opts.footers` keys, the
source relationship ids), the styles, numbering, settings, comments,
footnotes and endnotes parts are written from the parts the writer writes
for them, and each carried part's
own relationships as read. External relationships of those parts are
carried too, except hyperlinks, which the model writes. A carried
relationship keeps its source id — the writer allocates its own ids around
them, so an `r:id` kept in `_extras` still resolves; only an id the
caller's options already use (a header key, a hyperlink, an image) gives
the carried relationship a fresh one. A carried part whose name the writer
gives one of its own parts is written under a free name in the same folder
(`header1_1.xml`), its relationships re-targeted. A carried part is written
as read: replace its bytes in `carry.package.parts` when an edit should
change it (document properties, statistics); its own relationship to a
part the writer writes under another name is written as read. Then,
every relationship id a written part still references in its XML (an
`r:*` attribute, `o:relid`) that its written table lacks is written back
from the source part's table under that id — an external one as read, an
internal one with its target part as read (reused when the package already
holds the same bytes under that name) and that part's own relationships:
a VML picture of a header, a chart inside a text box, the embedded
workbook of a written chart part (each written chart part is matched with
its source part through the relationship id it kept). Without `carry`
the parts `unmodelledParts` lists are not written, but the writer
reserves the ids it keeps (the header and footer keys, the hyperlinks',
pictures', charts' and custom XML items' ids) before it allocates its
own, so no part holds two relationships with one id, and it writes the
relationships the models' `_relationships` keep (see the write without
`carry` in Notes). With `carry`, a chart part a drawing
references is written as read when its chart model is unedited (equal,
field for field, to what its source part parses to), so what the chart
model does not type — styles, colours, text properties, its alternate
content — is kept; an edited chart is written from the model.

### `read` options

| Option | Type | Description |
|--------|------|-------------|
| `maxParts`, `maxUncompressed`, `maxRatio`, `maxDepth` | numbers (defaults `8192`, 256 MiB, `200`, `1000`) | The archive limits of [`opc.read`](../opc/package.md); `0` disables a check; exceeding one throws `opc/zip-bomb` or `opc/xml-too-deep`. |
| `alternateContent` | `'fallback'` (default), `'keep'` or `'choice'` | `'keep'` leaves each `mc:AlternateContent` in place, verbatim; `'choice'` reads a run's Word 2010 shape, group or canvas construct as its typed drawing — see Notes. Another value throws `docx/invalid-alternate-content`. |
| `extensions` | `'drop'` (default) or `'keep'` | `'keep'` keeps the Office extension namespaces (`w14`, `w15`, `w16*`, `wp14`), among them Word's `paraId` / `textId` — see Notes. Another value throws `docx/invalid-extensions`. |

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
| `images` | `{[rId]: {data, contentType?, fileName?}}` | Caller-supplied image parts, pre-registered so their rIds do not collide with the ones allocated for inline drawings. An entry without `data` bytes (an external picture `read()` returned) is skipped. |
| `customXml` | `[{xml, storeItemID?, schemaRefs?}]` | Custom XML data parts (data-binding source for content controls); a missing `storeItemID` is generated and patched back onto the item. |
| `preserveInput` | `true` or `false` (default) | `true` writes from a structured clone of the document and of these options (`carry`, only read, excepted), so the given model is left exactly as it was: the dehydrate pass of a bundle no longer demotes typed fields back into `_extras` in it, and the ids the writer assigns (`embedRef`, `chartRef`, `docId`, a custom XML item's `storeItemID`) land on the clone — write without it to get them back. The bytes are the same. Another value throws `docx/invalid-preserve-input`. |
| `cleanup` | an array of cleanup names (default: none) | Opt-in cleanups, applied to a structured clone so the given model is left as it was. `'emptyProperties'` drops every `rPr` / `pPr` that is an empty object (once its own nested `rPr` is cleaned) from the body and the headers, footers, footnotes, endnotes and comments, so no empty `<w:rPr/>` / `<w:pPr/>` is written; without it an empty one read from a source is written back. A non-empty one is untouched. `[]` writes as without it; another value (not an array, an unknown or repeated name) throws `docx/invalid-cleanup`. |
| `danglingNumbering` | `'throw'` (default) or `'keep'` | `'keep'` writes a list reference to an undeclared num (or without `numbering`) as given instead of throwing — see Notes. |
| `carry` | `{package, unmodelledParts}` (the `read()` result) | Writes back the parts `read()` listed in `unmodelledParts`, with their relationships and content types — see above. Anything else throws `docx/invalid-carry`. |

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

For a complete wiring, prefer the `docxLargeBundle` (the extras that type a
read — `wmlRunFormatting`, `wmlParagraphFormatting`, `wmlTableProperties`,
`wmlSettings` and `dmlWpDrawing` — plus parse / render toolkits) or the
`docxFullBundle` (`docxLargeBundle` plus further toolkits, none of which types
a read) bundles (see the [bundles guide](../bundles/README.md)): they declare
every extra as a dependency and call `.use(...)` for you before returning the
enriched instance.

## Notes

- `opts.maxParts`, `opts.maxUncompressed`, `opts.maxRatio` and `opts.maxDepth` override the archive limits of [`opc.read`](../opc/package.md) (defaults: `maxParts` 8,192, `maxUncompressed` 256 MiB, `maxRatio` 200, `maxDepth` 1,000; an absent key keeps its default, `0` disables a check).
- Inside a modelled part, unknown elements at any level land in `_extras` and are re-emitted verbatim. A whole part outside the model is not written back; `read()` lists it in `unmodelledParts`, and the `carry` write option writes it back.
- Without `carry`, `write()` gives each part the relationships its model yields — typed pictures and charts, hyperlinks, the document's `opts.images` — and, for the document part, those of `document._relationships` its written XML still names: each is written under its source id (the ids the writer allocates avoid them), an internal target with its bytes (under its source name when free or holding the same bytes, else a free name), its content type and its own relationships, as `carry` repairs them; one the written XML no longer names is not written. So an OLE object, an ActiveX control or a SmartArt diagram of the body keeps its relationships (its pictures, a VML one included, through `images: r.images`). Each header, footer, comments, footnotes, endnotes, numbering and settings part does the same with its own `_relationships`, its kept ids reserved by its own allocator, and each chart part written from a read chart model with that model's (its embedded workbook). A write without `carry` then leaves no dangling relationship id except where the source itself is truncated (a relationship whose target part the package lacks): of the 1,469 real-world docx files of the test corpus, two do. The save path above (`{ alternateContent: 'keep' }` and `carry`) still writes back what no model holds: the parts `unmodelledParts` lists, and an unedited chart part as read.
- `headers`/`footers` are never auto-generated; pass them explicitly with an `rId` matching `sectPr`.
- `markupCompatibility.process` runs on read on `word/document.xml` and on every header, footer, footnotes, endnotes and comments part, with `keepElements` = the two repeating-section elements, no `supportedPrefixes` and `ignorablePrefixes` = `ooxmlShared.WORD_EXTENSION_PREFIXES`, so every `mc:Choice` falls through to its Fallback branch and other `w14` / `w15` (and `wp14`, `w16*`) content is dropped — whether or not the part lists those prefixes in `mc:Ignorable`, as the writer always does, so a read of a written part reads as its source.
- `opts.alternateContent` (`'fallback'`, the default, or `'keep'`; another value throws `docx/invalid-alternate-content`, a `ContractError`): with `'keep'` each `mc:AlternateContent` of those parts stays in place, verbatim, in the `_extras` of the element that holds it, and `write()` writes it back — a DrawingML shape, text box or chart with its VML fallback, as the source had them, instead of the fallback alone. The model then sees neither branch (the kept element is opaque: text in a kept text box is not in the runs). A chart part only a kept Choice references is not parsed: it stays out of `charts` and is listed in `unmodelledParts`, so the `carry` write option writes it back with its relationship id; pictures keep theirs through `images: r.images`. For a save-back, read with `{ alternateContent: 'keep' }` and write with the save path above.
- `opts.alternateContent: 'choice'` reads as `'keep'` does, but for one kind of construct: an `mc:AlternateContent` child of a run whose one `mc:Choice` (no attribute but `Requires`) requires only `wps`, `wpg` or `wpc` and holds one `w:drawing`, followed by at most one `mc:Fallback` — the way Word writes a shape, a text box, a group or a drawing canvas with its VML fallback. Such a construct reads as that drawing, a run child typed as any other ([drawing](./drawing.md), and the opt-in [dmlWpDrawing](../extra/dml-wp-drawing.md) types its shape, group or canvas), with `alternate: { requires, fallback }`: the Choice's `Requires` and the `mc:Fallback` element as read (`null` when there is none). `write()` writes it back as the construct it was read from — one `mc:Choice` requiring `alternate.requires` around the drawing, then the Fallback — while its typed fields are as read (or when it has no `_read`, built by the caller); an edited one is written alone, without the Fallback, which would still show it as it was (Word 2010 and later and LibreOffice read the Choice). The relationships the Fallback names (a VML picture) are kept as `'keep'` keeps them. Of the 1,469 real-world docx files of the test corpus, 220 hold 464 such constructs; `'choice'` reads each as a drawing, and the untouched save-back writes the same constructs as `'keep'`'s.
- `opts.extensions` (`'drop'`, the default, or `'keep'`; another value throws `docx/invalid-extensions`, a `ContractError`): by default the elements and attributes of the Office extension namespaces the writer declares ignorable (`w14`, `w15`, `w16*`, `wp14`) are removed as markup compatibility allows, so a read of the written document reads as this one. With `'keep'` they are understood, in the main part and every story part: they stay in the model where any element the model does not type goes (the `_extras` of the property bag or node that holds them — a `w14:textOutline` in a run's properties, a `w14:checkbox` in a control's), and `write()` writes them back, declaring each prefix and listing it in `mc:Ignorable`. For a save-back, read with `{ alternateContent: 'keep', extensions: 'keep' }`.
- Inline drawings materialise as `{type:'drawing'}` runs carrying the image bytes on `drawing.image` (the body's `embedRef` is also a key of `result.images`; a story part's `embedRef` belongs to that part's own relationships). A picture with an SVG (the Office 2016 `asvg:svgBlip` extension) also carries `svgRef` and the SVG's bytes on `drawing.image.svg` — see [docxDrawing](./drawing.md).
- Extension hooks recognised by [`docxWalker`](../../../src/docx/docx-walker.js): `hydrate*` / `dehydrate*` for `RunProperties`, `ParagraphProperties`, `Table`, `Row`, `TcPr`, `Drawing` and `Settings`; the node hooks run over the body, the headers, the footers, the footnotes, the endnotes and the comments. `word/settings.xml` is written from the object `dehydrateSettings` returns (`wmlSettings` returns a new one and leaves `opts.settings` as given).
- Hyperlink relationships are written per part. The document part's table is the map derived from the body's `hyperlink` nodes (each node's `rId` + `target`; `TargetMode="External"` unless the node's `external` is `false`), or `opts.hyperlinks` when passed. `write()` also writes each header, footer, footnotes, endnotes and comments part's hyperlink relationships, derived the same way from that part's nodes, into the part's own relationship table (none is written for a part without a hyperlink). `opts.hyperlinks` only covers the document body.
- A hyperlink node with a non-empty `target`, no `rId` and no `anchor` makes `write()` throw `ContractError` `docx/hyperlink-missing-rid` (`context.target`) before any part is rendered, instead of writing a `<w:hyperlink>` whose target is lost; the check covers the body and every header, footer, footnotes, endnotes and comments body, whether or not `opts.hyperlinks` is passed. Pass an explicit `rId`, using a prefix distinct from the `rId1`, `rId2`… ids `write()` auto-allocates for the `styles`/`numbering`/`settings`/etc. parts (a collision duplicates the `Id` in the relationships part). An internal link (`anchor`, no `rId`) and a hyperlink with neither `target`, `rId` nor `anchor` are written as given.
- A hyperlink node whose non-empty `rId` is not a key of the table written for its part makes `write()` throw `ContractError` `docx/hyperlink-unresolved-rid` before any part is rendered, instead of writing an `r:id` that dangles. `context` is `{ rId, story }` — `story` is `'document'`, `'header'`, `'footer'`, `'footnotes'`, `'endnotes'` or `'comments'` — plus `key` (the `opts.headers` / `opts.footers` key) for a header or footer. In practice: a node with an `rId` but no `target` (a node `read()` could not resolve, or one built by hand), or a body node whose `rId` is not a key of a supplied `opts.hyperlinks` — `opts.hyperlinks`, when passed, REPLACES the whole derived map rather than merging into it, so a body node whose `rId` is a key of it is written with the map's target, not the node's.
- `write()` never derives `word/numbering.xml`: a `pPr.numPr` that references a non-zero `numId` — in the body, a header, footer, footnotes, endnotes or comments part, or `opts.styles` (a style or the docDefaults) — written without `opts.numbering`, makes `write()` throw `ContractError` `docx/numbering-missing` before any part is rendered; with `opts.numbering`, a `numId` its `nums` do not declare throws `docx/numbering-unknown-num`. Both carry `context.numId` and `context.story` (`'document'`, `'header'`, `'footer'`, `'footnotes'`, `'endnotes'`, `'comments'`, `'styles'`), plus `context.key` for a header or footer and `context.styleId` for a style. `numId` 0 removes numbering and is not a reference; `numId` is compared as a number (`'1'` matches `1`). Pass the `numbering` object `read()` returned, or build one as in the example above. With `danglingNumbering: 'keep'` neither check runs and every `numPr` is written as given — what `read()` reads in a file whose list reference points at a num it does not hold (Word ignores such a reference); any value other than `'throw'` (the default) or `'keep'` throws `docx/invalid-dangling-numbering`.
- All checks run in this order — every missing-rid check, then unresolved-rid, then numbering; the first offending node in document order wins — and before the extension dehydrate pass, so a throw leaves the caller's tree untouched.

## See also

- [docx-structure](./structure.md) — inline elements.
- [docx-styles](./styles.md), [docx-numbering](./numbering.md), [docx-settings](./settings.md) — auxiliary parts.
- [docx-comments](./comments.md), [docx-footnotes](./footnotes.md), [docx-headers](./headers.md), [docx-drawing](./drawing.md), [docx-customxml](./customxml.md) — other parts.
- [Bundles guide](../bundles/README.md) — ergonomic wiring with extras.
