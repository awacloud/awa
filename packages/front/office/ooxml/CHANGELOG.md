# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-10-21

### Added

- **docx run fonts keep every `w:rFonts` attribute.** The run properties
  of runs, paragraph marks, styles, docDefaults and numbering levels gain
  an optional `fonts` field: every attribute of `<w:rFonts>` by its local
  name (`ascii`, `hAnsi`, `eastAsia`, `cs`, `hint` and the four theme
  attributes), written back as read. `font` keeps its meaning: a changed
  `font` is written to `ascii`, `hAnsi` and `cs` (their theme attributes
  dropped so the edit applies), a removed one removes them; `eastAsia`
  and `hint` always stay. A `<w:rFonts>` holding only `w:hint` — with its
  `<w:rPr>` — now survives a read and a write. Models without `fonts` are
  written as before; a read model compared field by field now shows
  `fonts` beside `font`.

- **`slideExtrasByPart` read option** (`pptx.read`, and the second
  argument of `parseSlide` / `parseSlideLayout` / `parseSlideMaster`).
  With `true`, the leftovers of each slide, layout and master's `<p:cSld>`
  are kept in a new `cSldExtras` array and `_extras` holds the root's only;
  by default both go to `_extras` and the root's replace those of
  `<p:cSld>` (a `<p:cSld>` `<p:extLst>` beside a `<p:timing>` was lost).
  The writers put a split model's elements back at the level each came
  from, each written once. The default model is unchanged.

- **DrawingML colours keep their transforms.** Shape fills (`{ rgb }` /
  `{ schemeColor }`) carry `mods: [{ name, val? }]` (`lumMod`, `lumOff`,
  `tint`, `shade`, `alpha`, …) and write them back, `shapeProps` included.
  `ooxmlShared` gains `createTypedColorCodec`, the codec behind the typed
  colour.
- **`typedRunColors` read option** (`pptx.read`, `xlsx.read`, and the
  `drawingml` / `pptxSlide` / `pptxTable` / `xlsxDrawings` parse functions).
  With `true`, a text-run fill that a bare `'RRGGBB'` cannot express — a
  theme colour, or any colour with transforms — is typed as `rPr.color = {
  rgb | schemeColor, mods? }` instead of staying verbatim in `rPr._extras`.
  The default keeps the 1.0.0 model; `renderRunProperties` writes both
  forms.
- **Picture crop.** `a:blipFill/a:srcRect` reaches the docx drawing node
  and the pptx picture as `srcRect: { l?, t?, r?, b? }` (sides in 1/1000 of
  a percent) and is written back. `ooxmlShared` gains `parseSrcRect` and
  `srcRectAttrs`.
- **`xlsx` row heights and hidden rows.** The `<row>` attributes `ht`,
  `customHeight` and `hidden` reach the model as `sheet.rowProps` (keyed by
  row index, with the row number `r`) and are written back; a sheet with
  none of them has no `rowProps`.

### Changed

- **A new archive limit, `maxDepth`, refuses an XML part nested deeper
  than 1,000 elements.** `opc.read` scans every `.xml`, `.rels` and
  `.vml` part before any is parsed and throws `ParseError`
  `opc/xml-too-deep` (`context.limit`, `context.max`, `context.partName`) for a part
  whose elements nest past the limit; `docx.read`, `xlsx.read` and
  `pptx.read` forward `maxDepth` from their options, and `0` disables
  it. The readers and every consumer of the model walk the trees
  recursively: a document of 5,000 nested tables overflowed the call
  stack with an untyped `RangeError`. **Release note**: a document whose
  XML nests deeper than 1,000 elements, which used to read up to the
  stack limit, is now refused by default — no real file of the 2,938
  measured (Apache POI and LibreOffice test documents) nests past 52;
  pass `maxDepth` to read deeper ones. `defaultLimits` gains
  `maxDepth: 1000`.

- **`xlsx` reads `true` as well as `1` for boolean attributes.** A `<col>`
  with `hidden="true"` or `bestFit="true"` was read as neither hidden nor
  best-fit; it now reads `hidden: true` / `bestFit: true`, as the `<row>`
  attributes of `sheet.rowProps` do.
- **`docx.write` checks every list reference.** `docx/numbering-missing`
  now also covers footnotes, endnotes, comments and `opts.styles` (each
  style and the docDefaults), and a `numId` that `opts.numbering.nums` does
  not declare throws the new `ContractError` `docx/numbering-unknown-num`;
  both carry `context.story` (plus `key` / `styleId`). A write that used to
  emit a dangling `w:numId` now throws instead.
- **docx block math sits inside a paragraph.** The schema allows
  `m:oMathPara` only inside a `w:p`, so `docx.write` now writes a
  body-level `oMathPara` node (document body and story parts) as a `w:p`
  with no `w:pPr` holding only that `m:oMathPara`, as Word does; it used to
  write it straight under `w:body`, which validators reject. Release note
  for readers: `docx.read` now turns such a paragraph — no `w:pPr`, one
  `m:oMathPara` as its only element child, the usual shape of a display
  equation in a Word file — into the body-level `{ type: 'oMathPara' }`
  node, where 1.0.0 read it as a `paragraph` with the `m:oMathPara` in its
  `_extras`. A paragraph with a `w:pPr` or any other child keeps the 1.0.0
  shape, and a bare body-level `m:oMathPara` still reads as before.

### Fixed

- **Pictures on slide layouts and slide masters carry their image.**
  `pptx.read` resolved the `image` (`data`, `contentType`, `rId`) of the
  pictures of slides only; a picture of a layout or a master, such as a
  template logo, kept its `embedRef` with no bytes. It is now resolved
  through the layout's or the master's own relationships. `write()` is
  unchanged: it does not read `image` on layout or master shapes.

