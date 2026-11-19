# Changelog

All notable changes to `@awacloud/oconv` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

See [`README.md`](./README.md) for the usage guide.

## [Unreleased]

## [2.0.0] - 2026-11-19

### Breaking

- **`convert`'s `layout` is on by default where a pair honours it.** An
  absent `layout` is `true` on `docx → odt` (the page, the paragraphs'
  alignment and breaks, the runs' values, the headers and footers, the
  page fields and the notes reach the odt) and `false` on every other
  pair. `layout: false` gives tier 2, the output of 1.x; `layout: true`
  on another pair still throws `oconv: layout needs docx to odt`. The
  worker forwards a convert message's `layout`, so a worker caller can
  turn it off.

- **The odt reader reads a `text:note` as the IR `note`.** It reads with
  `@awacloud/odf`'s `notes`, so `toMd` of an odt with notes, and odt →
  docx and → pdf, drop each note with `note/dropped` instead of running
  its citation and body into the paragraph (`inline/flattened` in 1.x).

- **The pdf reader is built on `@awacloud/pdf`'s `pdfFontDecoder` and
  `pdfPageText`; `oconvPdfFontDecoder` is gone.** oconv kept its own copy
  of pdf's font decoder (and of its page walk) since pdf gained them as
  extras; the copy leaves the manifest, and `modules` registers pdf's
  `pdfFontDecoder` and `pdfPageText` in its place. A composer that
  resolved `oconvPdfFontDecoder` resolves `pdfFontDecoder` (the same
  `buildDecoder` and `decodeShow`). `oconvPdfTextExtract` keeps its name
  and its output: it is `pdfPageText.extractPage` with its rules, image
  items and pictures built on the walk's `visit` hook, equal to the 1.x
  walk on every page of 1,706 corpus PDFs, with and without `rules`,
  `images` and `cellKerns`. `pkg_require` names `pdfFontDecoder` and
  `pdfPageText`, and no longer the pdf and fonts modules only the copy
  used (`pdfFont`, `pdfFontEncoding`, `pdfResources`, `pdfContentStream`,
  `cmapToUnicode`, `encodingLookup`, `encodingAgl`, `encodingTexMath`).

- **A document past 256 MiB of text throws `oconv: output too large` by
  default.** The output budget moves into `irToMd` (`opts.outputBudget`,
  `toMd` forwarding its own) and takes `{ bytes: 268435456, overflow:
  'throw' }` when absent, so `toMd`, the worker and every caller of the
  renderer, oview's copy among them, fail by name before any markdown is
  built, where 1.x rendered until it ran out of memory (a 110 KB xlsx whose
  cells share one 1 MB string reached 2.2 GB and a `RangeError`). A missing
  `bytes` takes 256 MiB, so `{ overflow: 'truncate' }` alone truncates
  there and `{}` is the default; `bytes: Number.MAX_SAFE_INTEGER` renders
  as 1.x did. Of 5,586 corpus documents, that xlsx is the one refused; the
  largest other output is 11.4 MB.

