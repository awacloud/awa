# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.2.0] - 2026-11-02

### Added

- **Inline elements at their place in the text** — `odt.read(bytes, {
  elementsInRuns: true })`. Every element of a paragraph, heading or link
  body that no run kind covers — a comment and its end, a bookmark, a
  field, a change mark, an index mark, a soft page break, a shape, a frame
  that `framesInRuns` does not type — becomes a raw `{ type: 'element',
  name, attrs, children }` run at its position, as a span body already
  keeps it, instead of an `_extras.children` entry that a write re-emitted
  after the runs (a comment lost its anchor; two texts around a moved
  element merged). `write` writes such a run in place; `textOf` gives it no
  text outside a span and `toText` visits its text boxes where it visited
  `_extras`, so derived views are the same in both modes. Off by default:
  the default read is unchanged, and keeps these elements in
  `_extras.children`. With `framesInRuns` and `elementsInRuns`, read,
  write, read gives back the same body for every readable `.odt` of the
  repository's wild test corpus. The pre-built bundles carry it.
- **`preserveInput` write option (`odt.write`, `ods.write`,
  `odp.write`).** With `true` the writer works on a structured clone of the
  document (its `package`, only read, excepted) and of its options, so the
  given model is left exactly as it was: an extension's dehydrate hook no
  longer changes it in place, and an edited header or footer `content`
  leaves the given `styles` model alone. The bytes are the same. The
  default (`false`) is unchanged — without it, an extension's dehydrate
  hook may change the given model, and `odt.write` of an edited header or
  footer `content` replaces that header's or footer's children and adds the
  automatic styles and font faces the edit needs to the given `styles`
  model. Another value than a boolean throws `odf/contract-error/odt`,
  `odf/contract-error/ods` or `odf/contract-error/odp`
  (`context.argument: 'opts.preserveInput'`).
- **`headerFooterContent` read option of `odt.read`, and the write back.**
  With `true`, each header and footer of the `styles.xml` master pages
  (`style:header`, `-left`, `-first`, `style:footer`, `-left`, `-first`)
  gains `content`: its children typed with the body's model, resolved
  against the `styles.xml` automatic styles, `framesInRuns` and
  `elementsInRuns` applying as for the body. The raw children stay as
  read; core read and the large and full bundles alike (a header list
  reads `ordered` and `numFormat` under the bundles as under the core).
  `odt.write` writes a header or footer from its children when its
  `content` is unedited, and from its `content` otherwise: the automatic
  styles an edit needs (direct formatting) go into `styles.xml`, under
  names neither part uses — a list added beside a `styles.xml` list style
  of the registry's name no longer writes a second style of that name.
  Off by default; another value than a boolean throws
  `odf/contract-error/odt` (`context.argument: 'opts.headerFooterContent'`).
- **`odt.read`'s `textBoxes`.** An opt-in read option (it needs
  `framesInRuns`; without it, or for another value than a boolean, it
  throws `odf/contract-error/odt`): each text-box frame run gains
  `child.content`, the box's paragraphs, headings, lists and tables typed
  as the body is, with the read's own flags; the raw children stay.
  `write` writes an untouched box from its children, byte for byte, and
  an edited one from its content (frames and inline elements kept in
  place); `toText` reads the content. Over the wild odt: 40 files with
  typed boxes, written exactly as the default read writes them. Off by
  default: the default read is unchanged.
- **`odt.read`'s `listStyles`.** An opt-in read option: the result gains
  `listStyles`, the document's list styles by name (content.xml's
  automatic ones, styles.xml's named and automatic ones, the outline
  style), each typed level by level — kind, number format, prefix,
  suffix, start value, display levels, bullet char, text style, label
  position (alignment or width-and-position), text properties.
  `textStyleRegistry` exports `typeListStyle` and `listStylesOf`. Off by
  default; another value than a boolean throws `odf/contract-error/odt`.
- **`odt.read`'s `sectionStyles`.** An opt-in read option: the result
  gains `sectionStyles`, the document's section styles by name, each
  with its columns typed — count, gap, each column's relative width and
  indents, the separator — and its balance, background colour,
  editability and writing mode. `textStyleRegistry` exports
  `typeSectionStyle` and `sectionStylesOf`. Off by default; another value
  than a boolean throws `odf/contract-error/odt`.
- **Style semantics read on request.** `odt.read(bytes, { semanticStyles:
  true })`: a span whose style holds more than the four emphasis keys (an
  rsid, a size, Asian variants …) or inherits from a `styles.xml` parent
  gains the emphasis its style chain states, keep-and-gain (the style name
  kept, nothing consumed, written back as read); a nested list with no
  style name takes its nearest styled ancestor's numbering at its level.
  The resolver gains `opts.semantic` and `listLevel`. The default read is
  unchanged; another value than a boolean throws `odf/contract-error/odt`.
- **List and item attributes kept.** On the default read, a list gains
  its `xml:id` (`id`) and `text:continue-list` (`continueList`), an item
  its `text:start-value` (`startValue`) and `xml:id` (`id`), and any
  other attribute of these elements goes to `extraAttrs`; all are written
  back. An untouched save dropped them (63 list ids, 12 item start
  values, 1 continue-list in the wild test odt).
- **`cleanup` write option of `odt.write`**, at parity with
  `docx.write`'s: `cleanup: ['emptyProperties']` drops every
  `style:*-properties` element with no attribute and no child from the
  automatic styles of `content.xml` and the styles of `styles.xml`,
  working on a structured clone so the caller's model is unchanged. An
  unknown or repeated name throws `odf/contract-error/odt`
  (`context.argument: 'opts.cleanup'`). Absent by default.