- **A malformed XML part is a typed refusal in every reader.** A part
  `docx.read`, `xlsx.read` or `pptx.read` parses without a typed wrapper
  of its own (docx styles, numbering, settings, notes, comments,
  headers, footers, charts; xlsx shared strings, styles, tables,
  comments, drawings, charts; pptx slides, layouts, masters, theme,
  charts) let the fw `XmlParseError` (`xml/parse-error`) through,
  against the documented rule that every throw of the package is an
  `OoxmlError`. It now throws `ParseError` `docx/invalid-part-xml`,
  `xlsx/invalid-part-xml` or `pptx/invalid-part-xml`, the parser's
  error kept as `cause`; a malformed worksheet part of `xlsx.read` throws
  `xlsx/invalid-sheet-xml` (with `context.partName`), like
  `xlsx/invalid-workbook-xml`. **Release note**: code that caught these
  reads by the fw `xml/parse-error` code must now test for the
  `ParseError` class or the new codes. Any other error is unchanged.

- **docx revision tracking is `w:trackRevisions`.** `trackChanges: true`
  in the settings was written as `<w:trackChanges/>`, an element the
  settings schema does not have, and a real file's `<w:trackRevisions>`
  stayed untyped in `_extras`. The writer now writes `<w:trackRevisions/>`
  and the reader types `<w:trackRevisions>` — and the `<w:trackChanges>`
  1.0.0 wrote — as `trackChanges`; an `_extras` copy is not written twice.
  With `wmlSettings`, a real file still reads as the `trackRevisions`
  toggle, and the core boolean is no longer written as
  `<w:trackChanges/>`.
- **docx settings demoted by an extension are written.** `docx.write`
  ran the `dehydrateSettings` hooks but wrote `opts.settings` as given,
  while `wmlSettings` returns the demoted settings as a new object: every
  typed flag of that extension (`autoHyphenation`, `trackRevisions`,
  `decimalSymbol` …) was left out of `word/settings.xml`. The part is now
  written from what the hook returns; `opts.settings` is still left as
  given.
- **pptx masters list only the layouts written.** `pptx.read` keeps the
  layouts the slides use but the master's whole `layoutIds` list, and
  `pptx.write` numbers the written layouts' relationships `rId1`…`rIdK`
  and wrote that list unchanged, so a deck with unused layouts was
  written with `p:sldLayoutId` entries naming missing (or wrong)
  relationships. Each master's `p:sldLayoutIdLst` now names exactly the
  written layouts: other entries are left out, a missing one gets a fresh
  id. The model is not modified.
- **pptx slide-level elements written once, at the slide level.** A
  slide, layout or master's `_extras` holds the leftovers of the root, or
  those of `<p:cSld>` when the root has none; the writers put every one of
  them inside `<p:cSld>` AND at the root, so a slide's `<p:transition>` or
  `<p:timing>` was written twice, once where validators reject it. Each
  element is now written where the schema places it — `<p:transition>`,
  `<p:timing>`, `<p:hf>` at the root (in a master, before `<p:txStyles>`),
  `<p:custDataLst>` and `<p:controls>` inside `<p:cSld>` — in schema order;
  `<p:extLst>` keeps its two copies, except in a model read with
  `slideExtrasByPart`, which writes each leftover once, at its own level.
  The read model is unchanged.
- **DrawingML text properties in schema order.** The paragraph and run
  properties of every DrawingML text body (pptx slides, masters, layouts
  and tables, xlsx drawings, charts) were written with the typed children
  first — the bullet, `defRPr`, the fill, `latin` — and the preserved ones
  after, so a read → write of real files put, for example, `a:buChar`
  before `a:spcBef` or `a:latin` before `a:effectLst`, which validators
  reject. `a:pPr`, `a:rPr` and `a:defRPr` now follow the schema order; the
  read models are unchanged.
- **docx anchored drawings in schema order.** `docx.write` wrote the
  preserved positioning and wrap children of a `wp:anchor` (`simplePos`,
  `positionH`, `positionV`, `wrapNone` …) before `wp:extent`, so every
  floating picture read from a Word file was written back out of the
  `CT_Anchor` order, which validators reject. The children now follow the
  schema order, the Word 2010 `wp14:sizeRelH` / `wp14:sizeRelV` after the
  graphic; the read model is unchanged.
- **xlsx threaded-comment ids in upper case.** `generateId` (used by the
  xlsx writer for comment, person and parent ids it creates) wrote the
  GUID in lower-case hexadecimal; the schema's `ST_Guid` pattern, and
  Excel, use upper case, so validators rejected every generated id. Ids
  a caller passes are still written as given.
- **docx drawing ids unique in the document.** Every drawing built
  through the API (`imageRun`, `chartRun`, `shapeRun`) was written with
  `<wp:docPr id="1">`, so a document with two drawings carried a duplicate
  id, which validators reject (ECMA-376 Part 1 § 20.4.2.5). `docx.write`
  now gives each drawing of the body and of the story parts an id unique
  among them, keeping the ids it is given when they do not clash, and
  patches `docId` in place.
- **docx parts written in schema order.** Every docx writer emitted its
  typed children, then the elements a read preserved in `_extras`, at the
  end; OOXML child lists are sequences, so a read then write of a real
  document produced invalid styles, numbering, settings, section, run,
  paragraph and table properties, and table rows (`w:trPr` after the
  cells). Run properties also wrote `w:u` before `w:highlight`. The run,
  paragraph and table properties, styles (each style and the part),
  numbering (levels, abstract numberings, the part), settings and section
  properties now order their children by their ECMA-376 sequence, an
  `mc:AlternateContent` taking the place of the element it stands for;
  rows write `w:tblPrEx` and `w:trPr` before the cells. `ooxmlShared` and
  `docxProperties` gain `sequence` and `orderBySequence`.
