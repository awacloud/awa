---
title: "@awacloud/oconv — fidelity loss matrix (v1)"
---

# Fidelity loss matrix — profile v1

**Purpose.** `@awacloud/oconv`'s published fidelity claim: for every shipped
conversion pair, what is preserved, degraded or dropped, which loss code
records it, and which fixture measures it.

**Prerequisites.** The rows apply to the three facade members of the
`@awacloud/oconv` main entry — `toMd`, `fromMd` and `convert` — and equally to
the worker message kinds of the `@awacloud/oconv/src/worker.js` sub-path,
which run the same readers and writers. The package runs in a browser and on
the runtimes its `engines` field names (Bun ≥ 1.0, Node ≥ 20); every figure
below was measured by the package's own test suite under Bun, on the named
fixtures, and none is a promise for every document of a format.

> Scope: **all seven shipped to-md pairs** — `docx→md`, `odt→md`, `xlsx→md`,
> `ods→md`, `pptx→md`, `odp→md`, `pdf→md` — `@awacloud/oconv`'s frozen `toMd`
> facade, **plus the three from-md pairs** `md→docx`, `md→odt`
> and `md→pdf` (`fromMd`),
> **plus the four cross-format pairs** `docx→odt`, `odt→docx`, `docx→pdf`,
> `odt→pdf` (`convert` — see § "Cross-format pairs"
> below). Rows below are the **measured behaviour of the frozen readers and
> writers** (`src/read/*.js`, `src/write/*.js`), verified by the fidelity
> harness (`tests/fidelity.integration.test.js`) and, for the three
> from-md pairs, by `src/write/ir-to-docx.test.js`,
> `src/write/ir-to-odt.test.js`, `src/write/ir-to-pdf.test.js`,
> `src/read/md-to-ir.test.js` and `tests/roundtrip.integration.test.js` —
> against the vendored corpus. They
> are **not** a copy of the design-phase expectation table this matrix
> started from. That table is this matrix's **origin**: it
> froze the v1 fidelity-tier decision this page publishes, but the
> readers/writers built afterwards measure real divergences from it,
> recorded honestly below rather than re-asserted unchanged:
>
> - **docx → md** keeps the design table's full Degraded list, including "nested
>   list depth flattened to one level" (harness-confirmed on the
>   real-world `poi-numbering.docx`).
> - **odt → md** matches the design table's odt→md row again. An earlier
>   reader had to move `table` out of Preserved because
>   the then-frozen `@awacloud/odf` reader had no dispatch for a text-body
>   `<table:table>`; `@awacloud/odf` has since gained that
>   dispatch and this reader maps it, so `odt-table.odt` now converts with **zero loss**
>   (`tests/fidelity.integration.test.js`, the `odt-table.odt` test). Run-level
>   bold/italic/strike/monospace is likewise resolvable now,
>   **within the resolution scope** stated in the odt→md row below —
>   embedded images stay Dropped (no path to resolve `draw:frame`/
>   `draw:image` within this reader's frozen dependency list; a frame is
>   recorded as `image/unresolved`).
> - **xlsx→md / ods→md / pptx→md / odp→md / pdf→md** are later
>   additions, absent from the design table (which only
>   ever scoped docx/odt) — their rows below are measured directly against
>   their own readers and corpus, not a divergence from an earlier
>   design row.
> - **md → docx** reaches **tier 2**: `oconvIrToDocx` (`src/write/
>   ir-to-docx.js`) always allocates an explicit hyperlink `rId` and always
>   supplies `opts.numbering` when the document has a list. `docx.write`
>   throws `docx/hyperlink-missing-rid` for a hyperlink without an explicit
>   `rId` and `docx/numbering-missing` for numbered paragraphs without
>   `opts.numbering`; this writer never reaches either throw
>   (`src/write/ir-to-docx.test.js` § "oconvIrToDocx — hyperlinks" and
>   § "oconvIrToDocx — lists and numbering"). It also always supplies `opts.styles`: every
>   container carries a fixed built-in `word/styles.xml` (`Normal`,
>   `Heading1`–`Heading6`, `TableGrid`) defining every referenced paragraph
>   style, and every table is bordered and padded (`TableGrid` style
>   reference plus direct single borders and 108-twip left / right cell
>   margins) — presentation facts, not caller styling. Its
>   bullet levels write U+2022 with no `Symbol` font (the glyph is
>   plain Unicode, and pinning the symbol font rendered a missing-glyph box
>   in viewers lacking it).
> - **md → odt** reaches **tier 2**, matching the design table's
>   original expectation. It did NOT at first: the first md→odt writer measured the
>   then-frozen `@awacloud/odf` typed write model as having no semantic
>   run-formatting flags, no `text:a` link node, no text-body table render
>   case and no ordered/bullet flag, and the compose-never-reimplement
>   rule capped the pair at tier 1 (+ lists, degraded) rather than let oconv
>   hand-author ODF XML through the raw-passthrough layer. **The cause has since been
>   removed**: `@awacloud/odf` gained the typed semantic write
>   model, `src/write/ir-to-odt.js` consumes it, and all four
>   `*-unwritable`/`block/table-degraded` odt-target loss codes are retired
>   (`src/write/ir-to-odt.test.js` § "exhaustive absence of the four retired
>   loss codes").
> - **md → odt is presentable by construction.**
>   Symmetric with md → docx: the odt writer always supplies `opts.styles` —
>   a fixed built-in `styles.xml` of nine named paragraph styles (`Standard`,
>   `Text_20_body`, `Heading`, `Heading_20_1`–`Heading_20_6`, bold, sized
>   16/14/13/12/11/11 pt like the docx set) defining every `text:style-name`
>   a heading references — and writes every table with `grid: true`, so
>   `@awacloud/odf` synthesises bordered cells and a margins-aligned table;
>   list levels carry the label-alignment geometry and no bullet font.
>   Presentation facts, not caller styling: no option, no new loss code.
> - **The adjacent-list round-trip falsification is RESOLVED, not relaxed.**
>   The first md→odt writer measured — and pinned — a genuine falsification: because an
>   odt-written ordered list and an odt-written bullet list both degraded to
>   structurally IDENTICAL generic `<text:list>` nodes, two such lists
>   textually ADJACENT in the source markdown got merged into one by
>   CommonMark's same-marker list-continuation rule on the *second* parse,
>   so normal-form idempotence `N1 === N2` did not hold for
>   `md-structural.md` × odt (it stabilised only from `N2 === N3`). With a
>   real `ordered` flag written and read back, the two lists keep DISTINCT
>   markers at N1, nothing merges, and **`N1 === N2` now holds** — measured
>   and pinned in `tests/roundtrip.integration.test.js` (leg 2, with an odt
>   falsification twin so the equality cannot be vacuous), on all three golden
>   fixtures: the writer emits no empty paragraph (a code block's trailing
>   newline and an image-only paragraph write none), because CommonMark
>   collapses an empty paragraph on the next parse.
> - **md → pdf** is a later addition, reaching **tier 2** under a
>   DIFFERENT design decision than the docx/odt pairs: a deliberately
>   *bounded* typesetter, not the design table (which never scoped pdf as a
>   from-md target at all). Its Preserved/Degraded/Dropped cells are
>   therefore refusals BY DESIGN as often as they are gaps — see the
>   dedicated section below.
> - **`docx→odt` / `odt→docx` / `docx→pdf` / `odt→pdf`** are `convert`'s
>   four shipped cross-format pairs (the allowlisted facade
>   member) — pure reader→IR→writer composition, reusing
>   the SAME readers/writers the to-md/from-md rows above already measure.
>   Their rows live in the dedicated § "Cross-format pairs" section
>   below, not in the to-md/from-md table above, because a `convert`
>   fidelity cell is the COMPOSITION of an existing reader row and an
>   existing writer row, never a new capability.

Tier 1 = text + heading hierarchy. Tier 2 = + lists, tables, inline
emphasis, links, image references — **except on the `→ pdf` targets**
(`md → pdf`, `docx → pdf`, `odt → pdf`): the bounded typesetter keeps a
link's TEXT but never its target (a design refusal, no loss recorded), so their
"2" is tier 2 minus link targets, stated in each of those rows. **Tier 3**
(styles/layout) is **not promised by v1 in any pair**.

| Pair | v1 tier | Preserved | Degraded | Dropped |
|---|---|---|---|---|
| **docx → md** | 2 | headings (from `pPr.pStyle`: a `Heading1`–`Heading6` style ID, else the style's built-in `w:name` — `heading 1`–`heading 6` — read from `styles.xml`, so a localized ID such as `Titre1` still gives its level, and the built-in `Title` becomes a level-1 heading; `src/read/docx-to-ir.test.js` § "oconvDocxToIr — heading levels by built-in style name"), paragraphs, bold/italic/strike runs, hyperlinks (via `result.hyperlinks[rId]`), tables → GFM, list items, image *references* (with the image bytes carried by reference in the asset manifest when the embedded image resolved — "Measured, not assumed" below), inline code from a monospace `rPr.font` (frozen name allowlist, `src/read/docx-to-ir.js` — "Measured, not assumed" below) | ordered-vs-bullet list distinction (needs `numbering.xml`; falls back to bullet — measured, harness-confirmed on `docx-structured.docx`, see below); nested list depth flattened to one level (measured, harness-confirmed on `poi-numbering.docx`, real-world, see below); runs in a monospace font outside the allowlist are plain runs (no per-node code); a paragraph styled `Subtitle` (by its built-in name) is kept as a plain paragraph and recorded as `heading/subtitle-degraded`, and heading resolution by name needs a `styles.xml` part — a document without one gets the `Heading<N>` ID rule alone, so a localized ID reads as a plain paragraph (`basedOn` chains, numbered heading styles and `w:aliases` are not consulted) | page layout, sections, headers/footers, footnotes, comments, tracked changes, fonts/colours |
| **odt → md** | 2 | same, and **better**: `@awacloud/odf` has a first-class `heading` node (`<text:h>` with outline level), so heading detection is semantic, not heuristic; nested lists are preserved (not flattened); text-body tables → GFM (`tests/fidelity.integration.test.js` on `odt-table.odt`, zero loss); run bold/italic/strike/monospace and ordered-vs-bullet, **within the resolution scope below**; the inner markup of a `<text:span>` — spacing (`text:s`), tabs, line breaks, nested spans (their emphasis flags add up) and links with their target — kept run by run (`src/read/odt-to-ir.test.js` § "oconvOdtToIr — span inner markup") | a field, reference or note inside a `<text:span>` keeps its text as a plain run carrying the span's emphasis, but not its meaning (`inline/flattened`, detail = the element name); a frame holding a text box inside a span keeps that text the same way and records `image/unresolved` (same test describe). **Resolution scope**: read-side semantic resolution covers `content.xml` automatic styles AND `styles.xml` `office:styles` styles that are fully mapped (single style, no `style:parent-style-name` chain); monospace resolves only through a declared fixed-pitch or generic-modern font face. Foreign documents styled through parent chains or partially-mapped styles still yield `run/format-unresolved` / `list/numbering-unresolved` on read — an unresolved list falls back to bullet (both codes still fire on `odt-structured.odt`, whose generated `styles.xml` is empty: `tests/fidelity.integration.test.js`) | embedded images (no path to resolve `draw:frame`/`draw:image` within this reader's frozen dependency list; a frame is recorded as `image/unresolved`, detail `draw:frame` — `tests/crossformat-ooxml-odf.integration.test.js` § "poi-with-gif.docx — the image reference survives docx->md but not docx->odt->md: the odt reader leaves the written frame unresolved"), page layout, sections, headers/footers, footnotes, comments, tracked changes |
| **xlsx → md** | 2 | sheet name → `h1` heading, one GFM table per sheet in workbook order, string/numeric/boolean cell values, workbook order (harness-confirmed, `poi-simple-multicell.xlsx`) | a formula cell reduced to its cached value only (`sheet/formula-as-value`, harness-confirmed on the real Excel-computed formula in `poi-formula-eval.xlsx`) | cell/sheet formatting (`sheet/format-dropped`), merged ranges flattened into their independent cells (`sheet/merge-dropped`), charts (`sheet/chart-dropped`), pivot tables (structurally invisible on this reader's frozen dependency list — never even detectable, not a per-node loss) |
| **ods → md** | 2 | same base mapping as xlsx, and **better**: `table:table-header-rows` is a real public signal `@awacloud/odf` surfaces, so a header row is marked `row.header:true` for real (harness-confirmed, `ods-structured.ods`) — xlsx has no equivalent concept | same `sheet/formula-as-value` (harness-confirmed, `ods-structured.ods`, a real `table:formula` cell) | same `sheet/format-dropped` / `sheet/merge-dropped` / `sheet/chart-dropped` codes as xlsx (identical vocabulary, format-specific detection); pivot tables likewise structurally invisible |
| **pptx → md** | 1 | slide order, title (`ctrTitle`/`title` placeholder) → `h2` heading, body-frame paragraphs, non-ASCII prose (harness-confirmed, `poi-sampleshow.pptx` converts with zero loss) | — (an untitled slide records `slides/untitled` rather than degrading content — see below) | pictures/tables/charts/graphicFrames (`slides/media-dropped`, detail = shape type; harness-confirmed on `poi-table.pptx` and `poi-pictures.pptx`, real-world); speaker notes (`@awacloud/ooxml`'s public `pptx.read()` never surfaces them at all — `includeNotes` is a documented, tested no-op for pptx, a genuine `@awacloud/ooxml` capability gap, not an oconv choice); layout/animations (structurally out of the public read result, never a per-node loss) |
| **odp → md** | 1 | same base mapping as pptx (harness-confirmed, `odp-structured.odp`), and **better**: speaker notes ARE natively readable (`slide.notes.body`) — `includeNotes:true` renders them as a trailing blockquote per slide (harness-confirmed) | — | media (image/object frames, `slides/media-dropped`, harness-confirmed on `odp-media.odp`); speaker notes when `includeNotes:false` (the default) — recorded as `slides/notes-omitted`, not silently discarded (harness-confirmed); layout/animations (structurally out of the public read result) |
| **pdf → md** | 1 (design-phase bounds, FROZEN — except the Form XObject bound, lifted: text drawn inside a form is extracted) | real text via the font's ToUnicode CMap, the encoding-table + AGL hop, or — composite fonts only — a Unicode-coded predefined CMap (`Uni*-UCS2`/`Uni*-UTF16`) (`src/read/pdf/font-decoder.js`); on a **tagged** document (`/StructTreeRoot`), headings (`H1`..`H6`) + paragraphs derived from the logical struct tree instead of positioning (harness-confirmed, `tagged-structured.pdf`); page boundaries → IR `hr` section breaks; text drawn inside a Form XObject (`Do`), executed in place under the form's `/Matrix` and its own `/Resources` (the page's when it has none), nested forms included (`src/read/pdf/text-extract.js`; measured below, § "Form XObjects"); on the **untagged** fall-back, word spaces between separately drawn text pieces of one line — each piece's end is placed from the font's glyph widths, and one space is inserted on a horizontal gap — or an overlap, the next piece starting left of the previous one's end — wider than 0.15 em, never doubling an existing space, and a piece that exactly repeats the previous piece of its line (same text, within 0.5 pt) is dropped (`src/read/pdf/paragraph-group.js`); inside one `TJ` array, an adjustment that moves the text right by more than the same 0.15 em is read as a word space (`src/read/pdf/text-extract.js`; measured below, § "Word spacing") | `text/width-approximated` — a font whose glyph widths cannot be read from the font (no `/Widths` on a font outside the Standard 14, a malformed width array, a missing descendant font, a `/W` table under a non-identity CMap) is placed with a declared fallback width (500 thousandths of the em for a simple font, 1000 for a composite one), once per font resource per page: its text is kept, but the inferred word spaces around it are approximate. Standard 14 fonts without `/Widths` use the shipped Adobe Core 14 AFM widths and record nothing. Otherwise a feature either round-trips through the struct tree/ToUnicode or is a Dropped/undecodable count below | images/inline images, including those drawn inside a form (`image/dropped`); a Form XObject whose stream cannot be used — not a stream, undecodable, unparsable — so its text is not extracted (`xobject/form-dropped`, the detail names the reason); a Form XObject that is not executed by a guard: drawn from inside itself, directly or through other forms (`xobject/form-cycle`), nested deeper than 12 forms (`xobject/form-depth`), or drawn after the page has run a budget of `formOpBudget` operators inside forms (default 1,000,000, configurable through the `toMd` `formOpBudget` input; `xobject/form-budget`, once per page); on the **untagged** fall-back, ALL structure beyond flowing text — headings, emphasis, lists, tables — inferred ONLY from vertical text-positioning heuristics (`src/read/pdf/paragraph-group.js`), no column detection, no reading-order reconstruction; a `Table`/`L` struct container on the tagged path is flattened, descendant text kept (`struct/dropped`, harness-confirmed on `tagged-structured.pdf`); a character code that resolves to no Unicode is counted, never silently kept (`text/undecodable`); a word space drawn as a kern of 0.15 em or less INSIDE one `TJ` array, or as a gap or overlap of 0.15 em or less between two pieces, is not inferred, so those words stay glued — no loss is recorded for it (measured below, § "Word spacing") |
| **md → docx** | 2 | headings 1–6 (`Heading<n>` style, defined — bold, sized — in the fixed built-in `word/styles.xml` every write emits), paragraphs, bold/italic/strike runs, hyperlinks with explicit `rId`s (`docx.write` throws `docx/hyperlink-missing-rid` without one; this writer never reaches the throw), ordered/bullet lists including one nesting level down (`ilvl`, `word/numbering.xml` supplied, so `docx.write`'s `docx/numbering-missing` throw is never reached either; bullet levels write U+2022 with no `Symbol` font), GFM tables (content + shape, **bordered**: `TableGrid` style reference plus direct single borders on all six edges), **inline code** (`rPr.font` Courier New, symmetric with the reader's monospace allowlist — "Measured, not assumed" below), **images when `opts.assets` (or reader-carried `escapes.docx.bytes`) supply the bytes** — placed through `@awacloud/ooxml`'s `docx.imageRun` | code blocks → one plain paragraph per source line (`block/degraded`, detail `codeBlock`); blockquotes → their child blocks emitted in place (`block/degraded`, detail `blockquote`); a non-paragraph/non-list block inside a list item emitted after the item's own paragraph rather than inside it (`block/degraded`, detail `listItem-child:<kind>`); GFM header row kept POSITIONALLY only — `row.header` has no docx model concept, row 0 stays the header by position, not a recorded loss (measured non-vacuity: `losses` is `[]` on a header-carrying table); list nesting deeper than `ilvl` 8 clamped to 8 (`list/depth-clamped`); an ordered list's `start=` above 1 dropped **at the reader** — the IR `list` node has no start prop (`list/start-dropped`); a GFM task-list checkbox marker dropped **at the reader** (`list/task-marker-dropped`); GFM column alignment dropped **at the reader** (`table/align-dropped`); hard line breaks → a single space (`inline/linebreak-degraded`); a non-empty link title dropped **at the reader**, link text/target kept (`inline/dropped`, detail `link-title`); a placed image is written at `@awacloud/ooxml`'s DEFAULT 2 in × 4:3 box — this writer passes no `cx`/`cy`, so the image's intrinsic size is not applied (`image/size-defaulted`) | an image whose bytes are NOT supplied (`image/dropped`); thematic breaks (`block/dropped`, detail `hr`); raw HTML, both block (`block/dropped`, detail `html_block`) and inline (`inline/dropped`, detail `html_inline`); front matter, stripped before parsing and never carried into the container (`frontmatter/stripped`) |
| **md → odt** | **2** (raised from tier 1 + degraded lists once `@awacloud/odf` gained its typed semantic write model — see the scope note above) | headings (real `text:h` outline levels via `outlineLevel`, each naming a defined `Heading_20_<n>` style — bold, sized — in the fixed built-in `styles.xml` every write emits), paragraphs, nested lists (structure — a `list` inside a `listItem`'s children is preserved natively), **ordered-vs-bullet lists** (`ordered` + `numFormat:'1'`), **bold/italic/strike/inline-code runs** (typed `span` flags, `code` → `monospace`), **hyperlink targets** (a typed `link` run → `text:a`), **GFM tables** (typed `table`/`row`/`cell`, leading `header:true` rows → `headerRows`; **bordered** and margins-aligned — `grid: true`, the bordered cells and table alignment synthesised by `@awacloud/odf`), all TEXT content of every run and cell — the whole `md-structural.md` fixture writes with an EMPTY loss ledger (`tests/roundtrip.integration.test.js` leg 4), and the markdown normal form is stable through odt (`N1 === N2`) on all three golden fixtures (leg 2); **images when `opts.assets` (or reader-carried `escapes.docx.bytes`) supply the bytes** — written as a `Pictures/image<k>.<ext>` part in an as-char `draw:frame`, block and inline, in a table cell and in a list item (`src/write/ir-to-odt.test.js` § "oconvIrToOdt — opts.assets: images are placed") | code blocks → one paragraph per line (the block's one trailing newline writes no trailing empty paragraph), block-level monospace styling not applied (`block/degraded`, detail `codeBlock`); blockquotes → child blocks emitted in place (`block/degraded`, detail `blockquote`); a placed image is written in a DEFAULT 2 in × 1.5 in frame (5.08cm × 3.81cm) — its intrinsic size is not applied (`image/size-defaulted`); plus the reader-side degrades shared with md→docx (`list/start-dropped`, `list/task-marker-dropped`, `table/align-dropped`, `inline/linebreak-degraded`, `inline/dropped` detail `link-title`) | thematic breaks, raw HTML, front matter — same codes as md→docx (`block/dropped` detail `hr`); an image whose bytes are NOT supplied (`image/dropped`); `block/dropped` detail `html_block` + `inline/dropped` detail `html_inline`; `frontmatter/stripped`. An image this pair writes reads back through `toMd` as `image/unresolved` (detail `draw:frame`): the odt reader does not type frames (see the odt → md row) |
| **md → pdf** | 2 minus link targets (bounded typesetter; a link keeps its text, never its target — see the tier definition above) | headings 1–6, paragraphs, bold / italic / bold-italic runs and code runs — ONE style class per run, so a code run's own bold/italic is not kept (see Dropped), nested lists (bullet/ordered markers by depth), fenced code + inline code (monospace), GFM tables (fit-to-column), block quotes (left rule), thematic rules, page numbers, **JPEG images (baseline/extended/progressive, 1 or 3 components) when `assets` supplies the bytes** — placed as a real `/DCTDecode` XObject, scaled to the column, aspect ratio preserved; a CMYK (4-component) JPEG is refused, not placed (`src/write/pdf/render/image.test.js` § "a CMYK JPEG is refused, not guessed at"); **a registered `@awacloud/oconv-fonts` default face pack (optional) upgrades every unsupplied style class from Standard 14 to Liberation with no caller-supplied bytes** — see below | the reader-side degrades shared with md→docx/md→odt, recorded by the SAME `md-to-ir.js` reader before the writer runs — the measured `md-degrade.md` ledger below shows "`frontmatter/stripped`, `inline/linebreak-degraded`, `list/task-marker-dropped` ×2, `table/align-dropped`" on this pair, and the reader's other codes apply unchanged (`list/start-dropped`, `inline/dropped` detail `link-title`; `src/read/md-to-ir.test.js`); tables wider than the column, scaled proportionally (`layout/table-scaled`); a table (or cell) too narrow even at minimum width (`layout/table-clipped`); overlong unbreakable tokens wider than the column (`layout/line-overflow`); a block taller than one page, clipped at the page bottom (`layout/block-clipped`); `layout/s14-variant-metrics-approx` — a defensive fallback, unreachable against the real `@awacloud/fonts` package: its Standard 14 bold and bold-italic tables carry their own widths, so bold and bold-italic are measured on their own metrics (only a stubbed measurer reaches the code, `src/write/ir-to-pdf.test.js`); **`text/unencodable` is route-conditional**: a non-WinAnsi code point on the Standard 14 route degrades to `?`; a code point with no glyph in the resolved face's own `cmap` on the explicit or registered/posted default-face route draws `.notdef` — both are RECORDED, one collapsed record per document, never silent; a style class with no explicit AND no default-face bytes on a mixed/embedded call (`layout/font-fallback`); a link renders as plain text with **no PDF annotation and no loss recorded** (a design refusal — `src/write/ir-to-pdf.test.js` § "a link run draws exactly like the same unlinked run — byte-identical output, no /Annot, no /Link, no loss"); **strikethrough is recorded, not rendered** — no rule is ever drawn, because no style class on this writer is strike-aware (measured, `styleOfRun` in `src/write/pdf/metrics.js` and its mirror in `src/write/pdf/linebreak.js`), so the struck text is typeset plain; the drop is RECORDED as `inline/strike-dropped` (one record per text block, `detail` `{ runs, text }`, the page bytes identical to the unstruck run — `src/write/ir-to-pdf.test.js` § "oconvIrToPdf — strikethrough is RECORDED, no rule drawn"; corrects an earlier planning assumption that strike survives here the way it does on `md → docx`/`md → odt`) | **bold/italic inside a code run, recorded as `inline/code-emphasis-dropped` and not rendered** — `styleOfRun` returns `code` before it reads either emphasis flag, so the run draws in the one monospace class (`src/write/pdf/metrics.test.js` § "code wins over every emphasis flag" pins the mapping; `src/write/ir-to-pdf.test.js` § "oconvIrToPdf — strikethrough is RECORDED, no rule drawn" pins the record, one per text block, the bytes of the code-only run unchanged); the reader-side drops shared with md→docx (`block/dropped` detail `html_block`, `inline/dropped` detail `html_inline`, `frontmatter/stripped` — the last one on the measured `md-degrade.md` ledger); **PNG and every other non-JPEG encoding, and a CMYK (4-component) JPEG**, recorded as `layout/image-dropped` with `reason: 'unsupported-encoding'` (plus `format` when the header reader named the container) — a PNG `IDAT` is a zlib stream of filtered scanlines, not a PDF image stream, so embedding it would render garbage; an image with no bytes at all, `reason: 'no-bytes'`. Both still draw the `[image: <alt>]` placeholder, so neither image refusal is silent (the one silent case on this pair is the link target, listed in this row). And by design refusal: hyphenation, justification, widow/orphan control, floats/text wrap, multi-column layout, table page-splitting, a table of contents, vertical justification, running headers/footers beyond the page number; and every line-breaking rule beyond Latin script — lines break at whitespace only, with no bidirectional reordering (right-to-left text is drawn left to right in stored order, no loss recorded) and no CJK line breaking (a CJK run written without spaces is ONE unbreakable token, recorded as `layout/line-overflow` when wider than the column — `src/write/pdf/linebreak.test.js` § "one oversized token → one overflowing line"); see § "md → pdf — the bounded typesetter" below |

## pdf → md — measured decode coverage (not assumed)

The real-corpus figure this row's "Preserved" cell rests on:
**`facturx-minimum-sample.pdf`** (FNFE-MPE Factur-X 1.09 MINIMUM reference
invoice, a real, non-synthetic PDF/A-3 document) decodes at **100.00%**
— **4128 / 4128 character codes, 0 undecodable** — entirely via the
embedded fonts' own ToUnicode CMaps (the exact count is
pinned at the reader by `src/read/pdf-to-ir.test.js` § "the decoded
character-code count is EXACTLY 4128, matching the published loss-matrix
figure"). The `toMd` facade result carries no coverage count, so the figure
is not observable through the facade: the fidelity harness asserts only
that this fixture's facade ledger is the single `image/dropped` entry
(`tests/fidelity.integration.test.js` § "facturx-minimum-sample.pdf — real
invoice corpus: ToUnicode text decode, one image/dropped loss (embedded
logo raster)"), i.e. no text-decode loss record. This is a **material lift**
from the **0.9%** bound measured during the design phase, before the AGL
hop existed — the lift comes from two upstream fixes this reader composes
without reimplementing: `pdfParser.tokenize` making
`pdfContentStream.parseContentStream` reachable through `@awacloud/pdf`'s public
graph, and the embedded fonts' ToUnicode CMaps (the AGL named-glyph hop via
`@awacloud/fonts`' `encodingAgl` is the fall-back for a font that lacks one — not
the coverage driver on this specific fixture). **This is one measured
fixture, not a universal claim**: a real PDF whose fonts carry no
ToUnicode and no resolvable `/Encoding` will undercount, honestly, via
`text/undecodable` — never silently.

### A real third-party document: font resolution

Measured 2026-09-23 on `anssi-guide-selection_crypto-1.0.pdf` (ANSSI, 58
pages, xref stream + 6 object streams; opt-in, never committed — the
`references/ANSSI/` leg of `tests/pdf-text-quality.integration.test.js`):

| | `text/font-unresolved` | `text/undecodable` |
|---|---|---|
| before (on top of the `/DecodeParms` fix) | 4 438 | 4 438 |
| after | **0** | **60** |

The cause was not the fonts: all 24 are reachable (12 `Type0` Identity-H
fonts, all with a ToUnicode CMap, plus 12 `Type1`), and their dicts live in
object streams the reader already resolved. It was the page resources:
56 of 58 pages carry `/ExtGState` as an indirect reference, which
`pdfResources` used to reject, dropping the whole resource map — fonts
included. The same change also takes the two other measured ANSSI guides
from 1 649 / 1 649 and 5 934 / 5 934 to 0 / 0.

The 60 remaining `text/undecodable` records are **honest losses**: codes
drawn with six embedded Computer Modern `Type1` math fonts (CMSY10,
CMMI10, CMR10, CMSY8, CMSY5, CMMI8) that neither the font's ToUnicode nor
its `/Encoding` maps to Unicode. A `Type0` font with no ToUnicode whose
`/Encoding` is `Identity-H`/`-V` or a legacy predefined CMap stays
`text/undecodable` in the same way. These are three documents, not a
universal claim.

**Remaining limit — truncated content streams.** Measured 2026-10-06 on
the three AFNOR XP Z12-012 / 013 / 014 PDFs through `toMd` (third-party
documents, never committed; no test pins these figures): no content stream
records `pdf/flate/inflate-failed` any more — the streams now decode. What
remains is 15 / 54 / 51 `content/undecodable` records, every one with the
same cause, `unknown content-stream operator "E"`: the recovered tail of
that content stream ends inside its final `ET`, so the parser meets a lone
`E`. That is a limit of the decompression layer, outside oconv; the stream
is skipped and recorded, never silently. The Markdown bodies run to about
291 k / 79 k / 117 k characters. Three documents, not a universal claim.

### Word spacing (measured)

Separately drawn text pieces of one line used to be concatenated with no
separator, gluing words (`Ilconstitueuneproductionoriginale`). The reader
now places each piece's end from the font's glyph widths (ISO 32000-2
§9.4.4, with `Tc`, `Tw`, `Tz` and `TJ` adjustments) and inserts one space
where the gap to the next piece exceeds 0.15 em. Two glue signals, measured
with the same counting function before and after, on the three ANSSI guides
of the opt-in `references/ANSSI/` leg of
`tests/pdf-text-spacing-forms.integration.test.js` (measured 2026-09-23):

| Document | (a) letter runs ≥ 22 — before | after | (b) lower→upper transitions — before | after |
|---|---|---|---|---|
| `anssi-fondamentaux-zero-trust-v1.0.pdf` | 66 | **61** | 200 | **21** |
| `anssi-guide-mecanismes-crypto-3.00.pdf` | 223 | **124** | 979 | **394** |
| `anssi-guide-selection_crypto-1.0.pdf` | 97 | **94** | 243 | **44** |

The residue at that date was mostly words glued INSIDE one `TJ` array:
those documents draw a whole justified line as one `TJ` whose inter-word
kerns shrink below the reader's then −200 threshold (to about −166 on tight
lines). Three documents, not a universal claim.

**In-`TJ` threshold, duplicate and overlapping pieces (measured
2026-10-02).** A `TJ` adjustment n now reads as a word space iff
−n / 1000 > 0.15 em — the line pass's own `wordGap` default, one value in
both places (pinned by a drift test). A piece that exactly repeats the
previous piece of its line (same text, |Δx| ≤ 0.5 pt, |Δy| ≤ 0.5 pt) is
dropped instead of glued to its copy. Any other piece that starts left of
the previous piece's end gets one space iff the overlap exceeds the same
0.15 em. Same counting function, whole
Markdown, with (c) the count of a phrase of ten characters or more
immediately repeated on its own line (with or without one space between);
"before" is measured after the WinAnsi apostrophe change, on the same
three guides:

| Document | (a) before | after | (b) before | after | (c) before | after |
|---|---|---|---|---|---|---|
| `anssi-fondamentaux-zero-trust-v1.0.pdf` | 62 | **0** | 22 | **7** | 1 | **0** |
| `anssi-guide-mecanismes-crypto-3.00.pdf` | 124 | **25** | 394 | **383** | 0 | 0 |
| `anssi-guide-selection_crypto-1.0.pdf` | 94 | **0** | 44 | **29** | 0 | 0 |

The mechanisms guide's 25 remaining long runs are its rule labels, drawn as
one word each (`RecoCourbeElliptiqueGFp`). The duplicate rule also drops
476 dots the selection guide draws twice at one place. Of the 779 other
same-line overlaps on these guides, 778 are below 0.05 em (a kerned
apostrophe, a syllable split across two shows, rounding) and stay joined
with no space, where a space would split a word; the one overlap above
0.15 em (0.255 em, `entité .Une taille`) now reads `entité . Une taille`.
Three documents, not a universal claim.

### Form XObjects (measured)

A Form XObject drawn by `Do` used to be recorded as `xobject/form-dropped`
and skipped, so any text it carried (diagram labels, chart axes, reused
page furniture) was lost. The reader now executes the form in place (ISO
32000-2 §8.10.1): it saves the graphics state, concatenates the form's
`/Matrix` onto the current transformation matrix, resolves fonts and
XObjects from the form's own `/Resources` (the page's when the form has
none), walks the form's content stream with the same text and advance
model, and restores the state on return. Measured 2026-09-23 on the three
ANSSI guides of the opt-in `references/ANSSI/` leg of
`tests/pdf-text-spacing-forms.integration.test.js`:

| Document | `xobject/form-dropped` — before | after | guard codes after | Markdown body length — before | after |
|---|---|---|---|---|---|
| `anssi-fondamentaux-zero-trust-v1.0.pdf` | 15 | **0** | none | 77 272 | **80 069** |
| `anssi-guide-mecanismes-crypto-3.00.pdf` | 55 | **0** | none | 192 397 | **192 484** |
| `anssi-guide-selection_crypto-1.0.pdf` | 45 | **0** | none | 123 120 | 123 120 |

The zero-trust guide gains its diagram labels, and the mechanisms guide
gains its chart axis labels. The selection guide's forms carry no text, so
its Markdown body is unchanged. On the two glue signals of § "Word
spacing", the mechanisms and selection guides are unchanged (124 / 394 and
94 / 44). The zero-trust guide gains one of each (61 → 62 and 21 → 22):
none of its previously extracted text changed, but one new diagram label
is drawn twice at the same place, and the two copies joined with no space
(the copy is now dropped — § "Word spacing").
Three documents, not a universal claim.

**Scanned/OCR PDFs are permanently out of scope, at every tier** — no OCR
engine is composed or planned; a scanned page's content stream carries no
extractable text at all, so this reader's tier-1 text-first design has no
signal to work from.

## md → pdf — the bounded typesetter

`md → pdf` (`oconv.fromMd({ markdown, target: 'pdf' })`) is a **bounded**
typesetter, not a general-purpose layout engine, by design:
one page size, one
text column, greedy space-based line breaking, hard page breaks only.
Line breaking is Latin-only: lines break at whitespace and nowhere else
(`src/write/pdf/linebreak.js`). There is no bidirectional reordering, so
right-to-left text is drawn left to right in stored order, with no loss
recorded: on a two-word Hebrew line, the first word is drawn at the left
margin (measured on the registered default-face route; no test pins it).
There is no CJK line breaking either: a CJK run written without
spaces is one unbreakable token, so a run wider than the column overflows
it on a line of its own and records `layout/line-overflow`
(`src/write/pdf/linebreak.test.js` § "one oversized token → one
overflowing line").
Every item in this row's Dropped-by-refusal list is a deliberate design
boundary, not a missing feature: hyphenation, justification, widow/orphan
control, floats/text wrap, multi-column layout, table page-splitting, a
table of contents, vertical justification, and any running header/footer
beyond the page number are never planned. The full options / loss-code /
font-route reference lives in
[`docs/pdf-writer.md`](./pdf-writer.md) — this section is the published
summary.

**Geometry defaults**: A4 (595.276 × 841.89 pt), 56.693 pt margins (20 mm)
on all sides, giving a **481.89 pt** text column. Body text 11 pt at 1.32×
leading. Headings 22 / 18 / 15 / 13 / 12 / 11 pt for levels 1–6. Monospace
(fenced + inline code) 9.5 pt. Every value is an `opts.pdf` override
(`docs/pdf-writer.md`'s option table).

**The three font tiers, resolved PER STYLE CLASS (verbatim,
frozen)**:

```
explicit opts.pdf.fonts[class] > registered oconvDefaultFaces[class] > Standard 14
```

The **Standard 14** fallback (Helvetica family + Courier) encodes as
WinAnsi (CP1252) literal strings and names `/Encoding /WinAnsiEncoding` on
every font dictionary, so bytes 0x80–0xFF (accented letters, the em dash,
the bullet markers) decode back to the characters drawn on `pdf → md` —
`@awacloud/oconv` **vendors no font file
of its own**, on any of the three tiers. The **explicit** tier takes
caller-supplied whole font programs per style class (`opts.pdf.fonts`); the
**default-face** tier is an OPTIONAL registered pack reached by the module
NAME `oconvDefaultFaces` only (`@awacloud/oconv` never imports the
companion package — `main.js` registers a name-only `0.0.0` stand-in that
any real pack displaces in either registration order). Both non-Standard-14
tiers subset to the document's own code points and encode as
`WinAnsiEncoding` or `Identity-H` hex strings depending on whether every
code point the style uses is WinAnsi-representable.

**Text beyond WinAnsi is a companion-package concern (by design),
opt-in via registration, and limited to the covered ranges stated below**:
`@awacloud/oconv-fonts` (Liberation
Sans/Serif/Mono, SIL OFL 1.1) supplies the default-face
tier — an OPTIONAL package a host
registers on the SAME `ModuleRuntime` (`registerDefaultFaces(runtime)`
before the first `resolve('oconv')`, or `runtime.invalidate
('oconvDefaultFaces', { cascade: true })` afterwards — see
[`docs/pdf-writer.md`](./pdf-writer.md) § "The default-face tier"). An
application that never registers it keeps the Standard 14 route exactly as
before. Whichever route resolves a style class, a code point that route
cannot draw is recorded honestly, never silently: on Standard 14, a
non-WinAnsi code point degrades to `?`; on the explicit or default-face
route, a code point with no glyph in the resolved face's own `cmap` draws
`.notdef` — both collapse into the SAME `text/unencodable`
record, ONE per document. Text that IS WinAnsi-representable on the
Standard 14 route measures on its real advance: the Standard 14 width
tables cover the full WinAnsi byte map — the 95 printable-ASCII slots plus
the 123 filled high slots (0x80–0xFF), so accented and CP1252 punctuation
no longer fall back to the `'?'` width.

**Covered ranges, the only Unicode statement this page makes** (measured
from `@awacloud/oconv-fonts`' vendored faces' own `cmap`,
`tests/default-faces.integration.test.js`): Latin — Basic Latin,
Latin-1 Supplement, Latin Extended-A in full; Cyrillic in full; Greek and
Coptic 88.2 %; Hebrew 77.7 %. **Not** CJK, **not** Arabic, **not** Indic.
Coverage is a `cmap` fact, not a shaping claim — the typesetter refuses
shaping by design (no kerning, no `GPOS`), so a script needing shaping to render
correctly renders wrong even where the glyphs exist. The full block table
and its test citation live in [`docs/pdf-writer.md`](./pdf-writer.md) §
"Covered Unicode ranges".

**`opts.pdf` DOES reach the worker; the registered face pack itself does
not.** `src/worker.js`'s `handleFromMd`/`handleConvert` forward `opts`
verbatim over the message envelope, only when the caller supplies the key
— geometry, font routes, `pageNumbers`, all of
it, structured-cloned like the rest of the message. What does NOT cross
the boundary is the `oconvDefaultFaces` descriptor: it closes
over its bytes inside `factory()`, so `ModuleRuntime#serialize` cannot ship
it. The HOST resolves `runtime.resolve('oconvDefaultFaces').defaultFaces()`
on its own thread and posts the resulting byte map as a separate
`defaultFaces` envelope field, forwarded the same way, only when present.
See [`docs/pdf-writer.md`](./pdf-writer.md) § "`opts.pdf` reaches the
worker" for the full reasoning.

**Images**: `fromMd` takes an optional `assets`
map — `{ '<markdown image destination>': Uint8Array }`, keyed EXACTLY as the
markdown wrote it, no normalisation and no fetching. All three writers
resolve an image the same way (caller `assets` first, then reader-carried
`escapes.docx.bytes`), and then diverge:

| Target | With bytes | Without |
|---|---|---|
| `docx` | placed, at a default 2 in × 4:3 box (`image/size-defaulted`) | `image/dropped` |
| `odt` | placed, as a `Pictures/image<k>.<ext>` part in a default 2 in × 1.5 in frame (5.08cm × 3.81cm) (`image/size-defaulted`) | `image/dropped` |
| `pdf` | JPEG (1 or 3 components) placed, no loss; PNG, a CMYK JPEG and other encodings `layout/image-dropped` + `reason: 'unsupported-encoding'` | `layout/image-dropped` + `reason: 'no-bytes'` |

Image support also closed a genuinely SILENT drop on `md → pdf`: CommonMark's
`![alt](src)` is always INLINE inside a paragraph, and
`oconvPdfLinebreak.tokenize` skips every non-`run` inline, so an inline
image used to leave no mark and no loss. `oconvPdfStack` now
partitions a text block's inlines and delegates each image, so it is either
drawn or recorded.

`md → pdf` places JPEG only, and not every JPEG: a CMYK (4-component) JPEG
is refused with `reason: 'unsupported-encoding'` (it needs a `/Decode`
array and an Adobe transform the writer does not model). That is a measured
boundary, not an omission:
JPEG bytes are directly embeddable behind `/DCTDecode`, while a PNG needs a
zlib-to-Flate re-wrap (plus `/SMask` or `/Indexed` for the alpha and palette
colour types) that this writer does not build — see
[`docs/pdf-writer.md`](./pdf-writer.md) § Images. PNG placement in
`md → pdf` is not supported.

**`keepTogether` is inert for delegated blocks.** `render/table.js`
returns `keepTogether: true`, but `stack.js`'s delegated-block builder never
copies it onto the `FlowBlock` it constructs (unlike the heading path,
which does copy its own `keepTogether`) — pinned by
`src/write/pdf/stack.test.js` § "a delegated renderer returning
`keepTogether: true` has it dropped — the flag never reaches the flow
block". A table is still never split across pages: the stacker's hard
page-break rule moves any block that does not fit the remaining space to a
new page whole, and clips a block taller than one page at the page bottom
with `layout/block-clipped` (`src/write/pdf/stack.test.js` § "a block is
never split across pages — every item of a block shares one page";
measured on a real table by `tests/crossformat-to-pdf.integration.test.js`
§ "docx-bulk.docx → pdf: MULTI-PAGE (24), one overflow + one
block-clipped", 108 units clipped). What the dropped flag loses is only the
stacker's keep-with-next check (a flagged block also requires the first
line of the NEXT block to fit), which today applies to headings alone.
Measured, not fixed.

**Round-trip note (measured, `tests/roundtrip.integration.test.js`)**:
with the default `pageNumbers: true`, the decoded page-number text is
literal body content on read-back (`pdf → md` has no way to distinguish a
footer number from prose), so feeding a `toMd(fromMd(...))` result back
through `fromMd` again is **not** idempotent — each round appends one more
trailing page-number line. Normal-form idempotence (`N1 === N2`) holds
with `pageNumbers: false`, measured on all three golden md fixtures.

## Cross-format pairs

`oconv.convert({ bytes, target })` is pure
reader→IR→writer **composition** — `read <format> → oconv-ir/v1 → write
<target>`, the same two pipelines `toMd`/`fromMd` already implement,
wired back to back for exactly four allowlisted pairs. It adds no
dependency to the `oconv` module descriptor and no new office-package
wiring: every reader and writer it calls was already reachable from
`toMd`/`fromMd`, and a `convert` fidelity cell is the composition of that
reader's `→ IR` row and that writer's `IR →` row published above. This
section states no new Preserved/Degraded/Dropped fact for a construct the
reader/writer rows don't already describe. The allowlist is
enforced by a single frozen check (`oconv: unsupported pair`); see
[`docs/convert.md`](./convert.md) for the full signature, error order and
worker message.

**Reader-carried image bytes (docx source).** `convert` takes no `assets`
input of its own — unlike `fromMd`, there is no markdown image
destination to key a manifest by. A `docx → *` pair resolves an image
only through the bytes the docx reader already carried in
`escapes.docx.bytes` (the asset-bytes rule all three writers share;
`src/write/asset-bytes-drift.test.js` pins it byte-identical across them).

**Images on the odt side.** `docx → odt` places every image whose bytes
the docx reader carried: on `poi-with-gif.docx` the `convert` ledger is
exactly `[{ code: 'image/size-defaulted', detail: 'Grafik 1' }]`, and the
written odt carries one `Pictures/image1.gif` part, byte-equal to the IR's
6554-byte `escapes.docx.bytes` (`tests/crossformat-ooxml-odf.integration.test.js`
§ "poi-with-gif.docx — the IR carries escapes.docx.bytes and the written
odt carries them as its Pictures/image1.gif part"). The image reference
survives `docx → md` but not `docx → odt → md`: the odt reader records the
written frame as `image/unresolved` (detail `draw:frame`) and emits no IR
image node (§ "poi-with-gif.docx — the image reference survives docx->md
but not docx->odt->md: the odt reader leaves the written frame
unresolved"). The same reader limit applies when an odt is the `convert`
SOURCE: an image frame in it records `image/unresolved` and never reaches
the `docx` or `pdf` writer.

**One remaining wall.**

- **The `md → pdf` PNG / non-JPEG encoding boundary.**
  `docx → pdf` and `odt → pdf` reuse the SAME `→ pdf` writer `md → pdf`
  uses, so a carried image that is not a placeable JPEG refuses with
  `layout/image-dropped` / `reason: 'unsupported-encoding'` — measured on
  this pair's own corpus with a GIF (`poi-with-gif.docx`; the `format`
  detail key is absent on this fixture, because the header reader
  recognises only PNG and JPEG) and pinned generically (PNG, CMYK JPEG,
  malformed bytes) by
  `src/write/pdf/render/image.test.js` (tripwire already cited in
  "Measured, not assumed" below).

**Inherited design refusals for `→ pdf`.** `docx → pdf` and `odt → pdf` are
the SAME bounded typesetter `md → pdf` uses (`src/write/ir-to-pdf.js` +
`src/write/pdf/**`) — every design refusal in the "`md → pdf` — the
bounded typesetter" section above applies unchanged: no hyphenation, no
justification, no widow/orphan control, no floats/text wrap, no
multi-column layout, no table page-splitting, no table of contents, no
running header/footer beyond the page number, no line breaking beyond
Latin script. Two further writer
behaviours are measured and not fixed: `keepTogether` is inert for a
delegated block (the flag is dropped, so only the keep-with-next check is
lost — a table is still never split across pages: it moves to a new page
whole, or is clipped with `layout/block-clipped` when taller than one page,
as `docx-bulk.docx` shows below), and `run.strike` is unrendered —
struck-through text is typeset plain, with **no strikethrough rule drawn**;
the drop is recorded as `inline/strike-dropped`, not rendered.

| Pair | Tier | Preserved | Degraded | Dropped | Byte-repro. |
|---|---|---|---|---|---|
| **docx → odt** | 2 | Headings (semantic outline level; anchors pinned exactly on the return leg), paragraph prose, bold/italic run emphasis (every corpus fixture), inline code (monospace — the symmetric docx monospace path + the odf `textStyleRegistry`), hyperlinks with their target URL, ordered-vs-bullet list distinction, tables (all cells, GFM header + delimiter + data rows; 61×3 on `docx-bulk.docx`, 6 tables on `poi-table-alignment.docx`). Strikethrough run emphasis also survives, but is measured only through the generated `md-structural.md` → docx → odt → md leg (`tests/crossformat-ooxml-odf.integration.test.js` § "inline code survives md -> docx -> odt -> md"), never on a vendored docx corpus fixture — not a corpus-wide claim. | From the odt writer, one `image/size-defaulted` (detail `Grafik 1`, `poi-with-gif.docx`: the image is placed in the default 2 in × 1.5 in frame — see above) — the only writer-side loss in this pair's whole corpus; the writer's ledger is EMPTY on the other 5 of 6 fixtures. Two READ-side degrades carry through unchanged: `list/numbering-unresolved` (`docx-structured.docx`) and `list/nesting-flattened` (`poi-numbering.docx`). | None measured in this pair's corpus. An image with no carried bytes records `image/dropped`, as on `md → odt`. | No (the ODF package writer stamps the current time — see below) |
| **odt → docx** | 2 | Headings + anchors (pinned exactly on the return leg), paragraph prose, hyperlinks with their target URL, every list item's text, the text-body table (all cells, as a real GFM table). | Nothing from the docx writer — its ledger is EMPTY on both fixtures. On `odt-structured.odt`: 4 READ-side ledger entries across 2 code families (`run/format-unresolved` ×1, `list/numbering-unresolved` ×3 — both from the fixture's empty `styles.xml`). On the return leg (`toMd` of the converted `.docx`, not in the `convert` ledger itself) the fixture's two adjacent bullet lists stay two lists — `ir-to-docx.js` writes one numbering instance per top-level list, so nothing merges — and only the nested item flattens, reported as the docx reader's own `list/nesting-flattened` (detail `numId 2 ilvl 1`). | None measured on this pair's two fixtures, neither of which carries an image. An image frame in an odt source never reaches the docx writer: the odt reader records it as `image/unresolved` (detail `draw:frame`) and emits no IR image node (see "Images on the odt side" above). | Yes (fixed zip entry timestamp — see below) |
| **docx → pdf** | 2 minus link targets (bounded typesetter) | Paragraph and heading prose (heading level drives the type size), run style classes (regular/bold/italic/boldItalic/code, ONE class per run — the symmetric docx monospace path reaches the pdf `code` class, and a code run's own bold/italic is not kept — recorded as `inline/code-emphasis-dropped`), document order, list item text with generated markers, table cell text laid out in real columns, automatic pagination (`docx-bulk.docx` lays out over 24 pages). | Reader degrades carry through unchanged (`list/numbering-unresolved`, `list/nesting-flattened`). Writer-side: `layout/line-overflow` when an unbreakable token exceeds its column (`docx-structured.docx`, `docx-bulk.docx`), `layout/block-clipped` when a block is taller than one page (`docx-bulk.docx`, a table: 108 units clipped) — measured, and never `layout/table-scaled`: that code is a WIDTH degrade, fired only when a table's natural column widths exceed the text column (`src/write/pdf/render/table.js`), and the exact `docx-bulk.docx` ledger carries neither it nor `layout/table-clipped`, so the over-tall table fits the column's width — its height overflow is what records `layout/block-clipped`. Design boundary unchanged: links render plain, strike is recorded (`inline/strike-dropped`) but not drawn, `keepTogether` is inert. | Two content drops measured in this corpus: `layout/image-dropped` — on this corpus an ENCODING refusal (GIF, `poi-with-gif.docx`), not a missing byte; the `format` detail key is absent because the header reader recognises only PNG and JPEG — and the 108 table units `layout/block-clipped` cuts off at the page bottom on `docx-bulk.docx` (listed under Degraded above). | Yes |
| **odt → pdf** | 2 minus link targets (bounded typesetter) | Heading prose and level, paragraph prose, every list item's text with a generated marker, the text-body table's cells laid out in real columns (the typed odf read model reaches the pdf writer intact). | Reader degrades only, both on `odt-structured.odt`: `run/format-unresolved` (the fixture's empty `styles.xml` leaves the span's styleName unresolved) and `list/numbering-unresolved` (same empty `styles.xml`, 3 list names). The pdf writer's ledger is EMPTY on both odt fixtures. | None measured. No odt fixture in the corpus carries an image, so the `→ pdf` image path is untested from an odt source (it is tested from a docx source and, via `fromMd`, from a markdown source); an image frame in an odt source is recorded by the odt reader as `image/unresolved` before the pdf writer runs. | Yes |

**Byte-reproducibility** follows the same rule as `fromMd` (§ "From-md
reproducibility" below). The `docx` target is byte-reproducible:
`@awacloud/ooxml` stamps every zip entry with a fixed 1980-01-01 00:00
timestamp, so two `odt → docx` runs on the same source give byte-identical
containers (`tests/crossformat-ooxml-odf.integration.test.js` "odt -> docx:
two convert runs are BYTE-identical"). The `odt` target is not: the ODF
package writer stamps the current time into every zip entry, so two
`docx → odt` runs give equal document models but may give different bytes.
The `pdf` target is byte-reproducible (no zip container, no date, no `/ID`
— see [`docs/pdf-writer.md`](./pdf-writer.md)'s determinism note). **No
round-trip stability claim is made for any pair** — converting, say,
`docx → odt` and back is not asserted to reproduce the original bytes,
model, or IR. Two runs of the SAME pair on the SAME source are
MODEL-equal for every fixture measured (`bodyOf(toMd(convert(X)))`
identical, ledgers identical too — `tests/crossformat-ooxml-odf.integration.test.js`
§ "two convert runs are MODEL-equal", `tests/crossformat-to-pdf.integration.test.js`
§ "leg 4: two runs are byte-identical" / § "leg 5: embedded font route");
the `odt → docx` pair and the `→ pdf` pairs are stronger: BYTE-identical,
not merely model-equal, because neither the docx nor the pdf write path
stamps the current time.

**Owner acceptance.** The `pdfBuilder.addImage`
seam is effective end to end through `convert`, independently of
`fromMd`: `oconv.fromMd({markdown, target:'docx', assets})` then
`oconv.convert({format:'docx', target:'pdf'})` places the SAME image —
same `/XObject` dict, same raw stream bytes, same `Do` operator — as
`oconv.fromMd({markdown, target:'pdf', assets})` does directly, with
`losses: []` on the `convert` leg and byte-identical output across two
runs (`tests/crossformat-to-pdf.integration.test.js` § "leg 7: OWNER
ACCEPTANCE of the pdfBuilder.addImage seam").

## Not shipped

| Excluded family | Reason |
|---|---|
| `xlsx ↔ ods`, `pptx ↔ odp` | No pivot-IR **writer** targets a spreadsheet or presentation container today (`oconvIrToDocx`/`oconvIrToOdt`/`oconvIrToPdf` are the only three write targets this package ships) — outside the converter's initial design scope, not a gap in the docx/odt pair |
| `{xlsx, ods, pptx, odp} → pdf` | Deferred pending a measured fidelity statement for laying out a spreadsheet/presentation through the bounded typesetter — no reader/writer composition has been measured for these sources |
| `{xlsx, ods, pptx, odp} → {docx, odt}` | Deferred pending a measured fidelity statement for writing a spreadsheet or presentation IR into a text-document container: the four readers emit one table per sheet under a sheet heading (xlsx/ods) or one section per slide (pptx/odp), and no `oconvIrToDocx` / `oconvIrToOdt` composition over those shapes has been measured against a fixture — same status as the `→ pdf` family above, never inferred from this table |
| `pdf → docx`, `pdf → odt` | Not supported — `pdf` is a `convert` **target** only, never a `convert` **source**; no `oconvPdfToIr → write` composition is wired here |
| Same-format pairs (`docx → docx`, `odt → odt`, `pdf → pdf`) | Never a `convert` (there is nothing to convert); not in `SUPPORTED_PAIRS`. `pdf → pdf` is doubly excluded: `pdf` is never a `convert` source (row above) |
| Any `→ md` pair | That is `toMd`, the existing read-direction facade member, not `convert` |

Adding a pair beyond the four above is a later, measured decision — never
inferred from this table.

## From-md reproducibility

**The `docx` target is byte-reproducible**: `@awacloud/ooxml` stamps every
zip entry with a fixed 1980-01-01 00:00 timestamp, so two identical
`fromMd(..., 'docx')` calls produce byte-identical containers. The test
checks the bytes AND the stamp itself: every local file header and every
central directory header carries time `0x0000` / date `0x0021`, so the
equality does not depend on both calls landing in the same second
(`tests/roundtrip.integration.test.js` § "reproducibility — md -> docx is
byte-reproducible").

**The `odt` target is not byte-reproducible**: the ODF package writer
stamps the current time into every zip entry, so two identical
`fromMd(..., 'odt')` calls produce equal document MODELS and may produce
different bytes. The to-md direction's byte-reproducibility statement is
unchanged.

**The `pdf` target is byte-reproducible**: two
`fromMd(..., 'pdf')` calls on the same markdown and the same `opts.pdf`
produce byte-identical output (measured, `src/write/ir-to-pdf.test.js`
"determinism", and at the facade by `tests/roundtrip.integration.test.js`
§ "reproducibility — md -> pdf is byte-reproducible") — `irToPdf` never calls `pdfBuilder.setId`, and
`@awacloud/pdf`'s plain write path reads no clock and no randomness. This
holds only because `md → pdf` never enters `@awacloud/pdf`'s encrypted
write path, which does use `Math.random()`.

## Explicit out-of-scope statements

- **Scanned/OCR is permanently out of scope**, for any pair, at any tier —
  most concretely for `pdf → md` (see above), but the statement holds
  package-wide: no OCR engine is composed or planned anywhere in
  `@awacloud/oconv`.
- **Tier 3 (styles/layout) is not promised by any pair** in v1 — no font,
  colour, page-layout, header/footer, or list-style-name fidelity is ever
  claimed, regardless of format.
- **The from-md docx and odt writers each emit a fixed built-in style set
  — not caller styling.** docx: Normal, Heading1-6, Table Grid; odt:
  Standard, Text body, Heading, Heading 1-6, with every table bordered
  and margins-aligned. It exists so the container is presentable by
  construction; no option supplies or alters
  it, and no source style is carried through it.
- **`convert` is shipped.** `oconv.convert({bytes,
  target})` is a third, additive facade member composing the
  EXISTING readers/writers for exactly four allowlisted pairs — `docx →
  odt`, `odt → docx`, `docx → pdf`, `odt → pdf` — see § "Cross-format pairs"
  above and [`docs/convert.md`](./convert.md). No other pair is
  shipped; § "Not shipped" above lists every excluded family and its
  reason. `md→pdf` is shipped — `fromMd` targets
  `.docx` / `.odt` / `.pdf`. `md→pdf` is bounded (tier 2 minus link
  targets, refusals listed above); it PLACES 1- or 3-component
  JPEG images supplied through `assets` and records an explicit loss for a
  CMYK JPEG and every other encoding.

## Measured, not assumed

Every degraded/dropped cell above that names a code is asserted by the
fidelity harness against a real fixture (either a vendored real-world
document or an in-repo generated fixture; `tests/_fixtures/corpus/`
carries a root `PROVENANCE.md` plus one in most format directories —
`docx/`, `odt/` and `real/` carry none of their own and are covered by the
root file):

| Code | Fixture | Assertion |
|---|---|---|
| `list/numbering-unresolved` | `docx-structured.docx` (first-party, no `numbering.xml` part) | `tests/fidelity.integration.test.js` |
| `list/numbering-unresolved` | `odt-structured.odt` (generated) | idem |
| `list/nesting-flattened` | `poi-numbering.docx` (real-world) | idem |
| `run/format-unresolved` | `odt-structured.odt` (generated) | idem |
| odt span inner markup: spacing, a tab, a line break, a nested bold span and a link each give their own IR run, nested span flags add up, each span with no resolved flag records its own `run/format-unresolved`; with the spacing entries removed, the IR text of every span equals the span's flattened text; a span with no inner markup maps exactly as before | spans written and read back through `@awacloud/odf`, plus hand-built odf span models | `src/read/odt-to-ir.test.js` § "oconvOdtToIr — span inner markup" |
| `inline/flattened` (`text:reference-ref`): the field text `Table 3` is kept as a run carrying the span's bold flag; in the same span a text-box frame keeps its text and records `image/unresolved`, an image-only frame records `image/unresolved` with no run, an empty bookmark records `inline/dropped` | a bold span holding the four elements, written and read back through `@awacloud/odf` | `src/read/odt-to-ir.test.js` § "oconvOdtToIr — span inner markup" |
| **no** `block/dropped` (`table:table`) (retired — the odt reader once dropped every text-body table): the text-body table maps to a real IR `table`, `losses` is `[]` | `odt-table.odt` (generated) | `tests/fidelity.integration.test.js`, the `odt-table.odt` test |
| `sheet/formula-as-value` | `poi-formula-eval.xlsx` (real-world) | idem |
| `sheet/formula-as-value` | `ods-structured.ods` (generated) | idem |
| `slides/media-dropped` (`table`) + `slides/untitled` | `poi-table.pptx` (real-world) | idem |
| `slides/media-dropped` (`picture`) ×3 + `slides/untitled` ×3 | `poi-pictures.pptx` (real-world) | idem |
| `slides/notes-omitted` | `odp-structured.odp` (generated) | idem |
| `slides/media-dropped` (`image`) + `slides/untitled` + `slides/notes-omitted` | `odp-media.odp` (generated) | idem |
| `struct/dropped` (`Table`) | `tagged-structured.pdf` (first-party, tagged fast path) | idem |
| `image/dropped` | `facturx-minimum-sample.pdf` (real-world) | idem |
| **no** `run/code-degraded` (retired) | hand-built IR: a plain code run, code+bold, a code run inside a hyperlink — `rPr.font === 'Courier New'`, `losses` is `[]` | `src/write/ir-to-docx.test.js` § "inline code" |
| **no** `run/code-degraded`, exhaustively | one hand-built IR mixing code runs in a plain paragraph, bold+code, a hyperlink, a list item and a table cell — `losses` is `[]` | `src/write/ir-to-docx.test.js` § "exhaustive absence of run/code-degraded" |
| monospace round trip: `rPr.font` allowlist entries (`Consolas`, `courier new` case/space-insensitive, all 18 frozen names) → `code:true`; `Calibri` / no `rPr.font` → `code:false`; independent of `bold` | hand-built docx bytes via `docxApi.write`/`docxApi.read` | `src/read/docx-to-ir.test.js` § "monospace detection" |
| `list/depth-clamped` | hand-built IR, a list nested 9 levels deep | `src/write/ir-to-docx.test.js` |
| `block/degraded` (`listItem-child:table`) | hand-built IR, a table inside a `listItem` | `src/write/ir-to-docx.test.js` |
| `block/degraded` (`codeBlock` / `blockquote`) | hand-built IR, a 3-line code block / a quoted paragraph+heading | `src/write/ir-to-docx.test.js` (and `src/write/ir-to-odt.test.js` for the odt target) |
| `block/dropped` (`hr`) | hand-built IR, a thematic break between two paragraphs | `src/write/ir-to-docx.test.js` (and `src/write/ir-to-odt.test.js`) |
| `image/dropped` (from-md, block and inline) | hand-built IR, a block-level and an inline image node, NO bytes supplied | `src/write/ir-to-docx.test.js` (and `src/write/ir-to-odt.test.js`) |
| `image/size-defaulted` (md→docx) | hand-built IR image + `opts.assets`, block and inline; `docx.read(bytes).images` non-empty and byte-identical to the supplied fixture | `src/write/ir-to-docx.test.js` § "opts.assets" |
| md→docx caller `assets` WINS over reader-carried `escapes.docx.bytes` | one IR image carrying BOTH, distinguishable bytes | idem |
| `image/size-defaulted` (md→odt): an image with bytes is PLACED — one `Pictures/image1.png` part byte-identical to the supplied fixture, one 5.08cm × 3.81cm as-char frame; caller `assets` win over reader-carried `escapes.docx.bytes`; `image/dropped` only when no bytes are reachable | hand-built IR image + `opts.assets`, block, inline, in a table cell and in a list item | `src/write/ir-to-odt.test.js` § "oconvIrToOdt — opts.assets: images are placed" |
| `layout/image-dropped` `reason: 'no-bytes'` / `'unsupported-encoding'` (+ `format`) | committed `corpus/assets/px.png`, `px.jpg`, a synthetic CMYK JPEG and 8 random bytes | `src/write/pdf/render/image.test.js` |
| md→pdf JPEG PLACEMENT: `addImage` receives the parsed parameters and the bytes by identity; the page `/XObject` names `Im0`; the stream is `/DCTDecode` and byte-identical to the fixture; the content stream carries `/Im0 Do Q`; **no loss** | `corpus/assets/px.jpg` through `irToPdf(ir, undefined, {assets})` | `src/write/ir-to-pdf.test.js` § "writeOpts.assets" |
| an image too tall to fit records the stack's OWN `layout/block-clipped`, not a new code | a synthetic 1×5000 JPEG through `stack.layoutDocument` | `src/write/pdf/render/image.test.js` |
| the `assetBytes` rule is byte-identical in all three writers, falsified against a mutated copy | the three source files | `src/write/asset-bytes-drift.test.js` |
| the `readImageHeader` mirror inside `oconvPdfRenderImage` is character-identical to `src/write/image-header.js` | the two source files | `src/write/pdf/render/image.test.js` |
| `oconv: bad assets` for a non-object, an array, `null` and any non-`Uint8Array` value; an unreferenced key is ignored (no loss, no error); the key is matched VERBATIM | `oconv.fromMd` | `src/oconv.test.js` § "assets validation" |
| `assets` survives structured clone into the worker and reaches both the docx and the pdf writer; a malformed manifest comes back as DATA in `error`; the reply key shape is unchanged | the real `src/worker.js` | `tests/worker.integration.test.js` |
| **no** `run/format-unwritable` (retired) | hand-built IR runs: `bold+italic`, then all four flags `bold,italic,strike,code` — written as typed `span`s, `losses` is `[]` | `src/write/ir-to-odt.test.js` § "run emphasis and links (no loss)" |
| **no** `link/target-unwritable` (retired) | hand-built IR run with `link: 'https://example.test/'` — written as a typed `link` run, `losses` is `[]` | idem |
| **no** `list/ordered-unwritable` (retired) | hand-built IR, one ordered list with one item — written with `ordered:true` + `numFormat:'1'`, `losses` is `[]`; an adjacent ordered+bullet pair keeps distinct `ordered` values end to end | `src/write/ir-to-odt.test.js` § "lists" |
| **no** `block/table-degraded` (retired) | hand-built IR, a 2×2 table (header row + data row) — written as a typed table with `headerRows:1`, `losses` is `[]` | `src/write/ir-to-odt.test.js` § "tables (no loss)" |
| all four retired codes absent together | one hand-built IR exercising formatted runs, links, ordered lists and tables at once | `src/write/ir-to-odt.test.js` § "exhaustive absence of the four retired loss codes" |
| `frontmatter/stripped` | `'---\ntitle: X\n---\n# Body\n'` (yaml), plus toml (`+++`) and json (`;;;`) fences | `src/read/md-to-ir.test.js` |
| `list/start-dropped` | `'3. three\n4. four\n'` | `src/read/md-to-ir.test.js` |
| `list/task-marker-dropped` | `'- [x] done\n- [ ] todo\n'` | `src/read/md-to-ir.test.js` |
| `table/align-dropped` | a 2-column GFM table with a `:---:` centered column | `src/read/md-to-ir.test.js` |
| `inline/linebreak-degraded` | `'line one  \nline two\n'` (trailing-double-space hard break) | `src/read/md-to-ir.test.js` |
| `inline/dropped` (`link-title`) | `'A [link](https://example.test/ "a title") here.\n'` | `src/read/md-to-ir.test.js` |
| `inline/dropped` (`html_inline`) | `'Text <span>inline</span> more.\n'` | `src/read/md-to-ir.test.js` |
| `block/dropped` (`html_block`) | `'<div>\nhello\n</div>\n'` | `src/read/md-to-ir.test.js` |
| **no** `run/code-degraded` (facade-level ledger, retired): `losses` is `[]`, the returned body contains `` `inline code` `` with its backtick fence | `md-structural.md` fed through `oconv.fromMd(...,'docx')` then `oconv.toMd(...)` | `tests/roundtrip.integration.test.js` leg 1 |
| md→odt exact ledger: **`losses` is `[]`** (tier 2 — every construct in the fixture is writable; the four `*-unwritable`/`block/table-degraded` codes are retired) | `md-structural.md` fed through `oconv.fromMd(...,'odt')` | `tests/roundtrip.integration.test.js` leg 4 |
| md→odt→md return body: emphasis markers, backticked inline code, the `[text](url)` link, both list markers and all three GFM table rows survive | idem | idem |
| md→odt presentable by construction: `styles.xml` defines the nine named styles, every `text:h` names `Heading_20_<level>` in document order (`[1,2,3,3,2]`), 3 tables × 3 rows × 3 cells = 27 bordered cells, every table margins-aligned, the list style's level 1 carries the label-alignment geometry (`fo:margin-left="1.27cm"`) and its bullet level no `style:text-properties`, `losses` is `[]`; `odt.read` gives headings `styleName`, tables `grid:true`, cells no `styleName`, no `autoStyles`; the md→odt→md return keeps the five headings, `**revenue**`, `*headcount*`, the cell texts and the list markers | `tests/_fixtures/md/presentable-report.md` fed through `oconv.fromMd(...,'odt')` | `tests/from-md-odt-presentable.integration.test.js` § "fromMd odt — presentable output" (3 tests) + `src/write/ir-to-odt.test.js` § "oconvIrToOdt — presentation" |
| md→docx bullet glyph: every level of the bullet `abstractNum` writes `lvlText` U+2022 with no `rPr`, no `w:rFonts` in the raw part; the decimal `abstractNum` is unchanged | `oconv.fromMd(...,'docx')` on the same fixture; hand-built IR with one bullet and one ordered list | `tests/from-md-docx-presentable.integration.test.js` § "fromMd docx — presentable output" + `src/write/ir-to-docx.test.js` § "bullet levels carry U+2022 with NO Symbol font" |
| `md-structural.md`, `md-nested.md` and `md-degrade.md` × odt normal-form idempotence: **`N1 === N2`** on all three golden fixtures (the adjacent-list-merge falsification is resolved, see the scope note above; `md-nested.md` and `md-degrade.md` hold because the writer emits no empty paragraph), non-vacuous via an odt falsification twin | idem | `tests/roundtrip.integration.test.js` leg 2 (one test per fixture, `<fixture> x odt — N1 === N2 (stable normal form)`) |
| md→pdf: `md-nested.md` — 1 page, `losses: []` | `md-nested.md` fed through `oconv.fromMd(...,'pdf')` | `tests/fidelity.integration.test.js` § "md-nested.md — fromMd(pdf): 1 page, zero write-side loss (MEASURED)" |
| md→pdf: `md-structural.md` — 1 page, exactly ONE record, `inline/strike-dropped` (`index: '4'`, `kind: 'paragraph'`, `detail: { runs: 1, text: 'strikethrough text' }`): the fixture's struck run is drawn plain and the drop is recorded, not rendered | `md-structural.md` fed through `oconv.fromMd(...,'pdf')` | `tests/fidelity.integration.test.js` § "md-structural.md — fromMd(pdf): 1 page, one recorded inline drop (MEASURED)" |
| `inline/strike-dropped` and `inline/code-emphasis-dropped` on md→pdf: one record per text block, `detail` `{ runs, text }`; the page bytes are identical to those of the unflagged run; `code: true` alone records nothing | hand-built IR, one struck run, one `code`+`bold` run, one `code`-only run | `src/write/ir-to-pdf.test.js` § "oconvIrToPdf — strikethrough is RECORDED, no rule drawn" (and `src/write/pdf/linebreak.test.js` § "breakInlines — recorded inline drops") |
| md→pdf→md, Standard 14 route: the accented line `Café, déjà vu — accents.` reads back verbatim (no `CafØ`, no `?`), `losses` is `[]` on the write AND on the read | `'# Rapport\n\nCafé, déjà vu — accents.\n'` fed through `oconv.fromMd(...,'pdf')` with `pageNumbers: false`, then `oconv.toMd` | `tests/roundtrip.integration.test.js` § "roundtrip — leg 9: accents on the Standard 14 route (md->pdf->md)" |
| `heading/subtitle-degraded`, and heading levels `[1, 1, 2, 3]` read by built-in style NAME from French-localized style IDs (`Titre1`…, `Sous-titre`): the subtitle stays a plain paragraph, exactly one loss | `docx-fr-styles.docx` (generated) | `src/read/docx-to-ir.test.js` § "oconvDocxToIr — committed French-styled fixture (docx-fr-styles.docx)" |
| docx→md asset bytes: `toMd` returns one asset (`Grafik 1`) whose `bytes` is a 6554-byte `Uint8Array` carried by reference, `lossy: false` | `poi-with-gif.docx` (real-world) | `tests/fidelity.integration.test.js` § "poi-with-gif.docx — converts with zero loss, embedded image kept as an asset reference" |
| md→pdf: `md-degrade.md` — 1 page, EXACT 7-entry ledger (`frontmatter/stripped`, `inline/linebreak-degraded`, `list/task-marker-dropped` ×2, `table/align-dropped`, `layout/image-dropped` at index `5.i0` with `reason: 'no-bytes'`, `layout/line-overflow` on the "Center" table header cell). RE-MEASURED when image support landed: the ledger had 6 entries and asserted the ABSENCE of any image code, because the inline image was skipped before the stack partitioned inlines | idem | idem |
| md→pdf + `assets`: `md-degrade.md` with `px.jpg` places (no image loss, `/Im0 Do Q` in the stream); with `px.png` refuses with `reason: 'unsupported-encoding'`, `format: 'png'`. md→docx + `assets`: `image/size-defaulted` replaces `image/dropped` and `docx.read` shows one image | idem | idem |
| the four retired `layout/*-unrendered` stub codes are absent from every md→pdf ledger measured | idem | idem |
| md→pdf embedded route: same page count as Standard 14; three records: `layout/font-fallback` (unsupplied `mono` class) PLUS the struck run's `inline/strike-dropped` (the same index-`4` record as on the Standard 14 route — the line breaker does not depend on the route) PLUS one `text/unencodable` (`count: 23, sample: 'bhHkx•'`) — RE-PINNED when the embedded route started recording missing glyphs: the corpus-mined Calibri faces are SUBSETS lacking glyphs for several characters of this fixture (`G h k b z v x q` among others), so occurrences that used to draw `.notdef` silently are now always recorded | `md-structural.md` fed through `oconv.fromMd(...,'pdf')` with `opts.pdf.fonts` mined from `facturx-minimum-sample.pdf`'s 4 Calibri faces | `tests/fidelity.integration.test.js` § "md-structural.md — embedded route: same page count as Standard 14, one font-fallback loss for the unsupplied `mono` class, the struck run's inline drop, plus one text/unencodable record for the corpus faces' missing glyphs" |
| default-face tier, C1 (pack absent): Standard 14 only, `text/unencodable` fires, no `layout/font-fallback` | shared Latin+Greek+Cyrillic+Latin-Ext-A sample through `oconv.fromMd(...,'pdf')`, no `opts.pdf.fonts`, no pack registered | `tests/default-faces.integration.test.js` § "C1: pack absent" |
| default-face tier, C2 (pack registered before the first `resolve('oconv')`): every used font embeds Liberation, `losses` carries neither `layout/font-fallback` nor `text/unencodable`, and `toMd` recovers the Greek/Cyrillic/Latin-Extended-A lines verbatim | same sample, `registerDefaultFaces(runtime)` called before `resolve('oconv')` | `tests/default-faces.integration.test.js` § "C2: pack registered" |
| default-face tier, C3 (frozen worked example, matches `oconv-fonts/docs/descriptor.md`): `opts.pdf.fonts.regular` overrides ONLY `regular` (`/BaseFont` contains `LiberationSerif`, not `LiberationSans`); `bold`/`italic`/`boldItalic`/`code` resolve to the registered pack's `LiberationSans`/`LiberationMono`, no `layout/font-fallback` | a bold/italic/boldItalic/inline-code sample, pack registered, `opts.pdf.fonts.regular` = `LiberationSerif-Regular.ttf` bytes | `tests/default-faces.integration.test.js` § "C3: frozen worked example (partial override of regular only)" |
| CJK honesty, default-face route: pack registered + one CJK line → `lossy: true`, EXACTLY one `text/unencodable` record, the Latin sentence still recovered through `toMd` | shared sample plus one CJK line (`中文文字样本`), pack registered | `tests/default-faces.integration.test.js` § "default-faces — CJK honesty" |
| default-face tier determinism: two identical registered-route calls byte-identical; invariant 1 — an explicit full `opts.pdf.fonts` map (all five classes) is byte-identical with and without the pack registered | shared sample, two runs; then the same sample with every class supplied explicitly, with and without `registerDefaultFaces` | `tests/default-faces.integration.test.js` § "determinism" |
| registration order: pack registered BEFORE `registerAll(modules)` still wins (version precedence beats registration order); pack registered AFTER the first `resolve('oconv')` has NO effect on the already-resolved handle until `runtime.invalidate('oconvDefaultFaces', {cascade:true})`, after which a FRESH `resolve('oconv')` picks it up | shared sample, both registration orders | `tests/default-faces.integration.test.js` § "registration order" |
| covered ranges (`LiberationSans-Regular`, measured from the cmap): Basic Latin/Latin-1 Supplement/Latin Extended-A/Cyrillic 100.0%, Greek and Coptic 88.2%, Hebrew 77.7%, Arabic/Devanagari/Hiragana/Katakana/CJK(first 256)/Hangul(first 256) 0.0% | `LiberationSans-Regular.ttf`, block bounds taken from the test's own `BLOCKS` table (`tests/default-faces.integration.test.js`) | `tests/default-faces.integration.test.js` § "covered Unicode ranges (measured from the cmap)" |
| md→pdf→md, `pageNumbers:false`: **`N1 === N2`** for all three golden fixtures, non-vacuous via a falsification twin — RE-MEASURED once image support landed, now that `md-degrade.md` carries a placeholder line, and it still holds (the placeholder re-parses as a plain paragraph) | idem | `tests/roundtrip.integration.test.js` leg 8 |
| md→pdf→md, DEFAULT `pageNumbers`: **`N1 !== N2`**, measured and pinned WITH the reason (the decoded page-number digit is literal body text, so it re-enters as new content each round) | `md-structural.md` | idem |
| md→pdf→md, `md-degrade.md`'s inline image — **one** `layout/image-dropped` (index `5.i0`, `reason: 'no-bytes'`) and the `[image: Diagram]` placeholder decodes back out of the page; with a placeable JPEG in `assets` the image is DRAWN instead, so no loss fires and no placeholder text decodes (a raster carries no text — pinned, not smoothed over). RE-PINNED when image support landed: this leg previously asserted the opposite relation (vanishes with no code, no placeholder) | idem | idem |
| md→pdf is **byte-reproducible** (no clock and no randomness on this write path) | two `fromMd(...,'pdf')` calls on `md-structural.md` | `tests/roundtrip.integration.test.js` § "reproducibility — md -> pdf is byte-reproducible" |
| md→docx is **byte-reproducible**: two calls give byte-identical containers, and every local file header and central directory header carries the fixed 1980-01-01 00:00 stamp (time `0x0000`, date `0x0021`) | two `fromMd(...,'docx')` calls on `md-structural.md` | `tests/roundtrip.integration.test.js` § "reproducibility — md -> docx is byte-reproducible" |
| `list/numbering-unresolved` (convert, `docx → odt` / `docx → pdf`) | `docx-structured.docx` | `tests/crossformat-ooxml-odf.integration.test.js` § "docx-structured.docx -> odt — EXACT ledger, reader/writer split measured, output re-parses as odt" / `tests/crossformat-to-pdf.integration.test.js` § "docx-structured.docx → pdf: 1 page, 2 reader + 2 writer losses" |
| `list/numbering-unresolved` ×3 (convert, `odt → docx` / `odt → pdf`) | `odt-structured.odt` | `tests/crossformat-ooxml-odf.integration.test.js` § "odt-structured.odt -> docx — EXACT ledger, reader/writer split measured, output re-parses as docx" / `tests/crossformat-to-pdf.integration.test.js` § "odt-structured.odt → pdf: 1 page, 4 reader losses, zero writer loss" |
| `run/format-unresolved` (convert, `odt → docx` / `odt → pdf`) | `odt-structured.odt` | same two tests as the row above |
| `list/nesting-flattened` (convert, `docx → odt` / `docx → pdf`) | `poi-numbering.docx` | `tests/crossformat-ooxml-odf.integration.test.js` § "poi-numbering.docx -> odt — EXACT ledger, reader/writer split measured, output re-parses as odt" / `tests/crossformat-to-pdf.integration.test.js` § "poi-numbering.docx → pdf: 1 page, one reader nesting-flattened loss" |
| `list/nesting-flattened` (`detail: 'numId 2 ilvl 1'`) on the return leg, and NO list merge: the two adjacent bullet lists stay distinct, the blank line between them survives, only the nested item flattens (convert, `odt → docx`) | `odt-structured.odt` | `tests/crossformat-ooxml-odf.integration.test.js` § "odt-structured.odt -> docx — MEASURED DIFFERENT: the two bullet lists stay distinct; only the nested item flattens (exact difference pinned)" |
| `image/size-defaulted` (detail `Grafik 1`) (convert, `docx → odt` — the only writer-side loss in this pair's corpus) | `poi-with-gif.docx` | `tests/crossformat-ooxml-odf.integration.test.js` § "poi-with-gif.docx -> odt — EXACT ledger, reader/writer split measured, output re-parses as odt" |
| the IR carries `escapes.docx.bytes` (6554-byte GIF, `contentType: 'image/gif'`) and the written odt carries them as its one `Pictures/image1.gif` part, byte-equal (convert, `docx → odt`) | `poi-with-gif.docx` | `tests/crossformat-ooxml-odf.integration.test.js` § "poi-with-gif.docx — the IR carries escapes.docx.bytes and the written odt carries them as its Pictures/image1.gif part" |
| the image reference survives `docx → md` but not `docx → odt → md`: the return leg records exactly `[{ code: 'image/unresolved', detail: 'draw:frame' }]` (the odt reader does not type the written frame) | `poi-with-gif.docx` | `tests/crossformat-ooxml-odf.integration.test.js` § "poi-with-gif.docx — the image reference survives docx->md but not docx->odt->md: the odt reader leaves the written frame unresolved" |
| `odt → docx` is **byte-reproducible**: two `convert` runs give byte-identical containers | `odt-structured.odt`, `odt-table.odt` | `tests/crossformat-ooxml-odf.integration.test.js` "odt -> docx: two convert runs are BYTE-identical" |
| `layout/line-overflow` (convert, `docx → pdf`) | `docx-structured.docx`, `docx-bulk.docx` | `tests/crossformat-to-pdf.integration.test.js` § "docx-structured.docx → pdf: 1 page, 2 reader + 2 writer losses" / § "docx-bulk.docx → pdf: MULTI-PAGE (24), one overflow + one block-clipped" |
| `layout/block-clipped`, and measured ABSENCE of `layout/table-scaled` (convert, `docx → pdf`) | `docx-bulk.docx` | `tests/crossformat-to-pdf.integration.test.js` § "docx-bulk.docx → pdf: MULTI-PAGE (24), one overflow + one block-clipped" |
| `layout/image-dropped`, `reason: 'unsupported-encoding'`, `format` key ABSENT for a GIF (convert, `docx → pdf`) | `poi-with-gif.docx` | `tests/crossformat-to-pdf.integration.test.js` § "the GIF branch fires: no /XObject on the page, no `Do` operator, `format` key ABSENT" |
| **no** `run/code-degraded` in any ledger of the `→ pdf` cross-format corpus (convert, `docx → pdf` / `odt → pdf`) | all 8 fixtures | `tests/crossformat-to-pdf.integration.test.js` § "the retired `run/code-degraded` code appears in NO ledger of this corpus" |
| owner acceptance: the `pdfBuilder.addImage` seam places identically through `convert(docx→pdf)` and direct `fromMd(...,'pdf')` — `losses: []` on both routes, byte-identical XObject and stream (convert, `docx → pdf`) | a 1-pixel JPEG asset placed via both routes | `tests/crossformat-to-pdf.integration.test.js` § "leg 7: OWNER ACCEPTANCE of the pdfBuilder.addImage seam" |

Fixtures converted with **zero** loss (regression guard — a change to any
of these is a real regression): `docx-smoke.docx` / `docx-bulk.docx`
(first-party) and `poi-table-alignment.docx` / `poi-with-gif.docx`
(real-world) for docx; `poi-simple-multicell.xlsx` for xlsx;
`poi-sampleshow.pptx` for pptx; `odp-structured.odp` WITH
`includeNotes:true` for odp; `odt-table.odt` for odt (zero loss since
the odt reader maps text-body tables). None of this is a claim that every document
in a given format converts losslessly — it is a claim that the SPECIFIC
vendored fixtures do, and a regression on any of them is real.

## See also

- [`docs/profile-v1.md`](./profile-v1.md) — the wire format this matrix
  applies to.
- [`../README.md`](../README.md) — package overview.
- [`docs/pdf-writer.md`](./pdf-writer.md) — the `md → pdf` options / loss-
  code / font-route reference.
- [`docs/convert.md`](./convert.md) — the `convert` facade member's
  signature, error order and worker message.
- `tests/crossformat-ooxml-odf.integration.test.js` /
  `tests/crossformat-to-pdf.integration.test.js` — the
  harnesses the § "Cross-format pairs" rows above are measured
  against.
- `tests/default-faces.integration.test.js` — the
  harness the default-face-tier evidence rows above are measured against,
  driven at the public `oconv.fromMd` facade with the real
  `@awacloud/oconv-fonts` pack.