- **`keepVersion` write option (`odt.write`, `ods.write`, `odp.write`).**
  With `true`, each part is written with the `office:version` of its
  source part (none when the source part has none; a part the source
  lacks takes the source `content.xml`'s), and the manifest with the
  source version from ODF 1.2 on (none before, the attribute being
  1.2's): a round trip of a 1.2 or 1.3 document is then
  checked against its own version's schema instead of 1.4's, which
  refuses some of the markup carried from it. Under it, `odt.write` of a
  source older than ODF 1.3 (which has no `draw:mime-type` on images)
  writes an image read with LibreOffice's `loext:mime-type` under that
  attribute. The default (`false`) stamps `1.4` as before and writes
  `draw:mime-type`; another value throws the module's `ContractError`.
  The low-level members behind it: `odfShared` gains `sourceRootAttrs`,
  `keptVersion` and `applyManifestVersion`, the meta, settings and styles
  `serialize` take `opts.version` (`null` writes no attribute) and
  `pkgManifest.serialize` writes no `manifest:version` for `version:
  null`.

### Changed

- **An image with both mime attributes reads and writes both.** An image
  carrying `draw:mime-type` and `loext:mime-type` now reads the
  `draw:mime-type` value as its `mimeType` (it read the `loext` one),
  keeps the other as an extra attribute, and the default write emits both
  attributes (it wrote only `draw:mime-type`, with the `loext` value). An
  image with one attribute reads and writes as before.

### Fixed

- **An untouched odt save keeps its lists' numbering.** The read
  consumed every automatic list style a list named and the write
  gave the list a generic one built from its first level's format:
  each level's own format, prefix and suffix, the display levels,
  the bullets and the label positions were lost (all 64 styled lists
  of the wild test odt). The read now consumes only a style the write
  rebuilds as it is; any other stays in `autoStyles` and the list
  keeps its `styleName` beside the numbering read from it
  (`listNumbering`'s new `source: 'kept'`).
- **Automatic-style property children survive a write.** An automatic
  style kept the attributes of its `style:*-properties` elements and
  dropped their children — a paragraph style's `style:tab-stops` or
  `style:drop-cap`, a cell style's `style:background-image` — so an odt,
  ods or odp write lost them and wrote an empty property element instead
  (over the 316 wild odt: 376 of 426 children lost in 57 files, 51 empty
  `<style:paragraph-properties/>` written). They are now kept, verbatim,
  in the style's `_extras.propertyChildren` and written back in place;
  the flat `properties` bags are unchanged.
- **The bundles' extensions write back what they type.** Twenty opt-in
  extensions (fields, tracked changes, meta and ruby, notes and other
  passthrough text, sections, tables, shapes and frames, charts, 3D,
  animations, presentation, scripts, settings, signatures, styles, list
  headers) promote elements out of a node's `_extras` on read and render
  them back on write. When every extra of a node had been promoted, the
  write built an `_extras` array, which no renderer reads: the elements
  were lost. Measured over the repository's wild test corpus, a document
  written through the full bundle lost elements of 35 kinds in `.odt`
  (fields, change marks, notes, index marks, soft page breaks, ruby…) and
  of 21 kinds in `.ods` (frames, pictures, embedded objects, named ranges,
  shapes…); it now writes exactly the elements the core writes. An
  `_extras` array (a hook's own carrier) still round-trips as an array.
  The pre-built bundles carry the fix.
- **The large and full bundles write `styles.xml` back.** Their opt-in
  extensions `textListDetailed` and `stylePage` type the list and outline
  styles, page layouts and master pages of `styles.xml` on read, and on
  write rendered them into an `_extras` array the serialiser never reads,
  replacing the object that holds the root's other children: every
  document read and written through an `odt`, `ods` or `odp` large or
  full bundle lost its list and outline styles, page layouts, master
  pages and font-face declarations (a list read back without its
  numbering). Each element now goes back into its container (`styles`,
  `automaticStyles`, `masterStyles`), recorded in a new optional
  `container` field when it came from another one, and the root's other
  children are left as read. `stylePage` also keeps the text of a header
  or footer: a page bag's `children` now hold the non-element children at
  their place, as read. `textListDetailed` also takes the
  `text:list-header` elements it promotes out of the list's
  `_extras.children` (the write puts them back). The
  pre-built bundles that carry the two extensions are regenerated.
- **A soft page break between table rows stays before its row.** A
  `text:soft-page-break` read between two rows of a table (or of its
  header rows) was kept with the table's extras and written after the
  last row, where the ODF schema allows none: odfvalidator refused the
  table. It is now written back before the row it preceded (the table
  model keeps the row index in an internal `_softPageBreaks`, and the
  break leaves `_extras.children`); a break whose row the model no longer
  has is not written, and one read after the last row stays there, as
  before.
- **A generated list style always has a valid name.** The style registry
  named a numbered list style `awa-l-n` followed by its number format,
  so LibreOffice's extended formats (`0001, 0002, 0003, ...`,
  `一, 二, 三, ...`) gave names with spaces and commas, which odfvalidator
  refused. A format made of XML name characters keeps that name (`1`,
  `a`, `I` …); any other is named `awa-l-x1`, `awa-l-x2` … in the order
  first met. The number format written is unchanged.
- **The prefix of a namespaced-token value is declared.** A written part
  declared the namespace prefix of a formula's value but not that of the
  five attributes the ODF schema types as a qualified name
  (`form:control-implementation`, `chart:class`, `draw:engine`,
  `draw:extrusion-metal-type`, `db:type`): a form control read from a
  LibreOffice file (`ooo:com.sun.star.form.component.Form`) was written
  without `xmlns:ooo`, which odfvalidator refused. The prefix is now
  declared on the part's root when the source part or the known table
  resolves it.
- **`styles.xml` declares its font faces first.** `odfStyles.serialize`
  wrote the kept `office:font-face-decls` after `office:master-styles`;
  the ODF schema wants it before `office:styles`, and odfvalidator refused
  every ODT, ODS and ODP write whose `styles.xml` declares font faces. It
  is now written first, the root's other kept children still last; the
  rest of the part is unchanged.
- **A table without rows and a row without cells are written
  schema-valid.** `renderTable` writes a table that would hold no row (an
  empty sheet, `ods.write(ods.empty())`, or a text table with `rows: []`)
  with one row of one empty cell, and `renderRow` writes a row with no
  cell with one empty cell, as LibreOffice writes an empty sheet: the ODF
  schema needs a row in a table and a cell in a row, and odfvalidator
  refused both. A table whose rows sit in a row group kept among its
  extras gets no added row, and a `headerRows` larger than the rows no
  longer writes an empty `table:table-header-rows`. Read back, such a
  table shows that row. Tables with rows and cells are written as before.

## [1.1.0] - 2026-10-21

### Added

- **Frames at their place in the text** — `odt.read(bytes, { framesInRuns:
  true })`. A `<draw:frame>` of a paragraph, heading, span or link body (a
  picture anchored as a character between two words, say) becomes a
  `{ type: 'frame', ...drawFrame model }` run at its position instead of
  staying in the paragraph's `_extras.children`, where its place in the line
  was lost and a read → write moved it after the text. `write` renders a
  frame run in place; `toText` reads it as it reads the raw frame. The
  paragraph `ctx` gains the optional `parseFrame` / `renderFrame` members.
  The default read model is unchanged.

### Fixed

- **Byte-reproducible packages.** `pkgPackage.write` passed no
  date to the ZIP writer, so every entry carried the write time and two
  writes of the same document differed. Entries are now stamped
  1980-01-01 00:00:00 (the MS-DOS epoch, as the OPC writer of
  `@awacloud/ooxml` does), or `opts.mtime` (`number | Date`) when given;
  `odt.write`, `ods.write` and `odp.write` pass their `opts.mtime` through.
  A date the ZIP writer refuses (outside 1980-2099) throws `RenderError`
  `odf/render-error/pkg` with the ZIP error as `cause`, as does any other
  ZIP writer refusal (previously an untyped `Error`).
- **Hidden table columns and rows.** `table:visibility` (`collapse`,
  `filter`, `visible`) on `<table:table-column>` and `<table:table-row>` was
  dropped on read — a hidden ODS column or row came back visible after a
  read → write, and a consumer could not leave it out. Columns and rows now
  carry `visibility` and write it back.
- **Unknown frame child kind.** `drawFrame.renderFrame` returned a `null`
  child for an unknown `child.kind`, which failed later in serialization
  with an untyped `TypeError`; it now throws `ContractError`
  `odf/contract-error/frame` (`context.kind`). `drawFrame` depends on
  `odfErrors` (appended last); a factory wired by hand with the 1.0.0
  two-argument call `drawFrame.factory(xml, image)` keeps working and keeps
  the 1.0.0 `null` child for an unknown kind. Committed `dist/**` bundles
  regenerated.
- **Typed errors survive a frozen `Error.prototype`.** `OdfError` defined
  `name` by assignment, which throws a `TypeError` once `@awacloud/fw`'s
  `applyBase()` has frozen `Error.prototype`, so the typed error (code,
  context) was lost. `name` is
  now an own property set with `Object.defineProperty` (same shape:
  writable, enumerable, configurable).
- **No empty `<office:settings>`.** `odfSettings.serialize` wrote an empty
  `<office:settings/>` for a model with no item set — every file the
  writers produced by default — which the ODF schema refuses (the element
  is optional, and holds one `config:config-item-set` or more when
  present). `settings.xml` now has no `office:settings` child in that case;
  a model with an item set or a kept child is written as before, and the
  read model is unchanged (`{ itemSets: [] }`). Committed `dist/**` bundles
  regenerated.
- **Custom-shape geometry after the text.** `drawShape.renderShape` and the
  `drawShapes` extra wrote `<draw:enhanced-geometry>` as the first child of
  a `<draw:custom-shape>`; the schema puts it last, after the shape's text
  (`text:p`, `text:list`), so every custom shape with text was refused. The
  other children keep their read order, the geometry now comes last; the
  read model is unchanged. Committed `dist/**` bundles regenerated (the
  `-large` and `-full` roots, which carry the extra).
- **Tables written with their columns.** `tableTable.renderTable` wrote no
  `<table:table-column>` for a model with `columns: []` — the shape
  `ods.sheet`, `ods.fromArrays` and `ods.empty` build — and the schema
  requires a column before the rows. Such a table is now written with one
  column repeated to the widest row (`table:number-columns-repeated`, left
  out for a width of 1); a model with columns is written as before. Reading
  a file written that way now shows that column (`columns: [{ repeated: N
  }]`) where the model passed to `write` had none. Committed `dist/**`
  bundles regenerated.
- **Tracked-change regions carry `xml:id`.** `textTracked` and the
  `textTrackedChanges` extra wrote `<text:changed-region>` with `text:id`
  only. Since ODF 1.2 the region's ID is `xml:id` (required), which the
  `text:change-id` of the change markers refers to: written tracked changes
  were refused. A region with an id is now written with `xml:id` and
  `text:id`, same value; the read model is unchanged. Committed `dist/**`
  bundles regenerated (the roots carrying the extra).
- **Every presentation page has a master page.** `odp.write` wrote a
  `<draw:page>` without `draw:master-page-name` for a slide with no
  `masterPageName` — `odp.empty()` and `odp.slide(name)` build such
  slides — and never wrote a master page itself; the schema requires the
  attribute, and a master page requires a page layout. Such a slide is now
  written with `Default`, and when the styles written hold no master page
  of that name, `styles.xml` gains one with a 28 × 15.75 cm landscape page
  layout (`PM1`, or the first free `PM<n>`). A deck whose slides all name
  a master page is written as before; the models passed in are not
  modified. Reading such a file back shows `masterPageName: 'Default'` and
  the two added styles. Committed `dist/**` bundles regenerated.

## [1.0.0] - 2026-10-07

### Added

- **Core package container (L0)** — `pkgPackage`, `pkgManifest`,
  `pkgMimetype` read / write ZIP-based ODF packages, enforcing the
  `mimetype`-first-STORED convention and parsing
  `META-INF/manifest.xml`. Namespace URIs, the `ODF_VERSION` constant,
  XML declaration variants and the frozen MIME table (`CT.ODT/.ODS/
  .ODP/.XML/.FORMULA`) are centralized in the shared `odfShared`
  factory (see below) rather than duplicated per module.
- **Typed errors** — the `odfErrors` factory exposes `OdfError`,
  `ParseError`, `RenderError`, `ContractError` and `isOdfError`;
  consumers resolve it via `runtime.resolve('odfErrors')` or
  `odfErrors.factory()` in tests. Error codes are namespaced by origin
  (`odf/parse-error/<part>` — `/odt`, `/ods`, `/odp`, `/manifest`,
  `/meta`, `/settings`, `/styles`, `/mimetype`, `/pkg`, `/chart`,
  `/math`, `/limit`), and API/contract violations (`odt.write(null)`,
  `pkg.write({})` without mimetype, `pkgMimetype.parse`/`render` with
  bad input, …) raise `ContractError('odf/contract-error/<module>', …)`
  instead of `ParseError`. All raised errors carry a rich
  `context: { part, module, ... }` and preserve `cause`.
- **Metadata / settings / styles** — `odfMeta` parses / renders
  `meta.xml` (`<office:document-meta>` → `<office:meta>` carrying
  `dc:title`, `dc:creator`, `dc:date`, `meta:generator`,
  `meta:initial-creator`, `meta:creation-date`, preserve-unknowns for
  the rest). `odfSettings` parses / renders `settings.xml`, preserving
  `<config:config-item-set>` children as raw element nodes.
  `odfStyles` parses / renders `styles.xml` with the three standard
  buckets (`office:styles`, `office:automatic-styles`,
  `office:master-styles`) as raw element node arrays.
- **Text (L0/L1)** — `textParagraph` types `<text:p>` / `<text:span>`
  plus `text:s`, `text:tab`, `text:line-break` run kinds. `textHeading`
  (`<text:h>` + `outlineLevel`), `textList` (`<text:list>` +
  `<text:list-item>`, incl. nested lists), `textSection`
  (`<text:section>`), `textBookmarks` (inline `<text:bookmark*>` /
  `<text:reference-mark*>`), `textFields` (`<text:date>`,
  `<text:page-number>`, `<text:variable-*>`, `<text:bookmark-ref>` +
  twelve other inline field elements), `textContent` (body
  orchestrator: `parseBody`, `renderBody`, `bodyText`).
- **Table (L1)** — `tableCell` (typed value/formula/spans/repeated;
  the opt-in `maxRepeat` option of `parseCell` raises
  `ParseError('odf/parse-error/limit')` when `table:number-columns-repeated`
  exceeds the ceiling), `tableRow` (cells + repeated, same option on
  `parseRow`), `tableTable` (columns, header rows, rows).
- **Draw (L1)** — `drawImage` (`<draw:image>` + magic-byte sniffer for
  PNG/JPEG/GIF/BMP/WebP/TIFF/SVG) and `drawFrame` (`<draw:frame>`
  wrapping image / text-box / object children).
- **Style (L1)** — `styleAutomatic` (typed `<office:automatic-styles>`
  with per-family property bags), `stylePageLayout`
  (`<style:page-layout>` + header/footer styles), `styleMasterPage`
  (`<style:master-page>` with header/footer/header-left/footer-left
  preserved as raw XML).
- **Number (L1)** — `numberFormats` parses / renders date / time /
  number / currency / percentage / boolean / text styles, preserving
  ordered typed `parts`.
- **`.odt` orchestrator** — the `odt` factory composes the stack to
  read / write a complete `.odt` package (`mimetype` STORED +
  `META-INF/manifest.xml` + `content.xml` + `styles.xml` + `meta.xml`
  + `settings.xml`), exposing `read`, `write`, `empty`, `paragraph`,
  `fromText`, `toText`. The body consumes `textContent`: `read()`
  returns mixed typed nodes (paragraphs / headings / lists / sections /
  soft-page-breaks / `unknown`), `toText()` walks them recursively.
- **ODS (L2)** — `spreadsheet` types `<office:spreadsheet>` as
  `{ tables, namedExpressions?, dataValidations?, _extras? }` (named
  expressions and content validations preserved as raw XML). `ods` is
  the `.ods` orchestrator (mimetype
  `application/vnd.oasis.opendocument.spreadsheet`), exposing `read`,
  `write`, `empty`, `sheet`, `fromArrays`, `cell`, `toText`, `CT_ODS`.
  `tableCell` gained typed `office:value-type` support for `float` /
  `percentage` / `currency` / `date` / `time` / `boolean` / `string`
  with the matching `office:value` / `office:date-value` /
  `office:time-value` / `office:string-value` / `office:boolean-value`
  / `office:currency` attrs; `table:formula` preserves the OpenFormula
  `of:=…` prefix transparently.
- **ODP (L2)** — `presentationStyle` types `<presentation:placeholder>`
  and `<presentation:notes>` (basic; animations/transitions deferred to
  L3). `slide` types `<draw:page>` as `{ name, masterPageName?,
  styleName?, layoutName?, frames, notes?, _extras? }`. `odp` is the
  `.odp` orchestrator (mimetype
  `application/vnd.oasis.opendocument.presentation`), exposing `read`,
  `write`, `empty`, `slide`, `fromSlides`, `toText`, `CT_ODP`.
- **L3 core surface** — `textTracked` (`<text:tracked-changes>`
  container: `changed-region` × { `insertion` | `deletion` |
  `format-change` } with `office:change-info`, plus inline
  `text:change`/`text:change-start`/`text:change-end` markers).
  `drawShape` (typed `draw:rect`, `draw:circle`, `draw:ellipse`,
  `draw:line`, `draw:polyline`, `draw:polygon`, `draw:path`,
  `draw:custom-shape` with optional `draw:enhanced-geometry`).
  `chartChart` (`<chart:chart>` root parser/renderer preserving
  title/subtitle/legend/plot-area, axes, series, data-points, plus
  `bytesOf`/`parseBytes` for the chart content.xml sub-document).
  `mathMath` (opaque passthrough for embedded MathML `<math:math>` +
  `bytesOf`/`parseBytes`). `odpAnimations` (recursive parse/render for
  `anim:*` trees — `par`, `seq`, `set`, `animate`, `animateColor`,
  `animateMotion`, `animateTransform`, `transitionFilter`, `audio`,
  `command`, `iterate`, `param` — plus `parseTransition`/
  `renderTransition` for `presentation:transition`). `formForms`
  (`<office:forms>` container with the typed `form:*` control set:
  button, text, checkbox, listbox, combobox, radio, date, time, file,
  hidden, image-frame, formatted-text, fixed-text, password, textarea,
  generic-control, value-range, column, grid, item, option, properties,
  property, list-property, connection-resource). `dr3dScene`
  (`<dr3d:scene>` with typed lights and `dr3d:cube`/`dr3d:sphere`/
  `dr3d:extrude`/`dr3d:rotate`). `odfMc` (markup-compatibility helpers
  `versionOf`, `meetsVersion`, and a `process` no-op mirroring OOXML's
  `markupCompatibility.process` for future stripping/promotion logic).
- **Extension hook `.use()`** — one walker module per top-level
  orchestrator (`odtWalker`, `odsWalker`, `odpWalker`), each exposing
  `createWalker()` → `{ use, applyHydrate, applyDehydrate,
  hasExtensions }`. The `odt`/`ods`/`odp` factories wire the walker
  into `read()` (post-parse hydrate) and `write()` (pre-render
  dehydrate) and expose `.use(...extensions)` for idempotent
  registration of opt-in extras. Hook surface: `hydrate*`/`dehydrate*`
  for `Paragraph`, `Span`, `Heading`, `List`, `Table`, `Cell`, `Frame`,
  `Slide`, plus `Metadata`, `Settings`, `Styles`. The three walkers
  share their dispatch/indexing engine via the `odfWalker` factory (see
  below) instead of duplicating ~100 LOC each; the hook index is keyed
  by hook name and rebuilt lazily after each `use(...)`, so on a
  `*-full` bundle (≈29 extensions, ~10 000 paragraphs) the dispatch
  table only holds extensions that actually implement the requested
  hook.
- **Coverage extras — P0** (typed, always shipped in the `*-large`
  bundles): `textTrackedChanges` (`text:tracked-changes`,
  `text:changed-region`, `text:insertion`, `text:deletion`,
  `text:format-change` + inline change markers), `textFieldsExtended`
  (`text:variable-*`, `text:user-field-*`, `text:sequence-decl`,
  `text:expression`, `text:database-*`, `text:hidden-*`,
  `text:conditional-text`, `text:placeholder`, `text:execute-macro`,
  `text:dde-connection*`, `text:meta-field`), `textListDetailed`
  (`text:list-style`, `text:list-level-style-*`, `text:outline-style`,
  `text:outline-level-style`, `text:list-header`), `tableAdvanced`
  (`table:table-template`, `table:database-range`, `table:filter*`,
  `table:scenario`, `table:sort*`, `table:data-pilot-*` recursive
  tree), `stylePage` (`style:page-layout`,
  `style:page-layout-properties`, `style:master-page`,
  `style:header(-left|-first)?`, `style:footer(-left|-first)?`,
  `style:background-image`, `style:column*`, `style:footnote-sep`,
  `style:layout-grid-properties`), `stylePropertiesTyped` (promotes a
  curated subset of attrs on every `style:*-properties` element into
  typed fields, unknown attrs preserved), `drawShapes` (`draw:rect`,
  `draw:circle`, `draw:ellipse`, `draw:line`, `draw:polyline`,
  `draw:polygon`, `draw:path`, `draw:regular-polygon`,
  `draw:connector`, `draw:caption`, `draw:measure`, `draw:control`,
  `draw:custom-shape` with `draw:enhanced-geometry` + `draw:equation` +
  `draw:handle`, `draw:contour-*`), `presentationTyped`
  (`presentation:placeholder`, `presentation:notes`,
  `presentation:settings`, `presentation:show*`, `presentation:hide*`,
  `presentation:dim`, `presentation:play`,
  `presentation:event-listener(s)?`, `presentation:sound`,
  `presentation:date-time(-decl)?`, `presentation:footer(-decl)?`,
  `presentation:header(-decl)?`, `presentation:animations`,
  `presentation:transition`).
- **Bundles `*-large`** — `@awacloud/odf/odt-large` (core odt + the 7 P0
  odt-relevant extras, descriptor `odtLargeBundle`),
  `@awacloud/odf/ods-large` (core ods + the 6 P0 ods-relevant extras,
  `odsLargeBundle`), `@awacloud/odf/odp-large` (core odp + the 6 P0
  odp-relevant extras, `odpLargeBundle`). Each `*-large` bundle leaves
  P1/P2/P3 extras out; the descriptors replaced earlier imperative
  `build*` helpers (see Removed).
- **Coverage extras — P1** (deep complementary typing): `textMetaExtended`
  (`text:meta`, `text:meta-field`, `text:rdf-metadata` + paragraph RDFa
  attrs), `textSectionsAdvanced` (`text:section-source`,
  `text:section-decl`, `text:dde-connection` + protection attrs),
  `textTocIndex` (every ODF index family — TOC, alphabetical, user,
  object, illustration, table, bibliography — + all
  `*-source`/`*-entry-template`/`index-title-template`/`index-body`
  children), `drawImageExtended` (`draw:area-*`, `draw:image-map`,
  `draw:gradient/hatch/fill-image/opacity/marker/stroke-dash`,
  `draw:layer*`, `draw:applet/plugin/floating-frame/object/object-ole`),
  `chartTyped` (deep `chart:*` tree: title, subtitle, footer, legend,
  plot-area, axis, categories, grid, series, domain, data-point,
  mean-value, regression-curve, error-indicator,
  stock-gain/loss/range, wall/floor, label-separator, equation,
  data-label), `animationsSmil` (typed `anim:*` — par, seq, iterate,
  audio, command, set, animate, animateColor, animateMotion,
  animateTransform, transitionFilter, param), `formsControls` (typed
  full `form:*` control set, ~30 controls + properties +
  event-listener), `numberFormatExtended` (typed `number:*`
  sub-elements: number, scientific-number, fraction, currency-symbol,
  all date/time/boolean sub-elements), `metaExtended` (full
  `meta:*`/`dc:*` set in `<office:meta>`: generator, initial-creator,
  creation-date, document-statistic, user-defined, keyword,
  editing-cycles, editing-duration, …), `mathMathml` (typed
  `<math:math>` passthrough + manifest wiring helpers, MathML body kept
  as raw XML).
- **Coverage extras — P2** (secondary domains): `dr3d3d` (deeper typing
  of `dr3d:scene/cube/sphere/extrude/rotate/light`), `databaseSources`
  (`db:*`, ~50 elements, typed passthrough via the shared
  `odfTypedHelper`), `settingsExtended` (deeper typing of
  `config:config-item*`), `scriptMacros` (typed `office:scripts/script`
  + `office:event-listeners` + `script:event-listener`),
  `dsigSignatures` (typed `dsig:document-signatures` + raw XML-DSig
  body preservation + `META-INF/documentsignatures.xml` manifest entry
  helper).
- **Coverage extras — P3** (catch-all `_passthrough: true`):
  `textMisc`, `styleMisc`, `drawMisc`, `tableMisc`, `officeMisc`
  (residual `text:*`/`style:*`/`draw:*`/`table:*`/`office:*` not
  covered by P0/P1), `legacyStaroffice` (preserves any element with a
  StarOffice 5.x/6.x namespace prefix — `so:`, `so20:`, `so52:`,
  `ooo:`, `ooow:`, `oooc:` — as `_legacy: true`).
- **Bundles `*-full`** — `@awacloud/odf/odt-full` (`odt-large` + the 17
  odt-relevant P1/P2/P3 extras, descriptor `odtFullBundle`),
  `@awacloud/odf/ods-full` (`ods-large` + the 16 ods-relevant P1/P2/P3
  extras, `odsFullBundle`), `@awacloud/odf/odp-full` (`odp-large` + the 18
  odp-relevant P1/P2/P3 extras, `odpFullBundle`).
- **Shared helper factories** — `odfShared` (deps `['odfErrors',
  'xml']`) centralizes the canonical ODF namespace map (`ODF_NS`, 24
  frozen URIs), `ODF_VERSION`, the XML declaration variants
  (`XML_DECL`, `XML_DECL_STANDALONE`), the frozen MIME table, the
  singleton-backed UTF-8 codec (`encodeText`/`decodeText`), and the
  stateless helpers `parseXmlOrThrow`, `readSidecars`, `writeSidecars`,
  `findDeep`, `intAttr`, `boundedIntAttr`. `odfWalker` (deps `[]`)
  exposes `createWalker(config)`, the shared engine behind the three
  format walkers. `odfMiscHelper` (deps `['xml']`) exposes
  `buildMiscPassthrough(elementNames, ns)`; `odfTypedHelper` exposes
  `buildTypedFamily(elementNames, ns, typeTag)` — both promoted from
  dead ESM helpers (`src/extra/_misc-helper.js`/`_typed-helper.js`,
  shipped but never imported) to worker-safe factories, with the
  legacy named exports preserved for direct importers. `src/main.js`
  re-exports all four; `odfShared` and `odfWalker` are registered through
  `modules[]`, the two helper factories through `extras[]`.
- **Pre-built single-factory bundles — two-surface `dist/`.**
  `tools/generate-bundles.mjs` (`bun run gen:bundles`, a thin wrapper
  around `@awacloud/tool-prebuild-generator`) emits, per assembly root (9 :
  `odt`/`odt-large`/`odt-full` and the same for `ods`, `odp`), two
  path-discriminated surfaces side by side under `dist/` :
  `dist/standalone/<root>.{js,min.js,meta.json}` (`dependencies: []`,
  every fw + odf-local factory inlined, zero runtime registration) and
  `dist/build/<root>.{js,min.js,meta.json}` (declares the 6 fw modules
  — `xml`, `bitstream`, `huffman`, `deflate`, `zip`, `crc32` — as
  dependencies, inlines only the odf-local factories, smallest
  payload). Each `.js` has a minified `.min.js` twin and a
  `.meta.json` sidecar (`fwDependencies`, source `modules`, byte
  sizes); `dist/build/index.js` is a barrel re-exporting the whole
  `@awacloud/odf` namespace for bulk registration on an `@awacloud/fw` runtime.
  Both surfaces expose a single factory call returning the same
  enriched core orchestrator as the legacy declarative `*Bundle`
  descriptors, under the resolve keys `<root>Bundled` (standalone) /
  `<root>Package` (build) — e.g. `odtLargeBundled` / `odtLargePackage`
  — unchanged from the retired generated-descriptor layout (see
  Removed). `package.json` exposes `./build/*` and `./standalone/*`.
  Documented in `docs/api/bundles/prebuilt/README.md`. Output is
  byte-deterministic (see Changed — Dist).
- **Documentation** — `docs/README.md` top-level index; `docs/api/`
  one page per source module (YAML frontmatter: module / category /
  dependencies / returns / worker-safe / status), including the pages
  under `docs/api/extra/*`, the bundle pages
  (`docs/api/bundles/od{t,s,p}-{large,full}.md`) plus a reference for the two
  shared factories (`docs/api/_shared/README.md`); `docs/guide/`
  guides — getting-started (incl. an added security section on XML
  parsing, see Security below), read-write-odt, pkg-overview,
  read-write-ods, read-write-odp, coverage (maturity tiers). The L3 audit (P0/P1/P2/P3
  breakdown) and the L3 → L4 finalisation report (15 items across
  risks/perf/errors/maintainability) were working documents and are not
  shipped; see Changed below for the net result.
- **Tests + integration** — the suite grew from the initial **108
  unit tests** (14 files, 334 assertions) at L0 through the L2 (ODS/ODP
  parse/render/roundtrip/error suites) and L3 (58 new unit tests across
  the eight new modules, extended roundtrip + fuzz coverage, shared
  test helpers exposing `tracked`/`shape`/`chart`/`math`/`forms`/
  `dr3d`/`mc` instances) additions to **483 pass / 0 fail across 87
  files** after the L3 → L4 finalisation and dedup passes. Coverage includes a roundtrip
  integration test wired through fw's `ModuleRuntime`
  (`tests/roundtrip.integration.test.js` — ODT paragraphs/headings/
  lists/sections, 2-sheet ODS with formula + typed values, 3-slide ODP
  with placeholders/notes, tracked-changes + `draw:rect`/
  `draw:custom-shape` + `chartChart`/`mathMath` + `anim:par` +
  `<office:forms>` + `dr3d:scene` survival) and a fuzz/malformed-input
  suite (`tests/fuzz.test.js` — typed `ParseError` on garbage/empty/
  corrupt input and bad-mimetype/missing-`content.xml`/
  `write(undefined)` for every module through L3).
- **Architecture** — mirrors the architecture of `@awacloud/ooxml`
  (same factory pattern, file layout, test/doc conventions, error
  hierarchy shape); layered architecture (stable L0 core with room for
  L1+ extensions); preserve-unknowns (every typed parser keeps
  unrecognised attributes/children in `_extras` for roundtrip
  fidelity); factory pattern (`{ name, dependencies, factory }`)
  compatible with
  `@awacloud/fw` `ModuleRuntime` DI; worker-safe (each factory is
  self-contained, no closure on mutable module-level state);
  browser-only (`Uint8Array`, `TextEncoder`, `TextDecoder` only); zero
  external dependency beyond `@awacloud/fw` (workspace).
- **Package surface** — sub-path exports grew across the maturity
  levels: L0 shipped 3 (`.` → `src/main.js`; `./odt` → `.odt`
  orchestrator; `./pkg` → ODF container); L2 added `./ods` and `./odp`
  (`awa.maturity: "L2"`); L3 added `./chart`, `./math`, `./form`,
  `./dr3d` (`awa.maturity: "L3"`). The full current map (also `./errors`,
  `./text`, `./table`, `./draw`, the `*-large` / `*-full` bundles,
  `./extra/*`, `./bundles/*`, `./build/*`, `./standalone/*`) is the
  README table "Exposed sub-paths".
- **Typed presentation capability** — a
  consumer can now produce a presentable `.odt` without authoring ODF XML.
  (a) `odfStyles.serialize` accepts typed named-style SPECS
  (`{ name, family, displayName?, parentStyleName?, nextStyleName?,
  defaultOutlineLevel?, class?, properties?, _extras? }`) in its three
  buckets next to raw elements (raw entries stay byte-identical), through
  the new public `odfStyles.namedStyle(spec)`; a missing/non-string
  `name`/`family` raises `ContractError('odf/contract-error/styles')`;
  `parse` stays raw. (b) Body-table grid seam: a `textContent` `table` node's
  `grid: true` renders through the new `textStyleRegistry` registry members
  `cellStyle({bordered: true})` → `awa-c-b` (`table-cell`, `fo:border`
  `0.5pt solid #000000`, `fo:padding` `0.097cm`) and
  `tableStyle({align: 'margins'})` → `awa-tb-m` (`table:align="margins"`),
  explicit `styleName`s winning; on read the new resolver members
  `cellBorders` / `tableAlign` recognise it back (honesty rule: fully mapped
  or `null`), restoring `grid: true` and consuming the auto styles, so
  `odt.read(odt.write({ body: [gridTable] })).autoStyles` is `undefined`.
  (c) Every generated `text:list-style` level (1..10, bullet and number)
  carries one label-alignment `style:list-level-properties` child
  (`fo:margin-left` / tab stop `1.27cm` … `6.985cm`, `fo:text-indent`
  `-0.635cm`) — no forced bullet font. Committed `dist/**` bundles
  regenerated.
- **Bounded ZIP reading** — `read(bytes, opts)` caps on `pkgPackage` and
  on the `odt`, `ods` and `odp` facades, and the frozen
  `pkgPackage.DEFAULT_LIMITS` (see Security).
- **Typed images** — a typed `image` paragraph run and `doc.pictures`.
- **Slide text** — `slide.slideText`.
- **Namespace declarations** — `odfShared.ODF_PREFIXES` (frozen prefix to
  URI table), `odfShared.sourceNamespaces(sourcePkg, partPath)` and
  `odfShared.declareNamespaces(rootEl, opts?)`; `odfStyles.serialize`,
  `odfMeta.serialize` and `odfSettings.serialize` accept `(model, opts?)`
  with `opts.namespaces`; `writeSidecars` forwards the source parts'
  declarations.

### Changed

- **API reference and source comments describe each opt-in module by what it
  covers** — internal milestone labels are removed from the `extra/` module
  comments and the ODT guide.
- **Dist** — dist regenerated with the licence banner: every committed
  `dist/**/*.js` / `.min.js` opens with the row's `/*! … */` legal block
  (content from `docs/publication/license-matrix.json`), each `*.meta.json`
  `bytes` entry is measured on the final bytes, and the `builtAt` timestamp
  is gone — `bun run gen:bundles` is now byte-deterministic.
- **Documentation pass** — the README now follows the published-package
  skeleton (every `exports` key has a row in "Exposed sub-paths", identity
  values read from `package.json`) and states how `odt.read()` resolves
  styles; the Quick Start and the getting-started guide register
  `fw_require` (the former snippets omitted the `xml` module and failed to
  resolve `odt`); the guides open with their purpose and prerequisites; the
  package-local working notes and audit pages are no longer part of the
  package, and this changelog no longer cites them.
- **Package contents** — the npm tarball now ships `NOTICE` (dual licence +
  third-party attributions) next to `LICENSE`.
- **Shared-helper deduplication** — the `odfShared` and `odfWalker`
  factories (see Added) replaced ~210 LOC of duplicated boilerplate
  across `pkg/*` (mimetype constants, `parseXmlOrThrow`, namespaces,
  codec singletons), `meta/settings/styles`, the three `.odX`
  orchestrators, the three format walkers, `chart`/`math`, and
  `table/cell`+`table/row`; a second pass through `odfMiscHelper`/
  `odfTypedHelper` removed a further ~380 LOC across 5 misc extras
  (`textMisc`, `styleMisc`, `officeMisc`, `drawMisc`, `tableMisc`) and 7
  typed extras (`chartTyped`, `animationsSmil`, `dr3d3d`,
  `formsControls`, `textSectionsAdvanced`, `textTocIndex`,
  `drawImageExtended`). `database-sources.js` was refactored to a thin
  shell over `odfTypedHelper.buildTypedFamily(ELEMENTS, 'db:',
  'db-node', { passthrough: true })`. Public output APIs are unaffected —
  the factory *signatures* of the refactored modules changed
  (breaking for direct `factory(...)` callers, transparent for DI
  consumers registering via `runtime.register(...)`):

  | Module | Old signature | New signature |
  |---|---|---|
  | `pkgMimetype` | `factory(errors)` | `factory(errors, shared)` |
  | `pkgManifest` | `factory(errors, xml)` | `factory(errors, shared, xml)` |
  | `pkgPackage` | `factory(errors, zip, ...)` | `factory(errors, shared, zip, ...)` |
  | `odfMeta` / `odfSettings` / `odfStyles` | `factory(errors, xml)` | `factory(errors, shared, xml)` |
  | `tableCell` / `tableRow` | `factory(errors, xml)` | `factory(errors, shared, xml)` |
  | `chartChart` / `mathMath` | `factory(errors, xml)` | `factory(errors, shared, xml)` |
  | `odt` / `ods` / `odp` | `factory(errors, pkg, xml, ...)` | `factory(errors, shared, pkg, xml, ...)` |
  | `odtWalker` / `odsWalker` / `odpWalker` | `factory()` | `factory(odfWalker.factory())` |
  | `databaseSources` | `factory(xml)` | `factory(odfTypedHelper.factory(xml))` |

- **Worker-safe factories.** Every factory in the package was made
  serializable and usable in a Worker: module-level constants
  (`Set`/`Map`/regex/tables) and utility helpers previously declared
  outside a factory body and referenced from it were moved or inlined
  inside each consuming factory (36 files across the source tree).
  The helper modules (`src/_shared/index.js`, `src/extra/_misc-helper.js`,
  `src/extra/_typed-helper.js`) remain exported for their sibling tests, but
  their logic is duplicated inside every consuming factory; the error classes
  (`ParseError`/`RenderError`/`ContractError`/`OdfError`) stayed
  imported at module level to preserve the class identity expected by
  `expect(...).toThrow(ParseError)` in tests. No regression: 483 tests
  passed at the end of this pass.
- **Modular error handling.** `errors.js` no longer exports
  `OdfError`/`ParseError`/`RenderError`/`ContractError` at the top
  level — the classes are declared inside the `odfErrors` factory body,
  which returns `{ OdfError, ParseError, RenderError, ContractError,
  isOdfError }`. Every consumer that used the error classes now
  declares `'odfErrors'` as its first dependency and destructures the
  classes in its factory body (no more top-level `import {
  ParseError } from '../errors.js'`); as a side effect this fixed two
  latent bugs where `chart.js`/`math.js` referenced `ParseError`
  without importing it (see Fixed). The shared helpers (`odfShared`, in
  `src/_shared/index.js`) receive `odfErrors` by dependency injection
  (`factory(errors, xml)`), so every helper raises the same error classes
  as the module that calls it.
- **Bundles simplified to pure factories.** The six `*-large`/`*-full`
  descriptors (`odt-large`, `odt-full`, `ods-large`, `ods-full`,
  `odp-large`, `odp-full`) are now minimal fw descriptors `{ name,
  dependencies, factory }`: the factory retrieves the already-built
  core and extras and calls `core.use(...extras)`, returning the
  enriched core. Consumption: `runtime.resolve('odtLargeBundle')` after
  registering all core modules + extras (see Removed for the dropped
  imperative helpers).
- **Error codes by origin (breaking for `instanceof` consumers).**
  Every parse-error site moved from the single `'odf/parse-error'` code
  to `'odf/parse-error/<part>'` (`/odt`, `/ods`, `/odp`, `/manifest`,
  `/meta`, `/settings`, `/styles`, `/mimetype`, `/pkg`, `/chart`,
  `/math`, `/limit`); back-compat is preserved via
  `e.code.startsWith('odf/parse-error')`.
- **`ContractError` for API/contract violations.** `odt.write(null)`,
  `ods.write(null)`, `odp.write(null)`, `pkg.write({})` (no mimetype),
  `pkgMimetype.parse(<not Uint8Array>)`, `pkgMimetype.render('')` now
  raise `ContractError('odf/contract-error/<module>', …)` instead of
  `ParseError`. All still `instanceof OdfError`; a consumer relying on
  `instanceof ParseError` for these must switch to `OdfError` or
  `ContractError`. Sibling tests (`odt`/`ods`/`odp`/`pkg/package`/
  `pkg/mimetype`) and `tests/fuzz.test.js` were updated accordingly.
- **Performance.** `odtWalker`/`odsWalker`/`odpWalker` index their
  hooks by name instead of iterating every registered extension on
  each visit (index invalidated after each `use(...)`, rebuilt
  lazily). `TextEncoder`/`TextDecoder` moved to the singleton-backed
  codec in `odfShared` instead of per-call allocation.
- **Maintainability.** New `src/_shared/` folder mutualizing
  boilerplate across 11 modules (`index.js` hosting `odfShared`,
  `walker.js` hosting `odfWalker` — see above). `package.json`'s `files`
  array explicitly excludes `tmp/`/`**/tmp/**`. `package.json` gained
  `description`, `keywords`, `engines`, `sideEffects: false`;
  `awa.maturity` moved from `"L3"` to `"L4"`. It now declares
  `license` (`AGPL-3.0-only`), `author`, `repository`, `bugs` and
  `homepage`, `LICENSE` carries the AGPL-3.0 text and `NOTICE` the
  copyright and dual-licence statement.
- **Error context.** Every orchestrator `ParseError` (`odt`, `ods`,
  `odp` + `manifest`, `meta`, `settings`, `styles`, `pkg`, `mimetype`)
  now carries a `context: { part, module, ... }` (and `expected` for
  mimetype mismatches); `cause` is preserved as-is by
  `parseXmlOrThrow`.
- **`xml` dependency migration (internal, breaking).** The local
  `odfXml` module is gone (see Removed) — all ~25 consumer modules now
  declare `dependencies: ['xml', …]` and receive the `xml` factory from
  `@awacloud/fw/io/codec/xml.js` instead of the local clone. The 9 call
  sites that invoke `xml.parse(...)` on potentially malformed input
  (`pkgManifest`, `odfMeta`, `odfSettings`, `odfStyles`, `odt`, `ods`,
  `odp`) translate fw's `XmlParseError` into `ParseError` with a
  `cause`, preserving the public typed-error contract verified by fuzz
  tests. Consumers must register `@awacloud/fw/io/codec/xml.js` in their
  `ModuleRuntime` alongside the odf modules.
- **`odp.toText`** renders the slides' text (text-box frames, shapes and
  tables; notes opt-in) instead of the slide names.
- **`write()` round-trip.** `odt`, `ods` and `odp` `write()` re-emit the
  read sidecars and parts (see Fixed).
- **`read()` options.** `odt.read`, `ods.read` and `odp.read` take an
  optional second argument forwarded to `pkgPackage.read` (`maxParts`,
  `maxUncompressed`, `maxRatio`).
- **Image MIME type attribute.** `drawImage` writes the image MIME type as
  the ODF 1.4 `draw:mime-type` attribute (it read and wrote the LibreOffice
  extension `loext:mime-type`; both are still read).
- **Documentation** describes behaviour without maturity-stage tags and
  says what is preserved on a round-trip, including the `text:span`
  limitation.
- **Tests.** The dist freshness test now proves, in every mode, that its
  byte comparisons can run.
- **Span runs** gain `runs` (present only when the `<text:span>` has an
  element child: its children in document order — text, spacing, nested
  spans, links, and every other element as the raw node at its position)
  and `_extras.attrs` (every span attribute other than `text:style-name`).
  `value` is unchanged (the flattened character data); render emits `runs`
  when present. `toText` honours spacing inside spans.
- **Default archive entry cap** — `pkgPackage.DEFAULT_LIMITS.maxParts` is
  4096 (was 1024), for every ODF package read through `pkgPackage.read`
  (hence `odt` / `ods` / `odp` `read`): LibreOffice documents with many
  embedded objects carry a directory entry and several parts per object.
  `maxUncompressed` and `maxRatio` are unchanged; explicit limits still
  override through every facade.

### Removed

- Top-level error class exports (`OdfError`, `ParseError`,
  `RenderError`, `ContractError`) from `@awacloud/odf` / `@awacloud/odf/errors`.
  Migration: `const { ParseError } = runtime.resolve('odfErrors')` or
  `const { ParseError } = odfErrors.factory()`.
- `buildOdtLarge` / `buildOdtFull` / `buildOdsLarge` / `buildOdsFull` /
  `buildOdpLarge` / `buildOdpFull` imperative builder helpers.
  Migration: register `odtLargeBundle` (etc.) in a `ModuleRuntime` and
  `resolve(...)` it.
- Bundles no longer re-export extras individually. Migration: import
  directly from `@awacloud/odf/extra/<extra-name>`, or from `@awacloud/odf` (the
  main entry re-exports every extra).
- The local `odfXml` module (its parser source, ~240 LOC, and its
  test file) and its API page — superseded by
  `@awacloud/fw/io/codec/xml.js` (see Changed).
- The `KNOWN` `Set` in `src/meta/meta.js`, which had no discriminant
  effect; the surrounding comment now documents the delegation to the
  opt-in `metaExtended` module for the rest of the `meta:*`/`dc:*`
  vocabulary.
- **The generated `prebuilt` descriptor directory under `src/bundles/`**
  (18 descriptors) and its generator (`bun run gen:prebuilds`) — retired in
  favour of the two-surface `dist/build/` + `dist/standalone/`
  convention (see Added). The exported factory names and resolve keys
  are unchanged, only the on-disk location and generator moved
  (`tools/generate-bundles.mjs`/`bun run gen:bundles`).

### Fixed

- **Documentation links resolve from the npm tarball.** Links that pointed
  outside the package, or at files the tarball does not ship, now point at the
  public repository at this release's tag, so they resolve from the tarball.

- `chart.js` / `math.js` referenced `ParseError` without importing it
  — a latent bug fixed as a side effect of wiring `odfErrors` in as an
  explicit dependency (see Changed — Modular error handling).

- `write(read(x))` on `odt`, `ods` and `odp` no longer drops unmodelled
  parts and named styles: every part of the read package that the
  writer does not regenerate (pictures, thumbnails, `Configurations2/`,
  embedded objects) is re-emitted byte-for-byte with the media type the
  source manifest declared, together with the manifest's directory
  entries, and `styles.xml`, `settings.xml` and `meta.xml` travel unless
  `opts.*` overrides them (the order is `opts.*`, then the read model's
  `doc.*`, then empty). A writer-supplied part (`odt` `doc.pictures`)
  wins over the carried copy, and deleting `doc.package` drops the
  carried material.

- `meta:generator` names `@awacloud/odf` on every `odt`, `ods` and `odp`
  write — a read document's previous generator is replaced — unless the
  caller passes an explicit `opts.meta.generator`.

- Every written XML part now declares each namespace prefix it uses: the
  image MIME type attribute, carried form controls and graphic styles, and
  third-party extension markup kept in `_extras` no longer produce
  undeclared prefixes; a prefix with no known or source declaration makes
  `write` throw `odf/render-error/namespace`. The chart and math
  sub-document writers (`bytesOf`) now declare their prefixes too.

- `odp.toText` / `slide.slideText` now include tables held by a frame or
  placed directly on the slide, and text boxes nested in groups.

- `odt.toText` (`textContent.bodyText`) now includes the text of text boxes
  anchored in paragraphs, headings, list items, table cells and at body
  level, after the line of the element that holds them.

- `textList` degrades to an unstyled list when the write context has no
  `listStyle` (and reads without numbering when it has no `listNumbering`)
  instead of throwing a `TypeError`.
- Paragraph and heading attributes other than the style name (`xml:id`,
  `text:class-names`, `text:cond-style-name`, `text:is-list-header`,
  extension attributes) survive a round-trip: they are kept in
  `_extras.attrs` and re-emitted, with their namespace prefixes declared;
  a heading's outline level is typed once (`outlineLevel`).
- Span markup survives a round-trip: spacing elements, nested spans with
  their own styles, links, fields and frames anchored inside a
  `<text:span>` keep their position instead of being flattened to the
  span's character data.
- A LibreOffice document with more than 1024 archive entries (many
  embedded objects) reads with the default limits.

### Security

- ZIP decompression is bounded: `pkgPackage.read(bytes, opts?)` rejects
  archives with more than 1024 entries (`maxParts`), more than 256 MiB
  of uncompressed content in total (`maxUncompressed`), or an entry whose
  compression ratio exceeds 200:1 (`maxRatio`), checked per entry before
  inflation; `0` disables a cap. A breach throws
  `ParseError('odf/parse-error/zip-bomb')` with `context.limit`, and the
  defaults are exposed, frozen, as `DEFAULT_LIMITS`.

- Added a dedicated XML-security section to
  `docs/guide/getting-started.md` documenting that XXE and
  billion-laughs attacks are not applicable: the fw parser skips
  `<!DOCTYPE>` and limits the entity table to the 5 standard XML
  entities plus validated code points.