- **A sheet past 5,000,000 padded cells takes the sparse form by
  default.** `xlsxToIr` and `odsToIr` take `opts.cellBudget` 5,000,000
  when it is absent (ooxml's own `maxCellsPerSheet`), so `toMd`'s
  `sheetCellBudget`, `convert` and every caller of the readers do too: a
  sheet whose padded table would hold more cells is written one
  `<A1 address>: <text>` paragraph per value (its rows unpadded under
  `sheets` `'csv'` / `'tsv'`), recorded `sheet/sparse-form`, where 1.x
  padded it (one wide row in a long sheet made tens of millions of cells
  and tens of GB). `Number.MAX_SAFE_INTEGER` pads every sheet as 1.x did.
  No corpus spreadsheet changes: the widest of 787 pads to 1,010,025
  cells.

- **`toMd` opens an encrypted pdf with the empty password by default**
  (`@awacloud/pdf`'s default; RC4 files too, oconv passing
  `pdfLegacyRc4Read` to every pdf read). The conversion carries one
  `pdf/opened-with-empty-user-password` loss, its detail the permission
  bits, so it is `lossy`; a file the empty password does not open still
  throws `pdf/document/encrypted`. `pdfEmptyPassword: false` keeps the
  1.x refusal. On the corpus, 17 of 42 encrypted files convert this way,
  among them ISO 32000-1 itself.

- **`toMd` reads a pdf whose cross-reference chain is broken.**
  `@awacloud/pdf` rebuilds an unusable chain by default, so such a file
  converts with no `pdfRecoverXref`; `pdfRecoverXref: false` is now
  forwarded and reads strictly, the chain's error thrown as in 1.x.

- **An untagged pdf infers headings and tables by default.** `toMd` with
  no `pdfInfer` reads a pdf as `pdfInfer: ['headings', 'tables']`:
  headings from font size and weight, tables from rules or aligned text.
  Pass `pdfInfer: []` for the text-first read of 1.x. A tagged pdf is
  read through its structure tree as before. opendataloader-bench,
  default read: 0.5754 → 0.8370. On 2,422 corpus PDFs, 105 read
  differently (the untagged ones the inference changes), at +9.5 % of
  the pdf-to-IR time on those. The default sits in
  `oconvPdfToIr.pdfToIr` itself: an absent `opts.infer` reads as
  `['headings', 'tables']`, so a read chain composed without `toMd`
  (oview's copy, an app's own chain) infers as `toMd` does; `infer: []`
  is the text-first read.

### Changed

- **The TeXCMMaths fonts read as the signs they draw.** A simple font of
  the `TeXCMMathsSymbols`, `TeXCMMathsItalic` or `TeXCMMathsExtension`
  family names each glyph by a Computer Modern position, and its
  ToUnicode repeats the names: `=` was read as `¼`, `+` as `þ`, `(` and
  `)` as `ð` and `Þ`, the minus sign as U+FFFD, `/` as `=`. The decoder
  now reads those three families through `@awacloud/fonts`'
  `encodingTexMath` before the ToUnicode (the glyph name gives the
  position); every other font is read as before. The decoder depends on
  `encodingTexMath`, which `@awacloud/fonts`' manifest registers.

- **A table drawn with horizontal rules only reads as a table.** Under
  `'tables'`, a line between two horizontal rules that span it (one within
  1 em below its baseline, one within 2 em above) is cut into cells at a
  gap over 0.4 em instead of 0.8 em, so the tables oconv's own md → pdf
  writes (rules above and under every row, columns 0.55 em apart) come
  back as tables in md → pdf → md. No table of 2,422 corpus PDFs changes;
  opendataloader-bench holds at 0.8375.

- **The heading inference keeps labels, values and table rows out.** On
  an untagged pdf, a line the `'headings'` inference would make a heading
  stays a paragraph when it has more digits than letters (a leading
  section number set aside), ends with a space and a colon with no
  section number, is a short label ` : ` a numeric value, holds an email
  address, a URL or an amount with a currency, or is an address (two
  commas and a 4- or 5-digit number that is no year); and a bold line of
  three cells or more (a table's header row) is no bold heading. The
  Factur-X sample invoice reads 1 heading, not 11; opendataloader-bench 0.8370 →
  0.8375.

- **md → pdf takes a face without a `name` table.** With
  `@awacloud/fonts` reading such a font by default, a face posted in
  `opts.pdf.fonts` (or a default face) that has no `name` table embeds,
  its subset named `<prefix>+Font`, where 1.x threw `oconv: bad pdf font
  <style>`.

- **Breaking: the worker is `@awacloud/oconv/worker.js`, a bundle.**
  `src/worker.js` is now a self-contained build of the worker's
  source, `src/worker/entry.js` (`bun run gen:worker`): it imports
  nothing, so a static page starts it with no import map (a module worker
  has none). Its `exports` key is `./worker.js` → `./src/worker.js`, the
  `/vendor` identity rule (`@awacloud/oconv/<p>` → `src/<p>`); the 1.x
  key `./src/worker.js` is removed. The message protocol is unchanged.

- **Breaking: the pivot IR is `oconv-ir/v2`.** v2 is v1's 13 node kinds
  and props plus optional typed props for styles and page layout
  (tier 3): `document.page`; `align` and `breakBefore` on `paragraph` and
  `heading`; `size`, `font`, `color`, `underline` and `script` on `run`;
  the document's header and footer, `document.header` and
  `document.footer` (`null`, or the slots `default`, `first` and `even`,
  each an array of blocks, `first` and `even` `null` when not distinct);
  and one inline kind, `field` (`name` `'page'` or `'pages'`, `text` the
  value the source shows, and a run's formatting props) and one inline
  container, `note` (`class` `'footnote'` or `'endnote'`, `mark` a custom
  mark or `null`, its children the note's blocks), so `KINDS` has 15
  kinds. `withoutNotes` gives a tree without its notes, for a writer
  without notes. `withFieldsAsRuns`
  gives a tree's fields as plain runs, for a writer without fields. A node without them, as a v1 producer writes it,
  validates unchanged; `node()` gives each its default, so a reader's
  `document` node now carries `page: null, header: null, footer: null`, every `paragraph` and
  `heading` `align: null, breakBefore: false`, and every `run`
  `size: null, font: null, color: null, underline: false, script: null`.
  `IR_VERSION` and the `ir` key of `toMd`'s front matter now say
  `oconv-ir/v2`; `profile` stays `v1`. A consumer that compares either
  with `oconv-ir/v1` must accept v2.

### Added

- **Zapf Dingbats glyph names and the Standard 14 symbol fonts read as
  characters** (the pdf reader). A font whose family names Dingbats
  resolves its glyph names through the ITC Zapf Dingbats Glyph List
  (`a73` → `■`), and a non-embedded `Symbol` or `ZapfDingbats` font with
  no base in `/Encoding` takes its built-in encoding (`a24` → `✘`, not
  `8`). On 2,422 corpus PDFs (first 60 pages each), the undecodable
  codes fall from 3,017 to 2,744.

- **Symbol and Wingdings private-use text read as characters** (the pdf
  reader). A ToUnicode entry at 0xF020–0xF0FF in a `Symbol`, `SymbolMT`
  or `Wingdings` font is read again: Symbol's through `SymbolEncoding`
  and the AGL (U+F0B7 → `•`), Wingdings' for the pairs Word itself
  writes (U+F0A7 → `▪`, U+F0FC → `✓`). On 2,422 corpus PDFs (first 60
  pages each), the private-use characters fall from 50,675 to 438.

- **`pdfInfer: ['tables']` reads ruled tables drawn in segments.** Two
  touching segments of one rule line, such as a vertical cut at every row
  border, now make one line of the grid. A grid in which the aligned-text
  rule finds more rows than the grid has is left to that rule: it is a
  grid without rules between its body rows. opendataloader-bench layout:
  0.8313 → 0.8367, 3 documents up and none down. The default read is
  unchanged.

- **`pdfInfer: ['tables']` reads rows on several baselines and one long
  column.** On the lines no table holds, a region where the content order
  goes back up inside a row (cells drawn one by one, a cell centred
  against a two-line neighbour) is re-cut by baseline: baselines closer
  than 0.75 em are one row, and each cell is joined top down. Such a table
  needs 3 rows, one size and whole lines. With 3 columns or more, one
  column other than the first may hold cells of up to 120 characters.
  opendataloader-bench layout: 0.8239 → 0.8313, 4 documents up and none
  down. The default read is unchanged.

- **The pdf reader reads a symbolic font's built-in encoding.**
  `oconvPdfFontDecoder` (the copy of pdf's `pdfFontDecoder`) decodes a
  symbolic `Type1` or `MMType1` font through its embedded Type 1 or CFF
  program's built-in encoding when its `/Encoding` names no base (ISO
  32000-2 §9.6.6.1). Before, `StandardEncoding` was used. pdfLaTeX's
  Computer Modern text and math without `/ToUnicode` now converts to
  Markdown as text instead of wrong punctuation or `text/undecodable`
  losses.

- **`convert`'s opt-in `layout` carries the footnotes and endnotes on
  `docx → odt`.** With `layout: true`, a docx note reads as an IR `note`
  at its reference, holding the note's blocks, and the odt writer writes
  it as `text:note` (`@awacloud/odf`'s typed note run): its class, its
  number among its class's automatic notes or its custom mark, its body
  typed as the body is. A reference whose note did not read is recorded
  (`note/unresolved`); a note in a note's body is not written
  (`note/dropped`, detail `nested`). The md, docx and pdf writers write no
  note and record each (`note/dropped`, detail its class).

- **`convert`'s opt-in `layout` carries the headers and footers on
  `docx → odt`.** With `layout: true`, the docx's last section gives the
  odt's master page its header and footer: the default one, the first
  page's under `titlePg` and the even pages' under the settings'
  `evenAndOddHeaders` (`style:header`, `style:header-first`,
  `style:header-left`, and the footers'), read and written as the body
  is, their styles in `styles.xml` (`MP<n>`, `MT<n>`).
  - A `PAGE` field reads as a page number and is written as
    `text:page-number`; `NUMPAGES` and `SECTIONPAGES` as
    `text:page-count`. This holds in the body too, under `layout`.
  - Another field in a header or footer keeps the text it shows
    (`field/static`, once per name).
  - A reference whose part did not read is recorded
    (`layout/region-unresolved`).
  - The md, docx and pdf writers write a field as its text, and record a
    stated header or footer as `layout/region-dropped`.

- **`convert`'s opt-in `layout` carries the page on `docx → odt`.** With
  `layout: true`, the docx body's page size, orientation and margins
  reach the odt as its page layout (`document.page`, in points).
  - A document of several sections takes its last section's page
    (`layout/sections-merged`).
  - A gutter is dropped (`layout/gutter-dropped`).
  - A negative top or bottom margin is kept as its absolute value
    (`layout/margin-negative`).
  - A `layout` that is not a boolean throws `oconv: bad layout option`;
    on another pair, `oconv: layout needs docx to odt`.
  - The docx reader takes it as `docxInclude: ['layout']`.

  It also carries each paragraph's and heading's effective alignment (its
  `jc`, else up its style chain, else `docDefaults`) and its page breaks
  (`pageBreakBefore`, a break alone in or at the end of the paragraph
  before, one at its start), written as automatic paragraph styles. A
  `distribute` or kashida alignment reads as `justify`
  (`layout/align-approximated`); several breaks before one block are one
  (`layout/breaks-merged`); a break inside a paragraph stays a space
  (`layout/break-inside`); one that reaches a table, a code block, a
  quote, the end of a text box or of the document is dropped
  (`layout/break-dropped`).

  And each run's effective size, font, colour, underline and super- or
  subscript (its `rPr`, its character style's chain, its paragraph
  style's chain, `docDefaults`; a theme font read from the theme part),
  written as automatic text styles. A theme font the theme does not name
  is dropped (`layout/font-theme-unresolved`); another underline kind is
  written as single (`layout/underline-approximated`).

  Without the option the output is unchanged.

- **`pdfInclude: ['images']` places inline images and CMYK pictures.** An
  inline image (`BI … EI`) is read as an image XObject is, its colour
  space looked up in the resources when it is a name, and named after
  its bytes (`image-inline-<hash>`). Raw DeviceCMYK, ICCBased with `/N` 4
  and Indexed on them are converted to RGB without a profile. Over
  1,763 PDFs, the dropped pictures go from 3,847 to 159. The default
  read is unchanged.
- **`pdfInfer: ['tables']` reads a table row drawn as one `TJ`.** On an
  untagged document, a `TJ` array with 2 or more kerns of over 1 em
  between its strings is cut there into one piece per cell, so the
  aligned-text rule sees its columns (`oconvPdfTextExtract`'s new
  `opts.cellKerns`). On opendataloader-bench, read with `['headings',
  'tables']`: 0.8176 → 0.8239. The default read is unchanged.
- **`pdfInfer` finds more headings and fewer false ones.** Four rules, on
  the untagged path under the opt-in only:
  - a font named with URW's bold suffix (`-Medi`, `-MediItal`) is bold;
  - a figure or table caption (`Figure 3.`, `Table 2:` …) set in bold or
    larger stays a paragraph;
  - a title set at two heading sizes on one line (small caps) is one
    heading;
  - a table of contents (entries, then page numbers that do not
    decrease) stays text under `'tables'`.

  On opendataloader-bench, read with `['headings', 'tables']`: 0.7949 →
  0.8176. The default read is unchanged.
- **The text and pictures of a pptx group shape.** The pptx reader reads
  with `pptx.read`'s `typedGroups` and walks a group's shapes in place:
  their text, pictures and media are read as the slide's. Earlier releases
  dropped them without a loss (in the wild corpus, 620 paragraphs and 132
  pictures in 17 decks).
- **`opts.pdf.pdfUA` and `opts.pdf.lang`: md → pdf and docx / odt → pdf
  claiming PDF/UA-1 or PDF/UA-2.** The document is built with
  `pdfBuilder`'s `pdfUA` and its structure API: headings, paragraphs,
  quotes, lists (`L` / `LI` / `Lbl` / `LBody`), tables (`TH` scoped to its
  column), code blocks and pictures (`Figure` with the alt text) are
  tagged, every drawn item marked; rules and page numbers are artifacts.
  A picture without alt text is an artifact, recorded `image/decorative`.
  The title is the front matter's `title`, the source's, else the first
  heading's (`oconv: pdf/UA needs a title (front matter or a heading)`);
  every drawn style class needs an embedded face (`oconv: pdf/UA needs
  embedded faces (<classes>)`); `lang` is required with `pdfUA`, and
  `pdfUA` is refused with `pdfA` (`oconv: bad pdf option <key>`). With the
  default faces, veraPDF 1.30.3 judges the documents conforming. Without
  `pdfUA` the output is unchanged.
- **`opts.pdf.pdfA`: md → pdf and docx / odt → pdf claiming PDF/A-4 or
  PDF/A-2b.** The document is built with `pdfBuilder`'s `pdfA` (XMP
  metadata, an sRGB output intent, the profile's version) and every font
  embedded: each style class drawn needs an embedded face — the caller's
  `opts.pdf.fonts` or the registered default faces (`@awacloud/oconv-fonts`)
  — else `oconv: pdf/A needs embedded faces (<classes>)` before anything is
  written; another value is `oconv: bad pdf option pdfA`. With the default
  faces, veraPDF 1.30.3 judges the documents conforming. Without `pdfA`
  the output is unchanged.

### Fixed

- **A span whose style states no emphasis is no longer a loss** (the odt
  reader). A span with no emphasis flag recorded `run/format-unresolved`
  even when its style is defined and states none, a size, a font or a
  colour alone; the code now fires only for an undefined style, or one
  whose chain states an emphasis property. oconv's own docx → odt runs
  read back clean (60,591 such losses on the 1,469 wild docx converted by
  default, before).

- **A dropped note's custom mark is dropped with it** (the docx reader,
  without `layout`). The text that follows a footnote or endnote reference
  with `customMarkFollows` is the note's mark; it was kept as body text
  when the note was not read (a stray `*`, or an invisible Symbol-font
  character on a line of its own).

- **A ToUnicode entry of U+FFFD no longer hides a glyph name that
  reads.** The entry says the producer knew no character; the decoder now
  reads the code through the font's encoding instead, and keeps U+FFFD
  only when that reads nothing either. With `@awacloud/fonts`' fuller
  glyph-name reading, `one.SP` reads `1` where the text had U+FFFD.

- **A docx smart tag's text is written.** `docxToIr` reads a smart tag's
  runs in place (`@awacloud/ooxml` types it now), where they were dropped
  without a loss: 90 of 90 smart-tag words in the wild docx, from 48.

- **A pdf read's own losses reach the ledger.** `pdfToIr` puts
  the read document's records first in its ledger, read after the
  extraction: `pdf/document/xref-rebuilt`, `pdf/document/xref-tolerated`,
  `pdf/document/free-entry-fallback`, `pdf/document/free-object`,
  `pdf/document/reference-cycle`, and the empty password as
  `pdf/opened-with-empty-user-password` (moved here from `toMd`, so an
  app's own read chain records it too, once). A pdf read by a tolerance
  or a rebuild no longer converts as lossless: 54 of 2,422 corpus PDFs.

- **`Q` restores the text font.** The pdf page walk: `q` now saves the
  font in force, its size and the leading with the CTM, `Tc`, `Tw` and
  `Tz`, and `Q` brings them back (ISO 32000-2 §8.4.1). Text drawn after
  a `q … Tf … Q`, as after a list label in a bullet font, was decoded
  through the font set inside the `q`. On 2,422 corpus PDFs (first 60
  pages each), the undecodable codes fall from 14,410 to 3,017.

- **Text boxes are read from a docx, and a shape is no longer an
  image.** The docx reader dropped the content of every text box without
  a loss. Each `w:txbxContent` — in a run's VML (`w:pict`, `w:object`:
  the fallback of a Word 2010 shape, which the read takes, or VML alone)
  or in a Word 2010 shape, group or canvas drawing — is now read as body
  blocks after the paragraph that anchors it (after its list or quote
  when it is in one), a picture in it with its bytes. Such a drawing is
  not written as an image any more: one holding no text box records
  `inline/dropped` (detail `wps:wsp`, `wpg:wgp` or `wpc:wpc`) instead of
  an image reference with `image/bytes-unavailable`. In the real-world
  docx files of the test corpus, 191 hold 502 text boxes in their body (3,418 words, of which at most 413 reached the Markdown);
  3,340 do now, the rest being a word split across two runs, which the
  Markdown joins, smart-tag runs, which the body drops too, and one
  shape whose fallback differs from it. 189 files change output; the
  `oconvDocxToIr` module now depends on `docxStructure`.

## [1.2.0] - 2026-11-02

### Added

- **A docx table of contents, opt-in.** `oconvDocxToIr.docxToIr(read, {
  include: ['toc'] })` reads a table of contents control (`w:docPartObj`
  gallery `Table of Contents`) in place as one paragraph per entry, the
  text the document shows (page numbers included, links not), as the odt
  reader's `include: ['toc']`; the facade forwards `docxInclude` (another
  format: `oconv: docx include needs format docx`; a bad value: `oconv:
  bad docx include`). Without it nothing changes. Measured on the 1,491
  wild docx: the 28 `block/dropped` `toc` losses (27 files) go to 0 with
  the option, 26 files gaining their entries (the 27th's table of
  contents is a tracked deletion, which shows nothing); without it no
  output moves.
- **An ODT table of contents, opt-in.** `toMd`'s new `odtInclude` input
  (`odt` only; `oconvOdtToIr.odtToIr`'s `opts.include`): `['toc']` reads
  a table of contents' entries and title as paragraphs at its place, as
  the document shows them (page numbers kept, links not). Without it the
  table of contents is dropped as before (`block/dropped`). On the ODF
  1.4 specification ODTs the words missing against their HTML text fall
  from 357 / 16,214 / 5,212 (parts 2 / 3 / 4) to 42 / 1,306 / 2,995. New
  errors on the new input only: `oconv: bad odt include`,
  `oconv: odt include needs format odt`.
- **Inference on an untagged PDF, opt-in.** `toMd`'s new `pdfInfer`
  input (`pdf` only; `oconvPdfToIr.pdfToIr`'s `opts.infer`) turns on, by
  name, what the text-first read does not do on the untagged path:
  `['headings']` makes a short line set larger than the body text, or a
  short line set wholly in bold, a heading, its level ranked by size;
  `['tables']` reads a table drawn with rules (a grid of crossing lines)
  and a block of lines whose short pieces align in columns;
  `['running']` leaves out running headers and footers: on a PDF of 3
  pages or more, a line in the top or bottom 12 % of the page whose
  text, each run of digits read as `#`, recurs within 2 pt of one height
  on half the pages (and 3) is left out of every page, recorded by the
  new loss `text/running-dropped` (its pattern; pypdf-benchmarks: 0.9287
  → 0.9300). Without the input the read is unchanged (tier 1,
  text-first); a tagged PDF keeps its own structure. New errors on the
  new input only: `oconv: bad pdf infer`, `oconv: pdf infer needs format
  pdf`. The pdf font decoder and the extracted text pieces gain `bold`;
  the page extraction collects, on request (`opts.rules`), the page's
  rules (stroked straight segments, thin filled rectangles) as items
  `{ kind: 'rule', x0, y0, x1, y1 }`.
- **The untagged pdf structure declared, opt-in.** `toMd`'s new
  `pdfDeclare` input (`pdf` only; `oconvPdfToIr.pdfToIr`'s
  `opts.declare`): `['positional']` records one `struct/positional` loss
  when the untagged path built the structure from positioning (the detail
  names what: `paragraphs`, `headings`, `tables`). Without it, every
  result is unchanged. New errors on the new input only:
  `oconv: bad pdf declare`, `oconv: pdf declare needs format pdf`.
- **Pictures from a PDF, opt-in.** `toMd`'s new `pdfInclude` input (`pdf`
  only; `oconvPdfToIr.pdfToIr`'s `opts.include`, `oconvPdfTextExtract`'s
  `opts.images`): `['images']` places each JPEG or JPEG 2000 (JP2) image
  XObject, and each DeviceGray, DeviceRGB, ICCBased or Indexed raw-pixel
  one written as a PNG by the new `oconvPdfImagePng` (1–16 bits, a
  same-size soft mask or a colour-key mask as alpha, the ICC profile in
  `iCCP`), a page's or a form's, as an IR `image` where it is drawn (on a
  tagged PDF, with the struct element that lists it), its bytes in
  `escapes.pdf` and in `toMd`'s `assets`; a mask not applied is recorded
  as the new `image/mask-dropped`; every other picture keeps
  `image/dropped`. The default read is unchanged. The docx, odt, md and
  pdf writers read `escapes.pdf` after `escapes.docx` and `escapes.odt`.
  New errors on the new input only: `oconv: bad pdf include`,
  `oconv: pdf include needs format pdf`.
- **Line-end hyphens in a PDF, opt-in.** `toMd` takes `pdfLineHyphens`
  (`pdf` only; `oconvPdfToIr.pdfToIr`'s `opts.lineHyphens`): `'drop'`
  joins a word a hyphen cuts at a line end without the hyphen
  (`information`), `'keep'` with it (`infor-mation`); by default it stays
  `infor- mation`, which opendataloader-bench's ground truth prefers. New
  errors on the new input only: `oconv: bad pdf line hyphens`,
  `oconv: pdf line hyphens needs format pdf`.
- **Encrypted and damaged PDFs, opt-in.** `toMd` takes `pdfPassword` (a
  string or bytes, the user or owner password, `''` for an empty user
  password) and `pdfRecoverXref` (`true` rebuilds an unusable
  cross-reference chain), both `pdf` only and forwarded to `pdf.read`,
  which already supported them; an encrypted PDF could not be converted
  before. With a password, oconv also passes pdf's read-only
  `pdfLegacyRc4Read` (the `legacyRc4` read option), so an RC4-encrypted
  PDF (V1 / V2, 40- or 128-bit) opens as well; oconv now composes that
  module (`@awacloud/pdf/extra/legacy-rc4-read.js`). New errors on the
  new inputs only: `oconv: pdf password needs format pdf`,
  `oconv: pdf recover xref needs format pdf`,
  `oconv: bad pdf recover xref`. Without `pdfPassword` an encrypted PDF
  still throws `pdf/document/encrypted`; without either input the read is
  unchanged.
- **Spreadsheet sheets as CSV or TSV, opt-in.** `toMd`'s new `sheets`
  input (`xlsx` and `ods`; the readers' `opts.sheets`): `'csv'` or `'tsv'`
  writes each sheet as one fenced `csv` / `tsv` block under its heading
  instead of a GFM table (RFC 4180 quoting; tsv escapes recorded as the new
  `sheet/tsv-escaped`). `'table'`, the default, leaves every result
  unchanged. New errors on the new input only: `oconv: bad sheets`,
  `oconv: sheets needs format xlsx or ods`.
- **A cell budget for wide sheets, opt-in.** `toMd` takes
  `sheetCellBudget` (`xlsx` / `ods` only; the readers'
  `opts.cellBudget`): a sheet whose padded table would hold more cells
  — one very wide row pads every other row to its width — is written
  unpadded instead, one `<A1 address>: <text>` paragraph per value (its
  rows unpadded under `sheets` `'csv'` / `'tsv'`), recorded by the new
  loss `sheet/sparse-form`; every value is kept and the memory follows
  the values, not the padding. Without the input no budget applies and
  every sheet is padded as before. New errors on the new input only:
  `oconv: bad cell budget`, `oconv: sheet cell budget needs format xlsx
  or ods`.
- **Archive limits per call, opt-in.** `toMd` takes `archiveLimits`
  (office sources only): `{ maxParts, maxUncompressed, maxRatio,
  maxDepth }`, any of them, passed to the docx, xlsx, pptx, odt, ods or
  odp reader, so a caller can read a large deck or a workbook that
  inflates past the readers' defaults; the ODF readers take the first
  three. Without the input each reader keeps its own defaults. New errors
  on the new input only: `oconv: bad archive limits`,
  `oconv: archive limits need an office source`.
- **An output budget, opt-in.** `toMd` takes `outputBudget: { bytes,
  overflow }` (every source): after the read and before the render, the
  UTF-8 size of the IR's text is compared with `bytes`, with an early
  stop, so a caller can refuse, or cut, a small file that expands to
  gigabytes of text before the render runs out of memory. Past the
  budget, `overflow` `'throw'` (when absent) throws `oconv: output too
  large`; `'truncate'` keeps the top-level blocks and a crossing table's
  leading rows that fit, recorded by the new loss `doc/truncated`.
  Without the input no budget applies and the output is unchanged. New
  error on the new input only: `oconv: bad output budget`.
- **A compact front matter, opt-in.** `toMd`'s `opts` (forwarded to
  `irToMd`) takes `frontMatter`: `'compact'` writes the loss ledger with
  one entry per distinct `(code, detail)` and its `count`; `'none'`
  writes the body alone. The default (`'full'`) is unchanged. New error
  on the new option only: `oconv: bad front matter`.

### Changed

- **`toMd` states the source's own title in the front matter.** When a
  source states a non-empty title, `toMd` writes `title:` right after
  `sourceName`, trimmed: for a pdf its XMP `dc:title` (`x-default`
  first), else its Info `/Title`, decoded (`pdfInfo.decodeTextString`,
  `pdfXmpExtended.dcTitle` and `pdfFilterDispatch`, which oconv now
  composes, the XMP module from `@awacloud/pdf/extra/xmp-extended.js`);
  for a docx, xlsx or pptx from its core properties
  (`opcCoreProperties`, new in `@awacloud/ooxml`); for an odt, ods or odp
  from its `meta.xml`. `oconvIrToMd` writes it from `meta.title`. The
  profile stays `v1` and no other byte of the output moves: a consumer
  that compares front matter byte for byte sees one more key where a
  title is stated. Measured on 1,119 public PDFs: 334 state a title; on
  the 2,972 wild office files: 654 outputs gain the key (207 docx, 395
  pptx — about 300 of them an application placeholder such as
  `PowerPoint Presentation` —, 6 xlsx, 21 odt, 25 ods).
- **A dropped PDF picture is named by its object and size.** The
  `image/dropped` detail of a PDF read was the resource name alone, a
  label local to one page's resources: two different pictures both called
  `Im1` counted as one in `frontMatter: 'compact'` (and convert's
  `lossSummary`), and nothing told a decorative glyph from a figure. It
  is now `<name> (<num> <gen> R, <w>x<h>)` (`Im1 (12 0 R, 1103x599)`),
  `inline (<w>x<h>)` for an inline image; the ledger still holds one
  entry per draw. Measured on 1,119 public PDFs: 496 entries, unchanged in
  number, now naming 323 pictures by their object, none under two names.
- **odt emphasis and nested numbering read.** `toMd` and `convert` read odt
  with `@awacloud/odf`'s `semanticStyles`: the bold, italic, strike or
  monospace a style states reaches the output even when the style holds
  more (an rsid, a size, a colour, Asian variants) or inherits it, and a
  nested unstyled list takes its ancestor's numbering — fewer
  `run/format-unresolved`, no `list/numbering-unresolved` for such lists.
- **pptx pictures carried.** `toMd` of a pptx (`oconvPptxToIr`) now places
  each slide picture as a Markdown image at its place among the slide's
  body paragraphs, its bytes in `assets` (named `image<k>.<ext>` per
  distinct picture of the deck, alt text from the picture's description)
  instead of recording `slides/media-dropped`; a linked picture records
  `image/bytes-unavailable`. A deck of pictures no longer converts to an
  empty body. Tables, charts and other graphic frames are still dropped.
  The writers read the new `escapes.pptx` after `escapes.docx`, `.odt` and
  `.pdf`.

### Fixed

- **A body-level content control is read, not dropped.** The docx
  reader recorded `block/dropped` (detail `blockSdt`) for a block-level
  content control and dropped its content: cover pages, form and date
  fields, bibliographies, repeating sections (100 controls in 75 wild
  docx). Its paragraphs, tables and nested controls are now read in
  place, in the body and in a cell. A table of contents control is
  still dropped, as the odt reader drops one by default, its loss now
  naming it (`block/dropped`, detail `toc`).
- **Range markup between blocks is not a dropped block.** The docx reader
  skips the bookmarks, comment ranges, revision range markers and other
  range markup `@awacloud/ooxml` now reads between blocks without a
  `block/dropped` loss and without closing an open list; the Markdown of
  the 1,491 wild docx is unchanged.
- **Tracked moves and links inside insertions reach the Markdown.** The
  docx reader reads a move destination (`moveTo`) as accepted, like an
  insertion, and drops a move source (`moveFrom`) like a deletion; with
  `@awacloud/ooxml` now typing every child of a tracked change, a
  hyperlink inside an insertion keeps its link.
- **Nested docx lists keep their levels.** The docx reader flattened
  every list paragraph at `ilvl > 0` into its group's single-level list
  (`list/nesting-flattened`). It now builds the list tree by level, each
  list ordered by its own level's numbering format, a deeper paragraph of
  another `numId` nesting in the open list (as the docx writer and Word
  lay it out); `list/nesting-flattened` is no longer emitted. Over the
  wild docx, 21 outputs change, each gaining its levels.
- **Distinct docx pictures no longer share an asset.** The docx reader
  named an image after its drawing name, which a document may repeat:
  the `toMd` asset list, keyed by name, then kept the first picture's
  bytes only, and the odt writer's unique frame names renamed the others.
  The first image of a name now keeps it, a later one takes the first free
  `<name> (k)`. Over the wild docx, 8 outputs change, 3 of them regaining
  pictures the asset list lost.
- **A docx table without a row is skipped, and an odt one is not
  written.** The odt writer wrote a table of one empty cell for a table
  without a row (ODF needs a row), which the return reading showed as an
  empty table; it now writes nothing, and the docx reader skips such a
  table without a loss, as it skips an empty paragraph (the Markdown
  writer left two blank lines for it). With `@awacloud/ooxml` reading the
  cells of a content control in place, a docx table whose cells sit in
  content controls now reads its text.
- **An empty odt paragraph is a spacer, as in docx.** The odt reader kept
  an empty paragraph as an empty IR paragraph, which the Markdown writer
  wrote as extra blank lines (and, in a table cell, as an empty `; `
  segment); the docx reader skips it. It now skips it too, without a
  loss, wherever blocks are walked, and a paragraph of only an empty text
  run or span (which the odt reader used to map to an empty IR run, so
  that `odt → docx` wrote a blank line) is skipped the same way. Over the
  319 wild odt, 168 bodies change: 164 by blank lines or spaces only, 4 by
  an empty cell segment less.
- **A heading alone in an odt list item reads as a heading.** LibreOffice
  writes a numbered heading as a heading in a list item; the odt reader
  kept a list item holding the heading (`1. # Title`), while the docx
  reader reads a numbered heading as a heading. The list now gives such
  headings up at their place, split around them, without a loss (7 wild
  odt change).
- **A docx list item that does not open with a paragraph keeps its
  marker.** The docx writer wrote nothing for a list item with no block
  and only the nested list of an item opening with one, which the return
  reading folded into the previous item; every docx write, `fromMd`
  included, now writes an empty numbered paragraph first for such an
  item.
- **An image without bytes survives the docx and odt writers.** Both
  writers dropped an image they had no bytes for (`image/dropped`): a
  docx chart, shape, group or SmartArt (an image reference without bytes
  on read), or a Markdown image with no asset. The odt writer now keeps
  its place as a frame with no content child, in the default 2 in ×
  1.5 in box, with its name and alt text; the docx writer, as a
  placeholder picture named after it (a drawing in a box of the same
  size, with no media part). Each records the new loss
  `image/placeholder`, and the reader reads the placeholder back as the
  image reference (`image/bytes-unavailable`), so `md → odt → md`,
  `docx → odt → md` and `md → docx → md` keep it. Any other odt frame
  without an image (a text box, an object, a plugin) is unchanged.
- **An image's name survives an odt write.** The odt writer now writes
  the IR image name as the frame's `draw:name`, unique per document (a
  later frame of a name already used takes `<name> (2)`, `(3)` …; an
  empty name writes none), so docx / md → odt → md keeps the asset
  name instead of renaming it after its picture path (`image1.gif`).
- **Task markers survive md → docx / odt → md.** The docx and odt
  writers draw a GFM task item as a leading `☐ ` / `☒ ` run; the docx
  and odt readers now read a list item whose first run leads with that
  marker as `escapes.md.task` (`'unchecked'` / `'checked'`), the marker
  stripped, so `- [x] done` comes back as itself instead of `- ☒ done`.
  The glyph with no space, after other text, outside a list, or `☑`
  stays text.
- **A list or a table inside a table cell is written.** The Markdown writer
  dropped it (`block/dropped` `table cell list` / `table cell table`): a
  GFM cell holds no block. Its text is now written inline, its pieces
  joined by `; ` (recorded `inline/flattened`); other blocks a cell cannot
  hold are still dropped.
- **A CFF caller face no longer makes the pdf writer throw.** A face given
  in `opts.pdf.fonts` or `defaultFaces` that has no TrueType outlines (a
  CFF / CFF2 OpenType face, which `subsetForPdf` cannot subset) used to make
  `fromMd` / `convert` to pdf throw `fonts/subset-bad-font`; its style class
  now falls back to Standard 14 and records `layout/font-fallback` with
  `reason: 'no TrueType outlines'`. The measurer lists such classes in
  `unembeddable`.
- **An ODT heading shows its outline number.** A heading numbered by the
  document's outline style (`1.3 Normative References`) was written
  without its number, while a cross-reference to it (kept, see below)
  shows it. The odt read now writes the number an office suite shows
  (formats `1`, `a`, `A`, `i`, `I`, prefix, suffix, displayed levels,
  restarts, list headers) before the heading text, so the heading's text
  and anchor change (`1-3-normative-references`). On the ODF 1.4
  specification ODTs the words missing against their HTML text fall from
  492 / 23,003 / 6,772 (parts 2 / 3 / 4) to 357 / 16,214 / 5,212.
- **An ODT cross-reference or field keeps its text.** Outside a span, an
  inline element of a paragraph, heading or link (`text:reference-ref`,
  `text:user-field-get`, `text:sequence` …) was dropped with its text
  (`inline/dropped`): a cross-reference lost the section number it shows.
  The odt read now asks `@awacloud/odf` for these elements in place
  (`elementsInRuns`), and one holding text keeps that text
  (`inline/flattened`), as inside a span. On the ODF 1.4 specification
  ODTs the words missing against their HTML text fall from 810 / 63,512 /
  11,393 (parts 2 / 3 / 4) to 492 / 23,003 / 6,772.
- **An ODT section's content is read.** The odt reader mapped a
  `text:section` to nothing (`block/dropped` `text:section`); its blocks
  are now read in place, nested sections too (its name and style are not
  carried: the IR has no section node).
- **A soft hyphen ending a PDF line joins the word.** A soft hyphen
  (U+00AD) marks where a word was hyphenated; at a line end the reader
  kept it, invisible, followed by a space. It is now dropped and the
  word joined (`infor` + `mation` → `information`), on both paths.
- **Tagged PDFs read in structure order, with their lists and tables.**
  The tagged path walks the structure tree in `/K` order (the new `tree`
  of `oconvPdfStruct.readStructure`, its tags mapped through the
  `/RoleMap`): an inline `Span`, `Link` or `Note` stays in place in its
  paragraph (it used to come out as a paragraph of its own after it, a
  word split across two ids cut by a space), a list's lead-in stays
  before it, an `L` becomes a list (marker labels dropped, a numeric one
  ordering it) and a `Table` with `TR` rows a table with its header rows,
  where both used to be flattened into paragraphs with `struct/dropped`.
  A `Table` without a `TR` row keeps that flattening. Measured on the 336
  tagged veraPDF-corpus files: 49 tables, 56 lists, `struct/dropped` 106
  → 0, no file failing, no text lost but the dropped list numbers and
  one id referenced twice, no longer repeated.
- **A tagged PDF's lines no longer glue their words.** The tagged path
  concatenated the pieces of one marked-content sequence, so the last word
  of a line and the first of the next stuck together (`programmesthat`) at
  every line wrap inside a paragraph. The pieces are now joined like the
  untagged path's: a line wrap is one space, a same-line gap over 0.15 em
  too. The text of tagged documents changes; untagged documents are
  unchanged.

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