- **Chart series data in the form the schema allows, and Office charts
  read with their values.** The chart writer put each literal inside a
  reference (`<c:strRef>` holding `<c:strLit>`, `<c:numRef>` holding
  `<c:numLit>`, with an empty formula), which `CT_StrRef` / `CT_NumRef`
  forbid: validators rejected every chart written in docx, xlsx and pptx.
  It now writes the name as `<c:tx><c:v>`, categories as `<c:strLit>` and
  values as `<c:numLit>` directly under their data element. The reader
  looked for that same nesting and never for the cache a reference holds
  (`<c:strCache>` / `<c:numCache>`), so a chart written by Office read
  with empty series; it now reads the cache, and the earlier form still
  reads the same.
- **pptx slide size under its schema name.** The writer emitted the slide
  size as `p:sldSize`, an element `CT_Presentation` does not have
  (`p:sldSz`), so validators rejected every written presentation; the
  reader looked for the same wrong name, so the `p:sldSz` of a real file
  was never typed (`presentation.sldSize` stayed absent) and a read then
  write replaced its size by the 4:3 default. Both now use `p:sldSz`; a
  file this package wrote before still reads its `p:sldSize`.
- **docx tables carry the `w:tblPr` and `w:tblGrid` the schema requires.**
  A table built through the API (`tableFromRows`, or any table node read
  with no grid) was written without `w:tblGrid`, and without `w:tblPr` when
  it had no properties; `CT_Tbl` requires both, and OOXML validators reject
  such a table. The writer now emits an empty `w:tblPr` when the table has
  none, then the preserved grid or one derived from the rows: one
  `w:gridCol` per column of the widest row (a cell counting its
  `gridSpan`), with `w:w` when a span-free row as wide as the grid gives
  every cell a `dxa` width. Read back, both sit in the table's `_extras`,
  so a second write gives the same bytes.
- **Pictures and charts in headers, footers, notes and comments.** On
  write, a story-part drawing got no media / chart part and no
  relationship in that part's table, so its `r:embed` / `r:id` dangled;
  on read, story drawings were resolved against the document part's
  relationships, so a header picture never came back (or came back as
  the body picture sharing its rId). Each story part now reads and writes
  its own image and chart relationships; media parts are shared with the
  body. `write()` patches `embedRef` and `chartRef` in place on those
  drawings, as it does on the body's.
- **The docx root declares every prefix it uses.** `docx.write` emitted
  inline and anchored pictures as `wp:` elements with no `xmlns:wp` in
  scope, so Word refused the file. `ooxmlShared.wordRootAttrs`
  now declares each known prefix used outside a declaration of its own
  (`wp`, `v`, `o`, `m`, `w14`, …) and every prefix an `mc:Choice` names in
  `Requires`, extensions listed in `mc:Ignorable`, on the document, header,
  footer, notes, comments, styles and numbering roots (styles kept
  `w14:ligatures` and numbering kept `mc:AlternateContent` undeclared on a
  read → write of real Word files). A part without such prefixes keeps its
  root byte for byte. `wordRootAttrs(nodes, opts?)` takes `opts.r: false`
  to declare `r` only where a name uses it, as the styles and numbering
  roots do.
- **Errors survive the fw sanity layer.** `OoxmlError` defined `name` by
  assignment, which throws a `TypeError` once `applyBase()` has frozen
  `Error.prototype`, so the typed error (code, context) was lost. `name` is
  now an own property set with `Object.defineProperty` (same shape:
  writable, enumerable, configurable).

## [1.0.0] - 2026-10-07

### Added

- **Archive limits on `read()`** — `docx.read`, `pptx.read` and `xlsx.read`
  accept `maxParts`, `maxUncompressed` and `maxRatio` and forward them to
  `opc.read`; the defaults are unchanged and `0` disables a check. The
  `xlsx.read` cell caps stay in the same options object. Committed `dist/**`
  bundles regenerated.
- **`ooxmlShared.wordRootAttrs(nodes)`** — the root attributes of a
  WordprocessingML part: `w` and `r` always; `mc`, `w15` and
  `mc:Ignorable="w15"` when a `w15:` element is present. The story-part parse
  functions (`docxHeaders.parse`, `docxFootnotes.parseFootnotes` /
  `parseEndnotes`, `docxComments.parse`) accept a parsed root.

- **`read()` lists the parts a re-write drops** — `docx.read`, `xlsx.read`
  and `pptx.read` return `unmodelledParts`: the package parts the model does
  not carry, which `write()` does not reproduce (`[{ partName, contentType }]`,
  sorted, `[]` when nothing is dropped). The record is computed by the new
  `ooxmlShared.trackUnmodelledParts(pkg, consume)`, which runs the read over
  an access-tracking view of `pkg.parts`; the returned `package` stays the
  plain object. Committed `dist/**` bundles regenerated.
- **`markupCompatibility.process` option `keepElements`** — a list of
  qualified element names kept wherever they appear, even when their prefix
  is ignorable; `mc:AlternateContent` and `mc:*` attributes inside them are
  still resolved. Absent or not an array, nothing changes.
- **Read-limit boundary tests** — every `opc.read` and `xlsx.read` limit has
  an at-boundary, an over-boundary and a `0` (disabled) test.

- **Typed table cell margins** —
  `docxProperties` types `<w:tblCellMar>` as `tblPr.cellMargins` (six edges:
  `top`, `start`, `left`, `bottom`, `end`, `right`, each a `{ w, type }` width;
  any other child verbatim in `cellMargins._extras`), on tables and table
  styles alike, so a composer can pad table cells without hand-authoring XML.
  `renderTableProperties` keeps the schema order: the `_extras` that follow
  `tblCellMar` (`tblLook`, `tblCaption`, `tblDescription`, `tblPrChange`)
  render after it, every other extra before it, so a schema-ordered
  `<w:tblPr>` round-trips unchanged. `wmlTableProperties` keeps its shape (it
  re-parses the core-rendered element). Committed `dist/**` docx bundles
  regenerated.

