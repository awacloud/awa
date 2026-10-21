# Changelog

All notable changes to `@awacloud/oconv` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

See [`README.md`](./README.md) for the usage guide.

## [Unreleased]

## [1.1.0] - 2026-10-21

### Added

- **GFM task-list checkboxes reach docx, odt and markdown.** The md
  reader carries a task item's `[ ]` / `[x]` in `listItem.escapes.md`
  (`{ task: 'unchecked' }` / `{ task: 'checked' }`) instead of dropping
  it. `fromMd` to docx or odt writes it as a leading `☐ ` / `☒ ` run of
  the item's first paragraph; the markdown writer writes `[ ]` / `[x]`
  back. The pdf writer draws the glyph when the regular face covers it:
  the pdf measurer gains `covers(text, style)`, which says whether a
  style's face draws every character of a string.
- **PNG images in pdf.** `fromMd` / `convert` to pdf place PNG images,
  where they were refused: a colour type 0 or 2 PNG embeds its `IDAT`
  stream as `/FlateDecode` behind a PNG predictor; a palette, alpha or
  colour-key PNG is decoded (the inflate bounded by the size its header
  declares, 64 MiB at most) into its colour samples and an `/SMask`. An
  interlaced or malformed PNG is still refused (`layout/image-dropped`,
  `format: 'png'`). `oconvIrToPdf` gains fw `zlib` as an optional
  dependency (`standard14Lookup`, below, comes after it); a hand-wired
  factory call without it refuses the decoded PNG kinds as before.
  **Release note**: a PNG that used to be refused with
  `layout/image-dropped` is now drawn, so that record leaves the ledger
  and the pdf bytes of such a document change.