- **Typed table properties** — `docxProperties`
  gains `parseTableProperties` / `renderTableProperties` for `<w:tblPr>`
  (`style`, `width`, `borders` with six edges; everything else verbatim in
  `_extras`); `docxStructure` types `tblPr` on the table node and
  `docxStyles` on a style (read + write, round-trip), so a composer can
  border a table without hand-authored XML. A table or style with no
  `tblPr` renders byte-identically to before. The opt-in
  `wmlTableProperties` extension re-derives its own full `tblPr` shape from
  the core-typed bag (read shape and write bytes unchanged; pinned by parity
  tests). A `Border` carries every attribute beyond `val` / `sz` /
  `space` / `color` (`w:themeColor`, `w:themeTint`, `w:shadow`, `w:frame`, ...)
  verbatim in `extraAttrs`, so a `tblBorders` round trip is lossless with or
  without the extension. Committed
  `dist/**` docx bundles regenerated.
- **Core surface** — Open Packaging Conventions (`opcPackage`,
  `opcContentTypes`, `opcRelationships`, ECMA-376 part 2) read/write
  ZIP-based packages with full `[Content_Types].xml` + `.rels` resolution.
  **WordprocessingML** (ECMA-376 §17) — `docx` orchestrator + part-level
  modules (`properties`, `structure`, `styles`, `numbering`, `settings`,
  `comments`, `footnotes`, `headers`, `drawing`, `customXml`,
  `docx-walker`, `docx-text`) covering paragraphs, runs, tables, sections,
  hyperlinks, bookmarks, ins/del, footnote/endnote/comment refs,
  header/footer parts, inline images, DrawingML shapes, custom XML data
  binding, OMML math. **SpreadsheetML** (ECMA-376 §18) — `xlsx`
  orchestrator + part-level modules (`styles`, `tables`,
  `conditionalFormatting`, `comments`, `threadedComments`, `drawings`,
  `xlsx-walker`) covering rows/cells, formulas, merges, columns, sheet
  views, auto-filter, hyperlinks, data validations, tables, conditional
  formatting + dxfs, comments (classic + threaded 2018+), drawings with
  charts and anchored images. **PresentationML** (ECMA-376 §19) — `pptx`
  orchestrator + part-level modules (`theme`, `slide`, `picture`, `table`,
  `chart`, `pptx-walker`) covering slides/layouts/masters, typed
  placeholders, text bodies, theme, inline pictures, tables, charts.
  **DrawingML** (ECMA-376 §20) — `drawingml`, `drawingmlChart`,
  `drawingmlShape`, the shared graphics surface used by all three
  formats. **Office Math** (ECMA-376 §22.1) — `ooxmlMath` (OMML
  parser/renderer). **Markup Compatibility** (ECMA-376 part 3) —
  `markupCompatibility` strips/preserves `mc:AlternateContent` blocks for
  Office 2010+ compatibility. XML parsing/serialization is delegated to
  `@awacloud/fw/io/codec/xml.js` (module `xml`) — the package ships no local
  XML parser (see Changed).
- **Typed errors** — the `ooxmlErrors` factory exposes `OoxmlError`,
  `ParseError`, `RenderError`, `ContractError`; every `throw` in the
  package uses these classes with a stable, namespaced `code` and a
  structured `context`. Consume via `runtime.resolve('ooxmlErrors')` or
  `ooxmlErrors.factory()`.