- **Code blocks, quotes and rules in odt.** `fromMd` / `convert` to odt
  write a code block as `Preformatted Text` paragraphs, one per line,
  its indentation kept as `text:s` spaces; a quote's paragraphs as
  `Quotations` paragraphs; a thematic break as an empty `Horizontal Line`
  paragraph — LibreOffice's own style names, added to the fixed styles
  part. The `block/degraded` (`codeBlock`, `blockquote`) and
  `block/dropped` (`hr`) losses are no longer recorded on this target;
  what odt cannot nest records `block/degraded` `blockquote:nested` or
  `blockquote-child:<kind>`. `toMd` / `convert` from odt read
  consecutive `Preformatted Text` paragraphs as one fenced code block,
  consecutive `Quotations` paragraphs as one blockquote and an empty
  `Horizontal Line` paragraph as a thematic break (also through an
  automatic style's parent), where they read as plain paragraphs.
  **Release note**: a ledger consumer that matched the retired records no
  longer sees them, and the `.odt` bytes of a document with a code
  block, a quote or a rule change.
- **Images keep their own size and their alt text in docx and odt.**
  `fromMd` / `convert` to docx and odt place an image at the size its
  header gives — PNG (`pHYs` resolution), JPEG (JFIF density) or GIF, 96
  dpi when the file states none, scaled down to fit 6 in × 8 in — and
  write its alt text as the docx picture description or the odt frame
  title, both read back as the alt. `image/size-defaulted` is now
  recorded only for a header that gives no size (the default box is
  kept for it). **Release note**: every placed image used to sit in the
  default box and record `image/size-defaulted`; the record now marks the
  exception, and the size of every image in a `.docx` or `.odt` written
  by `fromMd` or `convert` changes.
- **Code blocks, quotes and rules in docx.** `fromMd` / `convert` to docx
  write a code block as one `SourceCode` paragraph (Courier New, a line
  break between source lines), a quote's paragraphs as `BlockText`
  paragraphs and a thematic break as an empty `HorizontalRule` paragraph
  with a bottom border; the three styles join the fixed styles part. The
  `block/degraded` (`codeBlock`, `blockquote`) and `block/dropped` (`hr`)
  losses are no longer recorded on this target; what docx cannot nest
  records `block/degraded` `blockquote:nested` or
  `blockquote-child:<kind>`. A code block's info string is not written.
  **Release note**: a ledger consumer that matched the retired records no
  longer sees them, and the `.docx` bytes of a document with a code
  block, a quote or a rule change.
- **docx code blocks, quotes and rules are read.** `toMd` / `convert`
  from docx read a paragraph styled `Source Code` as a fenced code block
  (line breaks and tabs kept), consecutive paragraphs styled `Block Text`,
  `Quote` or `Intense Quote` as one blockquote, and an empty `Horizontal
  Rule` paragraph as a thematic break — by the style's built-in name,
  else by its ID, so pandoc's docx output resolves too. Such paragraphs
  used to read as plain paragraphs.
- **odt images reach the IR.** An image frame of an `.odt` source (read
  with `@awacloud/odf`'s `framesInRuns`, as `oconv` does) becomes an IR
  `image` at its place: `name` = the frame's `draw:name`, else the picture
  path's basename; `alt` = its title, else its description; the picture
  part's bytes travel in the new `escapes.odt` (`{ bytes, contentType }`).
  Every writer reads them after `escapes.docx`, so `toMd` lists the image
  as an asset and `convert` from odt places it in docx, odt and pdf, where
  it used to record `image/unresolved`. A missing or external picture part
  records `image/bytes-unavailable` (the reference is kept); an image
  inside a link records `inline/dropped` (detail `link-target`). Text-box
  and object frames still record `image/unresolved`.

### Changed

- **Standard 14 font dictionaries carry their metrics.** PDF 2.0
  requires `FirstChar`, `LastChar`, `Widths` and `FontDescriptor` in
  every simple font dictionary; the pdf target's Standard 14 route now
  registers its faces with `@awacloud/pdf`'s opt-in `standard14` metrics
  (`oconvIrToPdf` gains `standard14Lookup` as its last, optional
  dependency; a hand-wired call without it writes the bare
  dictionaries). Every Standard 14 `.pdf` output gains these keys and
  one font descriptor per face. **Release note**: the bytes of every
  `.pdf` that uses a Standard 14 face change; a stored hash of such an
  output is re-baselined.
- **`.pdf` output carries an `/ID`.** PDF 2.0 requires the trailer
  `/ID`, which the pdf target never wrote; `@awacloud/pdf`'s writer now
  derives it from the written bytes, so every `fromMd` and `convert`
  `.pdf` output gains it and stays byte-reproducible. **Release note**:
  the bytes of every `.pdf` output change.
- **`.odt` output is byte-reproducible.** Every zip entry of an `.odt`
  written by `fromMd` or by `convert` (`docx → odt`) now carries the fixed
  date 1980-01-01 00:00 that `@awacloud/odf` stamps, where it carried the
  time of the write; two identical calls give identical bytes, as the
  `.docx` and `.pdf` targets already did. **Release note**: the bytes of
  every `.odt` output change (the entry dates); a stored hash of an
  `.odt` output is re-baselined once.
- **`list/task-marker-dropped` is recorded by the writers, not the md
  reader.** `fromMd` to docx and odt no longer records it. On pdf the
  Standard 14 faces and the Liberation pack have no ☐ / ☒ glyph, so the
  list renderer records it once per task item (with the block's `index`
  and `kind`, after the reader's losses); every writer records it for a
  task item whose first block is not a paragraph. **Release note**: a
  ledger consumer that matched `list/task-marker-dropped` on a docx or
  odt output no longer sees it; on pdf it still does, after the reader's
  losses.

### Fixed

- **pdf → Markdown reads fonts whose `/Encoding` is indirect.** A
  simple font whose `/Encoding` (or the `/Differences` /
  `/BaseEncoding` inside it) is an indirect reference — what pdfLaTeX
  writes on every Type 1 font, so most arXiv papers — failed to build a
  decoder: every string shown in it was counted undecodable and the
  font recorded as `text/font-unresolved`, so `toMd` returned almost no
  text for such documents. The reader now resolves these references
  before reading the encoding; such documents gain their text.
- **Image assets keyed by the destination as written.** `fromMd` looked
  `assets` up by the destination as the Markdown reader normalises it, so
  a destination in angle brackets or with a non-ASCII character
  (`![A](<my diagram.png>)`, `![A](café.png)`) missed the key the
  documentation names (`my diagram.png`, `café.png`) and the image was
  dropped — in particular every docx picture whose name holds a space,
  written back by `toMd` as `<Grafik 1>`. After an exact miss the docx,
  odt and pdf writers now look the percent-decoded name up; a key that
  matched before still wins.
- **No spurious line overflow in pdf.** The md → pdf typesetter compared a
  line's width to its column strictly, so a token measured equal to its
  column within floating-point noise (a table header cell such as
  "Center": 34.837 against 34.83699999999999) recorded a
  `layout/line-overflow` and could wrap a fitting word. A line now fits
  within 1e-6 pt of its column; a real overflow is recorded as before.
- **Table header cells keep each run's face in pdf.** A header cell was
  drawn in one class, so a cell mixing italic and roman runs lost its
  italics and inline code its monospace face. Each run is now bold, bold
  italic, or monospace as it should be. `oconvPdfLinebreak.tokenize` /
  `breakInlines` accept a function as `styleOverride` (one class per run)
  besides the string form.
- **An empty fenced code block is accounted.** Its renderer returns an
  explicit `height: 0`, which declares the block empty, so
  `oconvPdfStack.unaccounted` no longer reports a document made of one
  empty fence; a renderer that returns nothing without stating a height
  is still reported.
- **A refused image names its format.** `layout/image-dropped` now
  carries `format` for a GIF, WebP, BMP, TIFF or a refused (CMYK) JPEG,
  from the signature, and failing that from the content type a reader
  carried with the bytes (`image/gif` → `gif`); it was missing for every
  refusal but a PNG of colour type 0 or 2.
- **odt frames inside links are recorded.** `oconv` now reads `.odt` with
  `@awacloud/odf`'s `framesInRuns` option, and `odtToIr` maps a `frame` run
  like the raw frame it replaces (`image/unresolved`, a span frame's text
  kept; an image frame is read into the IR, above). A frame inside a link —
  silently dropped before — is now recorded: an image frame as
  `inline/dropped` (detail `link-target`), any other frame as
  `image/unresolved`; frame losses follow document order. A result read
  without the option maps as before.
- **A link's fields and references keep their text.** `odtToIr` ignored a
  link run's own untyped children (a field, a reference or a bookmark inside
  a `<text:a>`), so their text vanished with no loss recorded. They now
  follow the span field-text rule — the text kept as a run carrying the
  link (`inline/flattened`), an empty element recorded `inline/dropped`.
- **Hard line breaks reach markdown.** `toMd` wrote a line break of the
  source (an odt `text:line-break`, a `\n` in an IR run) as a bare newline,
  a CommonMark soft break that renders as a space, with no loss recorded. A
  paragraph now writes a hard break (a backslash at the end of the line); a
  heading or a table cell, which cannot hold one, writes a space and records
  `inline/linebreak-degraded`.
- **Markdown block quotes end cleanly.** `toMd` no longer ends a block
  quote with a bare `>` line (an `@awacloud/md` `renderMarkdown` fix); the
  next block follows after a blank line. Same document once parsed.

## [1.0.0] - 2026-10-07

### Added

- **Versioned pivot IR (`oconv-ir/v1`)** and its helpers — the readers
  produce, and the writers consume, this single intermediate
  representation. `oconvIr.node` / `oconvIr.doc` build nodes with their
  frozen defaults, and `oconvIr.validate` never throws: it returns
  `{ ok, errors }`, each error carrying a stable code (`unknown-kind`,
  `not-an-object`, `bad-prop`, `bad-children`, `unexpected-children`,
  `bad-child`, `bad-escapes`).
- **`toMd`** — convert a `.docx`, `.odt`, `.xlsx`, `.ods`, `.pptx`, `.odp`
  or `.pdf` document to the structured-markdown profile, returning
  rendered CommonMark/GFM, a section anchor index, a deduplicated asset
  manifest and a machine-readable loss ledger (`{ code, detail }` records,
  reader losses then writer losses, document order). Format detection
  falls back to the file name extension when not given explicitly, and
  `pptx`/`odp` sources accept an opt-in `includeNotes` flag rendering
  speaker notes as a trailing blockquote per slide.
- **`formOpBudget` option** — `oconvPdfTextExtract.extractPage`
  and `oconvPdfToIr.pdfToIr` take an optional `opts.formOpBudget`, and
  `oconv.toMd` a top-level `formOpBudget` input field (`pdf` source only),
  making the per-page Form XObject operator budget configurable. Default
  `1000000`; a supplied value must satisfy
  `Number.isSafeInteger(v) && v >= 1`, else `oconv: bad form op budget`;
  supplying it for a non-pdf `toMd` source throws
  `oconv: form op budget needs format pdf`. The default and the
  `xobject/form-budget` loss semantics are unchanged.
- **`fromMd`** — convert a structured-markdown or plain CommonMark/GFM
  document to `.docx`, `.odt` or `.pdf`, target resolved explicitly or
  from the output file name extension. The `.pdf` target accepts a bounded
  typesetter option block (`opts.pdf`: page size, margins, base type size,
  leading, heading scale, code size, page numbers, per-face font programs)
  and JPEG image placement from a caller-supplied `assets` map keyed by
  the markdown image destination. A leading front-matter fence is stripped
  and recorded as a `frontmatter/stripped` loss rather than parsed or
  carried into the target.
- **md→docx emits `word/styles.xml` and bordered tables.** Every `.docx`
  written by `fromMd` (and by `convert`'s `→ docx` target) carries a fixed
  built-in styles part — `Normal`, `Heading1`–`Heading6` (bold, sized) and
  `TableGrid` — so every referenced paragraph style is defined, and every
  table carries the `TableGrid` style reference plus direct single borders.
  The set is fixed and caller-invisible: no option, no loss code, `hr` stays
  `block/dropped`, and tier 3 (caller styling) is not promised.
- **md→odt emits `styles.xml`, named headings and bordered tables.** Every
  `.odt` written by `fromMd` (and by `convert`'s `→ odt` target) carries a
  fixed built-in styles part — `Standard`, `Text body`, `Heading` and
  `Heading 1`–`Heading 6` (bold, sized 16/14/13/12/11/11 pt, the same sizes
  as the docx target) — every heading names its `Heading_20_<level>` style,
  every table is written with `grid: true` (bordered cells and a
  margins-aligned table synthesised by `@awacloud/odf`), and list levels
  carry the label-alignment geometry. The set is fixed and caller-invisible:
  no option, no loss code, and tier 3 (caller styling) is not promised.
- **`convert`** — direct cross-format conversion for the allowlisted pairs
  `docx→odt`, `odt→docx`, `docx→pdf` and `odt→pdf`, composing the same
  reader and writer pipeline as `toMd`/`fromMd` back to back without an
  intermediate markdown round-trip.
- **Optional default-face tier** for the `.pdf` writer — registering an
  fw module named `oconvDefaultFaces` at a version above the package's
  built-in `0.0.0` stand-in (for example the `@awacloud/oconv-fonts` pack)
  supplies default fonts for the typesetter with no dependency on any face
  package; when no such module is registered, the typesetter falls back to
  its Standard 14 metrics.
- **Worker entry** (`./src/worker.js`) running the same conversions inside
  a dedicated `Worker` thread, one conversion per message: a `toMd`
  message (`{ id, name, bytes, at }`), a `fromMd` message (`{ id, name,
  markdown, target, opts, assets, defaultFaces }`) and a `convert` message
  (`{ id, name, bytes, format, target, includeNotes, opts, defaultFaces }`)
  are distinguished automatically from the payload shape. Errors come back
  as data (`error` a string, not thrown across the worker boundary).
- **Worker entry sub-path export** — the Worker entry is importable as
  `@awacloud/oconv/src/worker.js`, resolving to the same file under an
  `exports`-aware resolver and under a browser import map whose
  `@awacloud/oconv/` prefix points at the package root.
- **fw module manifest** (`fw_require`, `pkg_require`, `modules`, plus the
  empty `extras` and `bundle`) composing the readers, writers and facade
  with `@awacloud/ooxml`, `@awacloud/odf`, `@awacloud/md`, `@awacloud/pdf`
  and `@awacloud/fonts`, so a consumer registers this package's whole
  dependency graph in its own fw `ModuleRuntime` by registering
  `fw_require` and `modules`.
- **Two `.pdf` writer loss codes** — `inline/strike-dropped` and
  `inline/code-emphasis-dropped`. The typesetter draws no strikethrough
  rule and keeps one style class per run, so a struck run, or a bold or
  italic code run, was drawn plain with no record. The line breaker now
  records each, one record per text block with `detail` `{ runs, text }`;
  the drawn page bytes are unchanged (recorded, not rendered).
- **`heading/subtitle-degraded`** — a new `docx → md` loss code: a
  paragraph styled `Subtitle` is kept as a plain paragraph, and the
  record's `detail` is its style ID.
- **Worker replies carry `losses`.** The `toMd`, `fromMd` and `convert`
  replies gain a `losses` key, the facade's `{ code, detail }` ledger
  verbatim (`[]` on error); `warnings` stays its length. Additive: the
  request envelopes and every existing reply key are unchanged.
- **Apache POI licence files beside the fixtures.** The Apache POI
  `NOTICE` and the Apache-2.0 licence text now sit under
  `tests/_fixtures/corpus/`, next to the vendored `.docx`, `.xlsx` and
  `.pptx` test documents they cover.
- **`inline/flattened`** — a new `odt → md` loss code: an element inside
  a text span (a field or a cross-reference, for example) whose text is
  kept but whose meaning is not; `detail` names the element.

### Changed

- **md → odt and docx → odt place images.** The `.odt` writer now writes
  every image whose bytes are reachable (the caller's `assets` map, else the
  bytes the docx reader carried) as a `Pictures/` part in a 2 in × 1.5 in
  (5.08 cm × 3.81 cm) inline frame and records `image/size-defaulted`, as
  the `.docx` writer does; it used to drop them. An image with no reachable
  bytes is still dropped and recorded as `image/dropped`. Read back through
  `toMd`, the written frame comes back as `image/unresolved` (detail
  `draw:frame`).
- **The `.docx` output is byte-reproducible, and tests pin it.** The `docx`
  target of `fromMd` and the `odt → docx` pair of `convert` give
  byte-identical output for the same input: `@awacloud/ooxml` stamps every
  zip entry with the fixed 1980-01-01 00:00 timestamp. The `odt` target and
  `docx → odt` are still not byte-reproducible (the ODF package writer
  stamps the current time).
- **Loss matrix re-measured.** It documents the `docx` target and
  `odt → docx` as byte-reproducible (the `odt` target stays not), the image
  placement of md → odt and docx → odt (default 2 in × 1.5 in frame,
  `image/size-defaulted`), the re-measured `pdf → md` residual on three
  third-party PDFs (truncated content streams, no inflate failure left), and
  the Latin-only line breaking of md → pdf; internal labels are replaced by
  plain wording.

- **Documentation pass.** The README follows the published-package layout
  (Installation, Quick Start, package-specific sections, Exposed sub-paths,
  Maturity, Licence, Project) and its browser import map now lists every
  package the converter loads; a getting-started guide
  (`docs/guide/getting-started.md`) is added; internal tracking references
  are removed from the README, this changelog and the API pages; the API
  pages' writer examples build their IR with `oconvIr.node` /
  `oconvIr.doc` and were re-executed against the live package.
- **Plain-terms documentation.** Source documentation and reference pages
  state each rule in plain terms (internal design and decision labels
  removed).

### Fixed

- **The npm package ships `NOTICE`.**
- **`modules` is dependency-closed.** `@awacloud/md`'s `modules` carries
  `mdHtmlDocument`, which depends on four of md's opt-in `extras`
  (`mdToc`, `mdFrontmatter`, `mdFootnotes`, `mdAdmonitions`), so resolving
  it through oconv's manifest threw `Module not found: mdToc`. `modules`
  now spreads md's `extras` right after md's `modules`; the separate
  `mdFrontmatter` entry moved into that spread, and no descriptor name is
  listed twice.
- **md→docx table cells are padded.** Cell text touched the grid lines in
  Word: the fixed `TableGrid` style carried borders but no cell margins.
  The style and every table's direct `tblPr` carry Word's built-in
  `Table Grid` padding, 108 twips (0.19 cm) left and right, through the
  typed `tblPr.cellMargins` of `@awacloud/ooxml` (never `_extras`). No
  option, no loss code.
- **md→docx bullet glyph.** The generated `word/numbering.xml` no longer
  pins the `Symbol` font on bullet levels: every level writes the plain
  Unicode bullet U+2022 with no `rPr`, so the bullet no longer renders as
  a missing-glyph box in viewers lacking the symbol font. Numbered lists
  are unchanged.
- **`toMd` paragraphs that start a line with a block marker.** Through
  `@awacloud/md`'s Markdown renderer, a paragraph line starting with `1.`,
  `1)`, `-`, `+`, `*`, `#`..`######` or `>` is escaped (`1\. Step One`,
  `\# Ligne FACT`), so the Markdown re-parses as the same paragraph instead
  of a list, heading or quote.
- **`pdf → md` word spacing** — text pieces drawn separately on one line
  (one word per `Tj`, table cells, list markers) no longer come back glued
  together. The reader places the end of every text piece from the font's
  glyph widths (`/Widths`, a composite font's `/W` + `/DW`, or the
  Standard 14 AFM metrics), following the text state (`Tc`, `Tw`, `Tz`,
  `TJ` adjustments, `'` and `"`), and inserts one space where the gap to
  the next piece on the line exceeds 0.15 em. An existing space is never
  doubled, including across a `TJ` kern gap. Positioned text items gain an
  additive `xEnd` field; a font whose widths cannot be read records the
  loss code `text/width-approximated`.
- **`pdf → md` word spaces inside one `TJ` array.** A `TJ` position
  adjustment reads as a word space when it moves the text right by more
  than 0.15 em — the same threshold the line pass uses between two pieces —
  instead of only at 0.2 em or more. Justified lines whose inter-word kerns
  shrink to about 0.166 em no longer come back glued. An existing space is
  still never doubled.
- **`pdf → md` overlapping or duplicate text pieces.** A text piece that
  exactly repeats the previous piece of its line (same text, within 0.5 pt
  horizontally and vertically — a shadowed diagram label, a dot drawn
  twice) is kept once instead of being glued to its copy
  (`Contrôler les autorisationsContrôler les autorisations`). Any other
  piece that starts left of the previous piece's end by more than 0.15 em
  is separated from it by one space instead of glued; a smaller overlap (a
  kerned apostrophe) still joins.
- **`pdf → md` text inside Form XObjects** — text drawn inside a Form
  XObject (diagram labels, chart axes, reused page furniture) is extracted
  instead of dropped. The reader executes the form in place, under its
  `/Matrix` and its own `/Resources` (the page's when it has none), nested
  forms included; images inside a form still record `image/dropped`.
  `xobject/form-dropped` is recorded only for a form whose stream cannot be
  used, with the reason in its detail. Three loss codes keep the walk
  finite, and none of them throws: `xobject/form-cycle` (a form drawn from
  inside itself), `xobject/form-depth` (nesting deeper than 12 forms) and
  `xobject/form-budget` (more than 1,000,000 operators run inside forms on
  one page, configurable through `formOpBudget`).
- **Documentation links resolve from the npm tarball.** Links that pointed
  outside the package point at the public repository at this release's
  tag, so they resolve from the tarball.
- **README maturity statement** — it said `L1`; the package is `L3`.
- **Accents on the Standard 14 route round-trip.** The default `.pdf` route
  wrote CP1252 bytes but its font dictionaries named no encoding, so a
  reader decoded every byte from 0x80 up (accented letters, the em dash,
  the bullet markers) against the font's built-in encoding and lost or
  garbled it (`Café` read back `CafØ`). Every Standard 14 font dictionary
  now names `/Encoding /WinAnsiEncoding`, and the characters written are
  the characters read back.
- **One numbering instance per list in the `.docx` writer.** Every
  top-level list now gets its own `numId`, so two adjacent lists of the same
  kind stay two lists on re-read instead of merging into one (this also
  holds for `odt → docx`). A nested list shares its parent's instance.
- **No empty paragraphs from the `.odt` writer.** A code block no longer
  writes a trailing empty paragraph, and a paragraph holding only an
  image the writer drops (no bytes reachable) no longer leaves an empty
  one. An empty paragraph collapses on the next Markdown parse, so
  `md → odt → md` is now a stable normal form on every golden fixture, not
  only `md-structural.md`.
- **`toMd` asset bytes.** The asset manifest's `bytes` field was never
  populated from a real document, because the writer read a key no reader
  fills. It now reads the docx reader's image bytes, carried by reference
  (never written into the front matter).
- **`content/undecodable` names its cause.** The record's `detail` was
  `stream <objNum>` and is now `stream <objNum>: <cause>`, the thrown
  error's message on one line, at most 160 characters.
- **Built-in heading names.** The docx reader resolved headings only from
  the style IDs `Heading1`–`Heading6`. It now also reads each style's
  built-in name from `styles.xml`, so a localized ID such as `Titre1` gives
  its level, and a `Title` paragraph becomes a level-1 heading. A document
  with no styles part keeps the ID rule alone.
- **The `.pdf` typesetter stage pages run as pasted.** Every example under
  `docs/api/write/pdf/` is a self-contained session that builds its IR with
  `oconvIr.node` / `oconvIr.doc` (every example IR validates) and prints the
  values its comments state; internal design labels are replaced by plain
  wording.
- **README and guides on reproducibility, odt images and `docx.write`.**
  They no longer deny that the `.docx` output is byte-reproducible (the
  `docx` target of `fromMd` and `odt → docx` are; the `odt` target and
  `docx → odt` are not). The README and the profile page say the `odt`
  target places images instead of dropping every one, and the
  `oconvIrToDocx` API page names the two explicit failures of `docx.write`
  (`docx/hyperlink-missing-rid`, `docx/numbering-missing`) instead of
  calling them silent drops.
- **`odt → md` keeps the markup inside a text span.** Spacing, tabs, line
  breaks, nested emphasis and links inside a `text:span` each come through;
  they used to be flattened into the span's plain text (`B`, three spaces,
  `C`, a tab, `D`, a line break and a bold `nb` came back as `BCDE nb F`).
  The text of a field inside a span is kept and recorded as
  `inline/flattened`; a text-box frame inside a span keeps its text and
  records `image/unresolved`.