- **Shared helper factory `ooxmlShared`** — canonical namespace map
  (`NS.{W,A,R,SS,P,C,M,MC,WP,PIC,XDR,DS,TC,ACTIVEX}`), relationship types
  (`REL_TYPE.{DOC,HYPERLINK,IMAGE,STYLES,NUMBERING,SETTINGS,COMMENTS,
  FOOTNOTES,ENDNOTES,HEADER,FOOTER,CUSTOM_XML,CUSTOM_XML_PROPS,CHART,
  PACKAGE,DRAWING,TABLE,SHEET,SHARED_STRINGS,VML_DRAWING,
  THREADED_COMMENT,PERSON,SLIDE,SLIDE_LAYOUT,SLIDE_MASTER,THEME}`),
  content types (`CT.{DOCUMENT,STYLES_W,STYLES_X,NUMBERING,SETTINGS,
  COMMENTS_W,COMMENTS_X,FOOTNOTES,ENDNOTES,HEADER,FOOTER,WORKBOOK,SHEET,
  SHARED_STRINGS,DRAWING,TABLE,CHART,EMBEDDED_XLSX,PRESENTATION,SLIDE,
  SLIDE_LAYOUT,SLIDE_MASTER,THEME,VML_DRAWING,CUSTOM_XML_PROPS}`), EMU
  conversion (`EMU_PER_INCH`, `EMU_PER_CM`, `EMU_PER_PT`, `EMU_PER_PX_96`,
  `toEmu`, `inchesToEmu`, `cmToEmu`, `ptToEmu`), boolean-attribute helpers
  (`readBoolAttr`/`writeBoolAttr`), `partExt`, `lookupCT`, a singleton-backed UTF-8
  codec (`encodeText`/`decodeText`), and a stateful relationship-id
  allocator `createRidAllocator({ prefix, start, existing })`
  (`next`/`peek`/`reset`/`usedIds`/`claim`/`register`, independent
  per-instance closure state — no shared global state). Color codec
  builders: `createDmlColorCodec(xml)` (DrawingML color parse/render with
  an opt-in `withMods` flag reconciling the `dml-effects`
  transforms-preserving semantics and the `dml-fills-advanced`
  flat-reference semantics; also backs `drawingml`'s `srgbClr` builder)
  and `createXlsxColorCodec(xml)` (union semantics over
  `rgb`/`theme`/`tint`/`indexed`/`auto`, emitting `auto` only when
  truthy; consumed by `xlsx/styles` and `xlsx/conditionalFormatting`).
  `ModuleRuntime` consumers get `ooxmlShared` injected automatically
  wherever declared as a dependency.
- **Coverage extras** (opt-in, 36 modules under `src/extra/`) reach 100%
  of the ECMA-376 strict surface with no load cost for the core:
  WordprocessingML (8 phase + misc — `wml-run-formatting`,
  `wml-paragraph-formatting`, `wml-table-properties`,
  `wml-numbering-details`, `wml-settings`, `wml-fields`,
  `wml-tracked-changes`, `wml-vml-legacy`, `wml-misc`), SpreadsheetML (5
  phase + misc — `sml-pivot-tables`, `sml-calculation`,
  `sml-sheet-config`, `sml-workbook-config`, `sml-form-controls`,
  `sml-misc`), PresentationML (4 phase + misc — `pml-animations`,
  `pml-transitions`, `pml-notes`, `pml-layouts-typed`, `pml-misc`),
  DrawingML chart (5 phase + misc — `dml-chart-data-labels`,
  `dml-chart-trendlines`, `dml-chart-axes-advanced`, `dml-chart-3d`,
  `dml-chart-other-types`, `dml-chart-misc`), DrawingML main (3 phase +
  misc — `dml-effects`, `dml-fills-advanced`, `dml-shapes-advanced`,
  `dml-main-misc`), DrawingML positioning (`dml-wp-positioning`,
  `dml-xdr-advanced`), Math (`math-advanced`, `math-misc`),
  legacy/transitional (`transitional` — ECMA-376 part 4, `legacy-vml` —
  standalone VML). Each declares its own dependencies and is worker-safe
  (`factory.toString()` rehydration).
- **Bundles** — `docx-large`/`docx-full`, `xlsx-large`/`xlsx-full`,
  `pptx-large`/`pptx-full`: pure fw module descriptors (`{ name,
  dependencies, factory }`) combining the core orchestrator with its
  P0/P1 extras (`*-large`, ~95% real-world usage) or the full
  P0–P2+misc+transitional+legacy-VML set (`*-full`, 100% strict
  coverage). Consumed exclusively via `ModuleRuntime.register(...)` +
  `resolve('docxLargeBundle')` etc.; all six descriptors are re-exported
  from `main.js`.
- **Extension hook `.use(...)`** on `docx`/`xlsx`/`pptx` — after
  `read()`, the walker offers each visited `rPr`/`pPr`/`tcPr`/`table`/
  `row`/`settings`/`workbook`/`sheet` node to extensions implementing the
  matching `hydrate*` hook; before `write()`, the symmetrical
  `dehydrate*` hook runs. Idempotent registration (`.use()` ignores an
  already-registered instance); `docxWalker` pre-indexes hooks by name
  for O(N_hits) dispatch.
- **Pre-built single-factory bundles — two-surface `dist/`.**
  `tools/generate-bundles.mjs` (`bun run gen:bundles`, a thin wrapper
  around `@awacloud/tool-prebuild-generator`) emits, per assembly root (9:
  `docx`/`docx-large`/`docx-full` and the same for `xlsx`, `pptx`), two
  path-discriminated surfaces side by side under `dist/`:
  `dist/standalone/<root>.{js,min.js,meta.json}` (`dependencies: []`,
  every fw + ooxml-local factory inlined, zero runtime registration) and
  `dist/build/<root>.{js,min.js,meta.json}` (declares the 7 fw modules —
  `xml`, `bitstream`, `huffman`, `lz77`, `deflate`, `zip`, `crc32` — as
  dependencies, inlines only the ooxml-local factories, smallest
  payload). Each `.js` has a minified `.min.js` twin and a `.meta.json`
  sidecar (`fwDependencies`, source `modules`, byte sizes); `dist/build/
  index.js` is a barrel re-exporting the whole `@awacloud/ooxml` namespace for
  bulk registration on an `@awacloud/fw` runtime. Both surfaces expose a
  single factory call returning the same enriched core orchestrator as
  the legacy declarative bundles, under the resolve keys `<root>Bundled`
  (standalone) / `<root>Package` (build) — e.g.
  `docxLargeBundled`/`docxLargePackage`. `package.json` exposes
  `./build/*` and `./standalone/*`. Documented in
  `docs/api/bundles/prebuilt/README.md`. Output is deterministic
  (see Changed — Dist).
- **Documentation** — `docs/README.md` top-level index; `docs/api/` one
  page per source module (core, `extra/` opt-in, `bundles/`), following
  the `doc-format.md` convention (YAML frontmatter — module/category/
  dependencies/returns/worker-safe/status — metadata line, API table,
  examples, Notes, See also); `docs/guide/` user guides —
  `getting-started`,
  `read-write-docx`, `read-write-xlsx`, `read-write-pptx`, `extending`,
  `performance` (Web Worker integration recipe and resource-bound
  options), `coverage`, `opc-overview`; `docs/api/errors.md` — full
  catalog of error codes by namespace.
- **Tests + integration** — unit tests co-located per module; roundtrip
  integration test wiring all three formats through fw's `ModuleRuntime`
  (`tests/roundtrip.integration.test.js`); fuzz/malformed-input test
  asserting a typed error on garbage/empty/corrupt input, including XXE
  and billion-laughs (`tests/fuzz.test.js`); `tests/package-exports.test.js`
  verifying every `package.json#exports` sub-path resolves with at least
  one named export; a seeded random-attribute roundtrip pass over each
  `extra/misc` catalog (`src/extra/misc.test.js`); shared test helpers
  (`tests/_helpers/build.js` — `buildXml`, `buildDocxProps`, `buildOpc`,
  `buildDocxStack`).
- **Architecture** — strict ECMA-376 coverage by default, transitional
  variants surfaced via the dedicated `extra/transitional` mapper;
  layered architecture (stable core delegates parsing depth to
  per-element extras opted in by the consumer, unknown elements kept in
  `_extras` arrays for roundtrip fidelity); factory pattern (`{ name,
  dependencies, factory }`) compatible with `@awacloud/fw` `ModuleRuntime` DI;
  worker-safe (every factory is a self-contained closure, no closure on
  mutable module-level state — see Changed); browser-only
  (`Uint8Array`, `TextEncoder`, `TextDecoder` only); zero external
  dependency beyond `@awacloud/fw` (workspace).
- **Package surface** — `package.json` exposes:

  ```
  .                   src/main.js                       all modules + modules[]
  ./docx              src/docx/docx.js                  core WordprocessingML
  ./docx-large        src/bundles/docx-large.js
  ./docx-full         src/bundles/docx-full.js
  ./xlsx              src/xlsx/xlsx.js                  core SpreadsheetML
  ./xlsx-large        src/bundles/xlsx-large.js
  ./xlsx-full         src/bundles/xlsx-full.js
  ./pptx              src/pptx/pptx.js                  core PresentationML
  ./pptx-large        src/bundles/pptx-large.js
  ./pptx-full         src/bundles/pptx-full.js
  ./opc               src/opc/package.js
  ./drawingml         src/drawingml/drawingml.js
  ./errors            src/errors.js
  ./extra/*           src/extra/*.js                    36 opt-in modules
  ./bundles/*         src/bundles/*.js                  6 compositions
  ./build/*           dist/build/*                      two-surface prebuilt (fw-DI variant)
  ./standalone/*      dist/standalone/*                 two-surface prebuilt (framework-free)
  ```

  `awa.maturity: "L4"` (the initial core surface shipped at L2, then
  progressed L2 → L3 → L4 with the legal-metadata hygiene).

### Changed

- **API reference and source comments describe each opt-in module by what it
  covers** — internal milestone labels are removed from the `extra/` pages and
  module comments, and the `docx/structure` source documentation now lists the
  hyperlink model's `target` and `external` fields.
- **`docx.write` rejects a hyperlink `rId` it cannot resolve (breaking,
  pre-1.0)** — it throws `ContractError` `docx/hyperlink-unresolved-rid`
  (`context.rId`, `context.story`) for a hyperlink whose `rId` has no
  relationship in its part, including a body node whose `rId` is not a key of
  a supplied `opts.hyperlinks` (that option still replaces the derived map).
  The `docx/hyperlink-missing-rid` check now also covers footnotes, endnotes
  and comments.
- **`docx.write` fails explicitly instead of losing content (breaking,
  pre-1.0)** — it throws `ContractError` `docx/hyperlink-missing-rid` for a
  hyperlink with a target and no `rId`, and `docx/numbering-missing` for list
  references (`pPr.numPr`) written without `opts.numbering`, instead of
  silently writing a lost target or dangling list references. Both checks
  run before any part is rendered and leave the input model untouched.
- **`opc.write` output is byte-reproducible** — every entry is stamped
  1980-01-01 00:00 by default (overridable with `opts.mtime`, a `Date` or a
  number), so `.docx` / `.xlsx` / `.pptx` output is byte-reproducible.
- **Generated ids need Web Crypto (security)** — generated custom-XML store
  ids and threaded-comment ids use `crypto.getRandomValues` only; without it
  they throw `docx/no-random-source` / `xlsx/no-random-source` instead of
  falling back to `Math.random`. Pass the ids explicitly where Web Crypto is
  unavailable.
- **Coverage claims qualified** — the coverage pages define "full" as every
  schema element typed or preserved as a passthrough (not a conformance
  measurement), no longer print unreproducible benchmark figures, and state
  the extras naming rule.
- **Round-trip claims** — the README, guides and API pages say what is
  preserved (elements inside the parts the model carries) and what is not
  (whole parts outside the model); the three read result shapes are
  documented.
- **Source comments** — translated to English; references to an internal
  audit page removed.
- **Dist** — dist regenerated with the licence banner: every committed
  `dist/**/*.js` / `.min.js` opens with the package's `/*! … */` legal block,
  each `*.meta.json` `bytes` entry is measured on the final bytes, and the
  `builtAt` timestamp is gone — `bun run gen:bundles` is byte-deterministic.
- **Package contents** — the npm tarball now ships `NOTICE` (dual licence +
  third-party attributions) next to `LICENSE`.
- **Worker-safe factories** — every ooxml factory is a self-contained
  closure: nothing the factory body references is declared at module
  scope. Module-level constants relocated into the owning factory body
  (`DEFAULT_LIMITS`/`LEADING_SLASH_RE` in `opc/package.js`, `HOOK_NAMES`
  in `docx/docx-walker.js`, `VML_ATTRS`/`VML_TAGS` in
  `extra/legacy-vml.js`, `NS_MAP`/`TRANSITIONAL_ELEMENTS` in
  `extra/transitional.js`); the error classes (`ParseError`/
  `RenderError`/`ContractError`) are no longer imported from
  `../errors.js`: every factory that throws typed errors receives the
  `ooxmlErrors` instance as its first dependency. `factory.toString()`
  produces JS that rehydrates inside a Web Worker without resolving any
  external module symbol.
- **`xml`** — the package's local XML parser (and its tests) is retired;
  every module now consumes `xml` from
  `@awacloud/fw/io/codec/xml.js` (module name `xml`). Breaking for any
  external import of the former `ooxmlXml` export — acceptable
  pre-publication. Every `docs/` reference to `ooxmlXml` (dependency
  names, runtime resolves, imports) realigned to the canonical `xml`
  module name.
- **Namespaces, relationship types, content-types, EMU and
  boolean-attribute helpers** consolidated into `ooxmlShared` (see
  Added) — ~250 LOC removed from consumers. The following factories
  gained `'ooxmlShared'` as an additional dependency and receive the
  shared instance as their last constructor argument (breaking for
  direct `factory(...)` callers; transparent for
  `ModuleRuntime.resolve(...)` consumers, which inject it
  automatically): `docx`, `docxStyles`, `docxNumbering`, `docxSettings`,
  `docxComments`, `docxFootnotes`, `docxHeaders`, `docxCustomXml`,
  `docxDrawing`, `xlsx`, `xlsxStyles`, `xlsxTables`, `xlsxComments`,
  `xlsxThreadedComments`, `xlsxDrawings`, `xlsxConditionalFormatting`,
  `pptx`, `pptxSlide`, `pptxTheme`, `pptxPicture`, `pptxTable`,
  `pptxChart`, `drawingml`, `drawingmlChart`, `drawingmlShape`.
  `opcPackage` gained `'ooxmlShared'` as its 5th dependency
  (`factory(errors, zip, contentTypes, rels, shared)`, up from 4 args).
  `dmlEffects`/`dmlFillsAdvanced` gained `'ooxmlShared'` as a second
  dependency (`factory(xml, shared)`).
- **UTF-8 codec and rId allocation consolidated in `ooxmlShared`** — the
  `TextEncoder`/`TextDecoder` pair instantiated locally in 22
  worker-safe factories (`opc/package`; `docx/{docx, comments, customXml,
  footnotes, headers, numbering, settings, styles}`;
  `xlsx/{xlsx, styles, tables, comments, threadedComments, drawings}`;
  `pptx/{pptx, slide, theme}`; `drawingml/chart`) is replaced by
  `shared.encodeText`/`decodeText` (bit-identical to the native Web
  APIs). The bespoke rId counter/collision-loop reimplemented at 5 sites
  is replaced by `shared.createRidAllocator(...)`: `docx.js` document
  rels (`claimRid`), image rels (`collectImages.nextRId`, prefix
  `rImg`), chart rels (`collectCharts.nextRId`, prefix `rChart`);
  `xlsx.js` hyperlink rIds (prefix `rIdH`); `pptx.js` picture/chart/
  layout rIds (see Fixed for the collision bug this last site's
  consolidation also closed). Every site's allocation sequence is
  byte-for-byte identical to the pre-refactor loop it replaced
  (`createRidAllocator` yields `prefix+start, prefix+(start+1), …`
  skipping registered ids, matching the historical
  `while (… some(r => r.Id === id)) n++` contracts) — except `pptx.js`,
  whose sequence changed as a side effect of fixing the collision bug
  (see Fixed).
- **`lookupCT(pkg, partName)`** consolidated into `ooxmlShared`
  (override > extension-default lookup, `null` on no match);
  `docx.js`/`pptx.js` consume it instead of a duplicated local helper.
  `opc/contentTypes.lookup(types, partName)` keeps its complementary
  signature (flat `types` object rather than a `pkg`).
- **Errors** — granular namespaced kebab-case codes (`docx/missing-body`,
  `opc/zip-bomb`, `xlsx/limit-exceeded`, etc.) replace the placeholder
  strings `'ooxml/parse-error'`/`'ooxml/render-error'`/
  `'ooxml/contract-error'` (catalog in `docs/api/errors.md`); every
  typed error carries a structured `context` (`partName`, `elementName`,
  `limit`, `cause`, …); XML-parse/zip failures are re-thrown as typed
  errors with `cause` preserved (e.g. `docx/invalid-xml`,
  `opc/invalid-zip`); `docx.write`/`xlsx.write`/`pptx.write` reject
  non-object models / wrong-typed `body`/`sheets`/`slides` with
  `ContractError` instead of a raw `TypeError`.
- **Internals** — `docx.walkAllDrawings` now descends into
  `node.txbxContent` and `node.altContent` so images nested in
  DrawingML textboxes / MC fallback are no longer dropped on write; the
  `@typedef Drawing` formalises the shape exchanged between the
  `docx`/`xlsx`/`pptx` orchestrators and `drawingml*`; text-extraction
  helpers (`toText`, `textOfParagraph`, `textOfRun`, `textOfTable`)
  extracted to `docx/docx-text.js` (factory `docxText`, now a `docx`
  dependency) to shrink the orchestrator — public API unchanged;
  module-scoped `RegExp` hoisted in `opc/package.js` hot paths.
- **Packaging** — `awa.maturity` progressed `L2` → `L3` → `L4`;
  `package.json` gained `description`, `keywords`, `engines`,
  `sideEffects: false`, and the `./errors` sub-path export; the legal
  metadata (`license`, `author`, `copyright`, `repository`, `bugs`,
  `homepage`) is set and `LICENSE` carries the AGPL-3.0-only text.

### Removed

- **The development playground** (`playground/`), never part of the
  published package.
- **The legacy `prebuilt/` descriptors** (the 18 single-surface generated
  descriptors that lived under the bundles source directory) and the
  `tools/generate-prebuilds.mjs` generator (`bun run gen:prebuilds`) — retired in favour of the two-surface
  `dist/build/` + `dist/standalone/` convention (see Added). Exported
  factory names and resolve keys are unchanged; only the on-disk
  location and generator moved (`tools/generate-bundles.mjs`/
  `bun run gen:bundles`).
- **Imperative bundle builders** `buildDocxLarge`, `buildDocxFull`,
  `buildXlsxLarge`, `buildXlsxFull`, `buildPptxLarge`, `buildPptxFull` —
  bundles are now minimal fw descriptors consumed exclusively via
  `ModuleRuntime.register(...)`/`resolve(...)` (see Added — Bundles).
- **Named re-exports of extras from bundle entry points** (e.g.
  `docxLarge.wmlRunFormatting`, `xlsxLarge.smlPivotTables`) — import
  extras from `@awacloud/ooxml` (root) or `@awacloud/ooxml/extra/*` directly.
- **Top-level error class exports** (`OoxmlError`, `ParseError`,
  `RenderError`, `ContractError`) from `@awacloud/ooxml`/`@awacloud/ooxml/errors`
  — migrate to `runtime.resolve('ooxmlErrors')` or
  `ooxmlErrors.factory()`.
- Duplicated inline literal `…/relationships/image` in `xlsx/xlsx.js`
  (replaced by `REL_TYPE.IMAGE`) and a redundant local `findChild` in
  `extra/wml-numbering-details.js` (replaced by `xml.findChild`).

### Fixed

- **Story parts are namespace-well-formed** — header, footer, footnotes,
  endnotes and comments parts are read through markup compatibility (as
  `word/document.xml` already was) and written with the namespace
  declarations they use (`w15` and `mc:Ignorable` when needed; `w:comments`
  now declares `r`), so a re-written story part declares every prefix it
  uses. Committed `dist/**` bundles regenerated.
- **Hyperlinks are kept by `write(read(x).document, …)`** — `read()` copies a
  resolvable hyperlink's `target` / `external` onto the node, and `write()`
  emits the hyperlink relationships of headers, footers, footnotes, endnotes
  and comments in each part's own relationship table, so every resolvable
  link is kept by a re-write.
- **`word/settings.xml` declares the prefixes it uses** — settings re-written
  from a Word document declare every prefix the tree uses (`m`, `o`, `v`,
  `w14`, `w15`, …), with `mc:Ignorable` listing the Office extension ones; a
  prefix with no known namespace throws `RenderError`
  `docx/settings-unknown-prefix` (`context.prefix`).
- **Documentation states measured facts** — the transitional page and the
  `docx-full` bundle page no longer claim that the core reads Strict names or
  that the bundle rewrites namespaces; the docx guide's read-result sketch
  gives the real image and hyperlink entry shapes; the pptx and xlsx bundle
  pages give the full read envelope (`unmodelledParts` included); round-trip
  claims say "re-emitted on write", name the whole-part caveat and make no
  percentage claim.

- **`xlsx.read` cell cap fires (security)** — `maxCellsPerSheet` counted
  nothing. The row and cell caps are now checked on a pre-scan of each sheet
  before it is parsed and again while rows are mapped, and they bound the
  empty cells inserted for column gaps, so a far column reference cannot
  materialise an unbounded row.
- **Repeating-section content controls** are read from and written in the
  Word 2012 (`w15`) namespace, with their title and
  `doNotAllowInsertDeleteSection`; the legacy `w:` form is still read. The
  `w15` declarations are added to the document root only when the body holds
  such an element. Built from the specification, and verified by a
  read / write / re-read round trip of a document saved by Microsoft Word
  16.0 (a published third-party test file, MIT-licensed, vendored under
  `tests/_fixtures/`).
- **`docx.write` documents its `images` and `customXml` options.**

- **`docxNumbering.bulletList()` bullet glyph** —
  the bullet level no longer forces `rPr: { font: 'Symbol' }`: `Symbol` is a
  symbol-encoded font with no glyph at U+2022, so Word drew a hollow box.
  `lvlText` stays `•` (U+2022) and renders with the paragraph font in Word and
  LibreOffice. The numbering model is unchanged (`parse`/`serialize` still
  round-trip a caller-supplied `rPr.font`). Committed `dist/**` docx bundles
  regenerated.

- **Documentation links resolve from the npm tarball.** Links that pointed
  outside the package, or at files the tarball does not ship, now point at the
  public repository at this release's tag, so they resolve from the tarball;
  references to sources that are not published are plain-text citations,
  and a See also entry naming a page that exists nowhere is removed.

- **pptx rId allocator — historic uniqueness bug.** Before the
  rId-allocator consolidation (see Changed), `pptx.js`'s picture path
  (`shape.embedRef || 'rId' + nextRid++`) never registered a preferred
  rId (`shape.image.rId`/`shape.embedRef`) with the counter, so
  `nextRid++` could re-emit an rId already used by an earlier
  relationship — producing a `.rels` part with two entries sharing the
  same `Id` (corrupt per OPC, silently tolerated by PowerPoint and
  undetected by the pre-existing roundtrip tests). `createRidAllocator
  .claim(preferred)` now registers every preferred id, closing the
  collision class; the no-op `while (slideRels.some(...)) {}` loop and
  the local `parseRidNum`/`ensureUnique` helpers (15 LOC) were removed
  as dead code. The rId sequence emitted for pptx files whose pictures
  carry a preferred id may differ from previous versions — the new
  sequence is guaranteed collision-free; the public API (`pptx.read`/
  `pptx.write`) and roundtrip semantics (a free preferred rId is
  preserved) are unchanged. 3 regression tests added.

### Security

- **`opc.read(bytes, opts?)`** enforces three default bounds to prevent
  ZIP-bomb DoS: `maxParts` (1024), `maxUncompressed` (256 MiB),
  `maxRatio` (200). A breach raises `ParseError('opc/zip-bomb', ...)`
  with `context.limit` set; pass `0` per option to disable a given
  check.
- **`xlsx.read(bytes, opts?)`** bounds `maxSheets` (64),
  `maxRowsPerSheet` (200k), `maxCellsPerSheet` (5M). A breach raises
  `ParseError('xlsx/limit-exceeded', ...)`.
- **No DTD / no external entity** policy is documented and pinned by
  regression tests in `tests/fuzz.test.js` (XXE + billion-laughs).

### Documentation

- **Documentation pass.** The README now follows the published-package
  layout (installation, quick start, package-specific sections, a sub-path
  table with one row per `exports` key, maturity, licence and project
  links) and every quick-start snippet was executed. Registration
  snippets across the README and the guides now register `fw_require`
  (the `@awacloud/fw` modules the package consumes) before `modules`;
  without it `resolve` fails with `Module not found`. The guides open with
  a purpose and prerequisites, the coverage guide states what the `*-misc`
  passthroughs do and do not model, and the hook tables of the extending
  guide match what the xlsx and pptx walkers pass to a hook. Four reference
  pages were added for modules that had none (`docxWalker`, `docxText`,
  `xlsxWalker`, `pptxWalker`), the French `@fileoverview` prose of the
  three orchestrators is now English, and the package-local working notes
  (a TODO list and three audit pages) no longer live in the package or its
  tarball.
