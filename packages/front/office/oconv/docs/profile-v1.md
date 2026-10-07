---
title: "@awacloud/oconv — structured-markdown profile v1"
---

# Structured-markdown profile v1

> Audience: on-prem/air-gap RAG integrators, sovereign-cloud teams, defence
> and regulated-sector engineers who ingest documents into a chunked,
> auditable index **inside their own perimeter**. This page is the wire
> contract: every key, why it exists for that audience, and what it does
> and does not promise. It is a reference for anything consuming
> `@awacloud/oconv`'s output, not just for `@awacloud/oconv` itself.
>
> **Prerequisites.** Producing a profile-v1 document takes `oconv.toMd` from
> the `@awacloud/oconv` main entry (registered on an `@awacloud/fw`
> `ModuleRuntime` — see the package README's Quick Start), in a browser or on
> the runtimes the package's `engines` field names (Bun ≥ 1.0, Node ≥ 20);
> `oconv.fromMd` accepts one back as input. Consuming one needs no oconv code
> at all: any YAML reader plus any CommonMark/GFM parser reads it.

A profile-v1 document is a literal YAML front-matter block followed by a
CommonMark/GFM body:

```yaml
---
profile: v1
ir: oconv-ir/v1
sourceFormat: docx
sourceName: report.docx
sourceBytes: 1556
sourceSha256: 7be541047cdb2255188fdf68ed6ddc98c47ed22332093df494dcb3f5c7f60b7c
convertedAt: 2026-07-20T00:00:00Z
converter: oconv
converterVersion: 1.0.0
engine: bun
blocks: 6
anchors:
  - { level: 1, anchor: sovereign-rag-ingestion }
  - { level: 2, anchor: why-air-gap-matters }
  - { level: 3, anchor: chunking }
lossy: true
losses:
  - { code: block/dropped, detail: footnote }
assets:
  - { kind: image, name: logo.png }
---
```

Every line through the `anchors:` list is what `toMd` emits for the package's own
`docx-smoke.docx` corpus fixture, called with that `convertedAt` and
`engine: 'bun'`. The `losses:` and `assets:` entries are added to show every
key: that fixture converts with an empty ledger and no image, so its real
front matter ends at `lossy: false`.

Every front-matter key below is emitted **exactly in this order** by
`src/write/ir-to-md.js` (`oconvIrToMd`); `anchors:`, `losses:` and
`assets:` are each omitted entirely when empty (never an empty `[]`).

## Key-by-key semantics

| Key | Meaning | Why this audience needs it |
|---|---|---|
| `profile` | Wire-profile version (`v1`), independent of `ir` | The RAG ingestion pipeline can pin its parser to a profile version even after the pivot evolves. |
| `ir` | The pivot IR version that produced this document (`oconv-ir/v1`) | Traceability to the exact internal model — useful when auditing a conversion discrepancy. |
| `sourceFormat` | `docx` \| `odt` \| `xlsx` \| `ods` \| `pptx` \| `odp` \| `pdf` | Which reader ran. |
| `sourceName` | Original file name | Human/audit trail back to the source document. |
| `sourceBytes` | Source byte length | A cheap sanity check alongside the hash. |
| `sourceSha256` | Lowercase hex SHA-256 of the **source** bytes | **Auditable**: pins the exact input a reviewer can re-fetch and re-hash. Computed by the facade via `crypto.subtle.digest` — no external hashing tool, no network. |
| `convertedAt` | ISO-8601 timestamp | **Always caller-injected, never `Date.now()`** — see Determinism below. |
| `converter` / `converterVersion` | Producer identity | Pins which version of `@awacloud/oconv` produced the file, for reproducing a conversion later. |
| `engine` | Host engine label (`bun`, `browser`, …) | Omitted entirely when the caller doesn't supply one — never invented. |
| `blocks` | Top-level IR block count | A structural checksum independent of exact text — catches gross truncation. |
| `anchors` | `{level, anchor}[]`, document order | **Chunkable**: a chunker splits on headings without re-parsing the markdown; citations can address `#anchor` stably. |
| `lossy` | `losses.length > 0` | A single boolean gate a pipeline can branch on ("flag lossy documents for human review"). |
| `losses` | `{code, detail}[]`, reader losses then writer losses, document order | **Honest**: losses the pipeline detects are recorded; the [loss matrix](./loss-matrix.md) lists the known silent cases — see Loss ledger below. Present only when `lossy: true`. |
| `assets` | `{kind, name, bytes?}[]`, deduplicated by name, document order | Image references extracted from the source; `bytes` travels by reference when the reader captured the image bytes: the same `Uint8Array`, never copied and never written into the front matter. The writer (`ir-to-md.js`) reads it from `escapes.docx.bytes`, the field the docx reader fills — the only reader that captures image bytes — so `bytes` is present for a docx image whose bytes resolved and absent for every other source. Measured on `poi-with-gif.docx`: one asset (`Grafik 1`) whose `bytes` is a 6554-byte `Uint8Array`, `lossy: false` (`tests/fidelity.integration.test.js`). Present only when the document has images. |

## Determinism and auditability

Two properties matter for a sovereign/air-gap offer, and both are structural
(not best-effort):

1. **`sourceSha256` pins the input.** A reviewer with the original file can
   recompute the hash and confirm the front matter describes THAT exact
   byte sequence.
2. **`convertedAt` is always caller-injected — never defaulted to
   `Date.now()`.** `src/oconv.js`'s `toMd` throws `oconv: convertedAt is
   required` when omitted. Consequence, verified by the fidelity harness:
   **converting the same bytes twice with the same `convertedAt` produces
   byte-identical markdown**, and changing only `convertedAt` changes
   **exactly that one front-matter line** — nothing else in the document
   shifts. This is the property an audit trail needs: a re-run is a diff,
   not a fresh unknown.

This determinism claim is scoped to the **to-md** direction, with two
from-md exceptions: the `.docx` and `.pdf` targets. The `.docx` target of
`fromMd` is byte-reproducible: `@awacloud/ooxml` stamps every zip entry with a
fixed 1980-01-01 00:00 timestamp, so two identical `fromMd(..., 'docx')` calls
on the same markdown produce byte-identical output —
`tests/roundtrip.integration.test.js` § "reproducibility — md -> docx is
byte-reproducible". The `.odt` target is not: the ODF package writer stamps
the current time, so two identical calls give equal document models but may
give different bytes; see [`docs/loss-matrix.md`](./loss-matrix.md)
"From-md reproducibility" for the full statement. The `.pdf` target IS
byte-reproducible: `irToPdf` never stamps a date or an `/ID`, so two
identical `fromMd(..., 'pdf')` calls on the same markdown produce
byte-identical output — `tests/roundtrip.integration.test.js` §
"reproducibility — md -> pdf is byte-reproducible".

## Chunking usage

`anchors:` is the section index a RAG ingestion pipeline chunks against:
split the body on `#`/`##`/… headings, and address each chunk by its
`#anchor` slug. Slugs are deterministic and ASCII-only by construction
(NFKD → strip combining marks → lowercase → `[^a-z0-9]+` → `-`, with a
`-1`, `-2` … collision suffix for duplicate headings) — safe for any
downstream index, URL, or filename. `anchors.length` equals the number of
`#`-heading lines the writer emits for real headings (headings inside a
GFM table cell are excluded on both sides — a cell renders inline-only, so
such a heading never becomes a `#`-line and is correctly un-indexed), but
this is **not an absolute count of `#`-prefixed lines in the body**: a
fenced code block can carry `#`-lines of its own. A source paragraph line
that itself begins with a literal `#` (e.g. `# Ligne FACT`) is escaped by
`@awacloud/md`'s Markdown renderer (`\# Ligne FACT`; likewise a line-leading `1.`, `1)`, `-`, `+`, `*` or `>`),
so it re-parses as paragraph text, never as a heading. Measured on
`facturx-minimum-sample.pdf`: its body used to carry 5 `#`-prefixed lines
against 0 headings; it now carries 0 against 0, and
`tests/fidelity.integration.test.js` includes that fixture in the
heading-count/anchor-count equality assertion again.

## Profile v1 as INPUT (`fromMd`)

`fromMd` accepts a profile-v1 document — or plain
CommonMark/GFM with no front matter at all — and writes a `.docx`, `.odt`
or `.pdf` container. The relationship with this profile is **read-only and
one-directional**: a leading front-matter fence (`---`/`+++`/`;;;`,
detected the same way `@awacloud/md`'s `mdFrontmatter.stripFrontmatter`
detects it on the `toMd` side) is **stripped before parsing**
(`src/read/md-to-ir.js`, composing `mdFrontmatter.stripFrontmatter` from
`@awacloud/md/extra/frontmatter.js` — never an `@awacloud/md` internal), and:

- it is **never parsed** — no YAML/TOML/JSON decoding of its content, by
  design (same "emit, never parse" stance the reader takes for the
  stripped block on the `toMd` write side, generalized to the read
  direction too);
- it is **recorded as a loss**, not a silent strip — one `{code:
  'frontmatter/stripped', detail: <lang>}` entry per document (`lang` is
  `'yaml'` \| `'toml'` \| `'json'`, matching the fence syntax), verified by
  `src/read/md-to-ir.test.js` for all three fence kinds and by
  `tests/roundtrip.integration.test.js` for a real `toMd`-produced profile
  document fed back in (`sourceSha256`/`converterVersion` and all) — a
  deliberate design decision, not a gap;
- it is **never written into the target container** — no `.docx`/`.odt`
  core-properties or custom-metadata part is populated from it. The target
  container's own fixed provenance is unrelated to it: none for `docx`,
  `meta:generator: '@awacloud/odf'` for `odt`, `/Producer` + `/Creator`
  `'@awacloud/oconv'` for `pdf` (see [convert.md](./convert.md#provenance-and-reproducibility)).
  `tests/roundtrip.integration.
  test.js`'s profile-v1 input leg confirms the front-matter text is absent
  from the produced docx body via `docxApi.toText(docxApi.read(bytes)
  .document)`.

In short: a profile-v1 document's front matter **describes a prior
conversion** (the `toMd` call that produced it) — it is provenance about
the PAST, not an instruction for the container `fromMd` is about to build,
and it does **not round-trip**. A document produced by `fromMd` carries no
`sourceSha256`/`convertedAt`/`losses` front matter of its own; if a caller
wants an audit trail for the from-md direction, it is their own
responsibility to keep one, `@awacloud/oconv` emits none.

## Loss ledger — codes in use

Losses are **data**, appended to `losses:` in document order (reader losses
lead, writer losses follow) — never a side-channel log line. A detected
loss is always recorded; a construct the pipeline cannot detect is not (the
[loss matrix](./loss-matrix.md) lists the known silent cases). `detail` is a
string on every reader code and on the `fromMd` reader and docx/odt writer
codes below; the `.pdf` typesetter's
`layout/*`, `text/unencodable` and `inline/*` codes carry an object `detail`
instead, and the per-block records among them also name the block's `index`
and `kind` beside `code`. The `fromMd` and `convert` facades return those
records unchanged, and so does the worker reply. Codes emitted by the seven
shipped readers and the `md` writer:

| Code | Meaning |
|---|---|
| `block/dropped` | An IR node (or a source element with no IR equivalent) could not be represented; `detail` names the source element/kind. |
| `link/target-missing` | A hyperlink run had no resolvable target; the visible text is kept, the link is not. |
| `list/numbering-unresolved` | The list's ordered-vs-bullet status could not be resolved (docx: no matching `numbering.xml` entry; odt: the list style falls outside the resolution scope below) — falls back to bullet. |
| `list/nesting-flattened` | (docx only) A nested list level (`ilvl > 0`) was flattened into its enclosing list — recorded once per document. |
| `heading/level-clamped` | (odt only) An `outlineLevel` above 6 was clamped to 6. |
| `heading/subtitle-degraded` | (docx only) A paragraph whose style is the built-in `Subtitle` (resolved by its `w:name` through `styles.xml`) was kept as a plain paragraph — no heading level is guessed for it; `detail` is the style ID, one record per subtitle paragraph. Pinned by `src/read/docx-to-ir.test.js`, including the committed French-styled fixture `docx-fr-styles.docx`. |
| `image/unresolved` | (odt only) An inline image reference could not be resolved through this reader's frozen dependency list. |
| `image/bytes-unavailable` | (docx only) A drawing's `r:embed` relationship never resolved to image bytes; `detail` names the drawing. Pinned by `src/read/docx-to-ir.test.js`. |
| `inline/dropped` | (odt only, this reader's own sense) An unmapped inline XML element inside a run; `detail` names the element. Same code name as the `fromMd` reader's `inline/dropped` below — a different domain, the same "unmapped node, kept as loss" shape. |
| `inline/flattened` | (odt only) An element inside a `<text:span>` (a field, a reference, a note) holds text: the text is kept as a plain run carrying the span's emphasis, the element's meaning is not; `detail` names the element. A frame holding text inside a span records `image/unresolved` instead, and an element holding no text records `inline/dropped` (or `image/unresolved` for a frame). |
| `run/format-unresolved` | (odt only) A `<text:span>` run's bold/italic/strike/monospace styling could not be resolved — the style falls outside the resolution scope below. |

**Read-side resolution scope for the two odt `*-unresolved` codes**: semantic
resolution covers `content.xml` automatic styles AND `styles.xml`
`office:styles` styles that are fully mapped (a single style, no
`style:parent-style-name` chain); monospace resolves only through a
declared fixed-pitch or generic-modern font face. Foreign documents styled
through parent chains or partially-mapped styles still yield
`run/format-unresolved` / `list/numbering-unresolved` on read — that is
why these two codes survive the tier-2 raise rather than being retired with
the four write-side codes below.

Remaining reader codes:

| Code | Meaning |
|---|---|
| `sheet/formula-as-value` | (xlsx/ods) A formula cell was reduced to its cached/computed value only. |
| `sheet/format-dropped` | (xlsx/ods) Recorded once per sheet, first styled cell seen. |
| `sheet/merge-dropped` | (xlsx/ods) Recorded once per sheet, first merged/spanned range seen. |
| `sheet/chart-dropped` | (xlsx/ods) Recorded once per sheet, first embedded chart/drawing seen. |
| `slides/untitled` | (pptx/odp) The slide carries no title placeholder/frame, or its only one has no non-empty text. |
| `slides/media-dropped` | (pptx/odp) A non-text shape/frame (picture, table, chart, image, object) was dropped at tier 1; `detail` names its kind. |
| `slides/notes-omitted` | (odp; documented no-op for pptx) The slide has speaker notes but `includeNotes` was `false` (the default). |
| `text/undecodable` | (pdf) ≥1 character code in a text run resolved to no Unicode — counted, never silently kept. |
| `text/font-unresolved` | (pdf) A show operator ran with no resolvable current font. |
| `text/width-approximated` | (pdf) A font's glyph widths could not be read from the font, so a declared fallback width (500/1000 em) placed its text — once per font resource per page, `detail` = the resource name. The text is kept; only the inferred word spaces around it are approximate. |
| `image/dropped` | (pdf, to-md) An image XObject draw or inline image, including one drawn inside a Form XObject — tier 1 keeps no images. Also emitted by the `fromMd` docx and odt writers (`detail` = the IR image's `name`), only when no bytes are reachable for the image (neither `opts.assets[name]` nor the docx reader's `escapes.docx.bytes`) — when bytes are reachable the writer embeds the image and records `image/size-defaulted` instead (odt: in a default 5.08cm × 3.81cm (2 in × 1.5 in) frame). |
| `xobject/form-dropped` | (pdf) A Form XObject's stream could not be used (not a stream, undecodable, unparsable), so its text is not extracted; `detail` = `<name>: <reason>`. A usable form is executed in place and records nothing. |
| `xobject/form-cycle` | (pdf) A Form XObject drawn from inside itself, directly or through other forms, was not re-entered; `detail` = the resource name. |
| `xobject/form-depth` | (pdf) A Form XObject that would nest deeper than 12 forms was not executed; `detail` = the resource name. |
| `xobject/form-budget` | (pdf) A page ran a budget of `formOpBudget` operators inside Form XObjects (default 1,000,000, configurable through the `toMd` `formOpBudget` input); its later form draws were not executed. Recorded once per page; `detail` = the first skipped resource name. |
| `content/undecodable` | (pdf) A content stream failed to resolve, decode or parse and was skipped; `detail` is `stream <objNum>: <cause>`, the cause being the thrown error's message collapsed to one line and capped at 160 characters. |
| `struct/dropped` | (pdf, tagged fast path) A `Table`/`L` struct container was flattened; its descendant text is kept as paragraphs. |

`xobject/form-dropped`, `xobject/form-cycle`, `xobject/form-depth`,
`xobject/form-budget`, `content/undecodable`, `text/font-unresolved` and
`text/width-approximated` are each pinned by a dedicated producing test,
`src/read/pdf/text-extract.test.js`.

Codes emitted by the `fromMd` reader (`src/read/md-to-ir.js`) and the
**three** `fromMd` writers (`src/write/ir-to-docx.js`,
`src/write/ir-to-odt.js`, and `src/write/ir-to-pdf.js` + its
`src/write/pdf/*` typesetting-layer modules):

| Code | Meaning |
|---|---|
| `frontmatter/stripped` | A leading `---`/`+++`/`;;;` front-matter fence was stripped before parsing — never parsed, never carried into the target container; `detail` names the fence language (`yaml`/`toml`/`json`). See "Profile v1 as INPUT" above. |
| `list/start-dropped` | An ordered list started above 1; the IR `list` node has no start prop to carry it. |
| `list/task-marker-dropped` | A GFM task-list checkbox (`[x]`/`[ ]`) was stripped from a list item. |
| `table/align-dropped` | A GFM table declared column alignment; the IR `row`/`cell` model carries none. |
| `inline/linebreak-degraded` | A hard line break (trailing double space or backslash) degraded to a single space. |
| `inline/dropped` | An unmapped inline node kind (`detail` = its type, e.g. `html_inline`), or a non-empty link title (`detail: 'link-title'` — the link text/target are kept). Same code name as the odt reader's own `inline/dropped` above — a different domain, the same "unmapped node, kept as loss" shape. |
| `list/depth-clamped` | (docx target) A list nested deeper than `ilvl` 8 was clamped to 8. |
| `block/degraded` | (docx and odt targets) A code block (`detail: 'codeBlock'`), a blockquote (`detail: 'blockquote'`), or — docx only — a non-paragraph/non-list block inside a list item (`detail: 'listItem-child:<kind>'`) was written in a structurally simpler form. |
| `image/size-defaulted` | (docx and odt targets) Image bytes WERE reachable and the image is PLACED at a default box — `@awacloud/ooxml`'s 2 in × 4:3 box for docx, a 5.08cm × 3.81cm (2 in × 1.5 in) frame for odt. Neither writer applies the image's intrinsic size; `detail` names the image. A degrade, never a drop. |

The `.pdf` target's bounded typesetter (`src/write/ir-to-pdf.js` +
`src/write/pdf/*`) emits its own vocabulary — 10 `layout/*` codes,
`text/unencodable` and 2 `inline/*` codes — the full options/font-route
context for each lives in [`docs/pdf-writer.md`](./pdf-writer.md); this
table states only the vocabulary:

| Code | Meaning |
|---|---|
| `layout/unhandled-block` | An IR block kind the typesetter has no delegate for was skipped entirely. |
| `layout/font-fallback` | A style class had no explicit AND no default-face bytes on a mixed/embedded font call — fell back to Standard 14 for that class. |
| `layout/s14-variant-metrics-approx` | DEFENSIVE FALLBACK — fires only if the fonts package regresses to a shared width table across the four Standard 14 variants; not reachable against the real `@awacloud/fonts`, whose Standard 14 tables give each variant its own widths (only a stubbed measurer reaches it, `src/write/ir-to-pdf.test.js`). |
| `text/unencodable` | Route-conditional: a non-WinAnsi code point degrades to `?` on the Standard 14 route; a code point missing from the resolved face's own `cmap` draws `.notdef` on the explicit/default-face route — one collapsed record per document. |
| `layout/line-overflow` | An unbreakable token (or an overlong code line) wider than the column overflowed it. |
| `layout/image-dropped` | An image was not placed — a non-JPEG encoding or a CMYK/YCCK JPEG (`reason: 'unsupported-encoding'`), or no bytes at all (`reason: 'no-bytes'`); the `[image: <alt>]` placeholder still draws. |
| `layout/list-empty` | A `list` node had no `listItem` child. |
| `layout/table-empty` | A `table` node had zero rows, or zero rows left after the header row. |
| `layout/table-scaled` | A table (or a cell) wider than the column was scaled proportionally to fit. |
| `layout/table-clipped` | A table (or cell) stayed too narrow even at minimum width. |
| `layout/block-clipped` | A block taller than one page was clipped at the page bottom — a hard page break; the typesetter never splits a block across pages. |
| `inline/strike-dropped` | A text block carried at least one struck run; the typesetter draws no strikethrough rule, so the text is drawn plain. One record per block, `detail` = `{ runs, text }` (the number of struck runs and the first one's text, up to 40 characters). Recorded, not rendered. |
| `inline/code-emphasis-dropped` | A text block carried at least one monospace run that is also bold or italic; the monospace class wins and the emphasis is not drawn. One record per block, `detail` = `{ runs, text }`. Recorded, not rendered. |

### Retired codes (odt target)

Four `(odt target only)` codes shipped in earlier ledgers and are
**retired**: `@awacloud/odf` gained a typed semantic write model, so
`src/write/ir-to-odt.js` now writes every
construct they used to record as lost, and `md→odt` reaches tier 2. They
are listed here — not silently deleted — because documents converted before
the retirement carry them in their `losses:` front matter, and a consumer reading
an archived profile-v1 document must still be able to look them up.

| Retired code | What it meant | Now |
|---|---|---|
| `run/format-unwritable` | A run's bold/italic/strike/code flags could not be written — no run-emphasis vocabulary in the typed model; `detail` was the flags as a csv. | Written as a typed `span` (`code` → `monospace`), no loss. |
| `link/target-unwritable` | A run's link target could not be written — no `text:a` node in the public render dispatch; the link text was kept, `detail` was the dropped target. | Written as a typed `link` run → `text:a`, no loss. |
| `list/ordered-unwritable` | An ordered list was written as a generic, unstyled list — no ordered/bulleted flag in the typed model. | Written with `ordered:true` + `numFormat:'1'`, no loss. |
| `block/table-degraded` | A table was written as tab-joined row paragraphs — no text-body table render case; `detail` was `<rows>x<cols>`. | Written as a typed `table`/`row`/`cell` with `headerRows`, no loss. |

Proof of retirement: `src/write/ir-to-odt.test.js` § "exhaustive absence of
the four retired loss codes", and `tests/roundtrip.integration.test.js`
leg 4 (`md-structural.md` → odt with an EMPTY ledger).

### Retired code (docx target)

`run/code-degraded` shipped in earlier ledgers and is **retired**:
`@awacloud/ooxml` round-trips `rPr.font` through `<w:rFonts>`
(`ooxml/src/docx/properties.js`), so `src/write/ir-to-docx.js` now writes
`font: 'Courier New'` for a code run and `src/read/docx-to-ir.js` reads it
back via a frozen monospace name allowlist — `md → docx → md` keeps inline
code as backticks. Listed here — not silently deleted — because documents
converted before the retirement carry the code in their `losses:` front matter.

| Retired code | What it meant | Now |
|---|---|---|
| `run/code-degraded` | (docx target) An inline-code run was written as a plain run — formatting dropped, text kept; `detail` was the first 40 chars of the run text. | Written with `rPr.font: 'Courier New'`, no loss. |

Proof of retirement: `src/write/ir-to-docx.test.js` § "exhaustive absence
of run/code-degraded", and `tests/roundtrip.integration.test.js` leg 1
(`md-structural.md` → docx → md, empty `fromMd` ledger, backticks
recovered).

The full preserved/degraded/dropped picture per pair is
[`docs/loss-matrix.md`](./loss-matrix.md) — this table is the vocabulary,
that page is the coverage claim.

## Zero network, zero external tooling

Nothing in the reader → pivot IR → writer path performs I/O, touches the
network, or shells out to an external tool. The Web APIs used beyond
plain ES are `crypto.subtle.digest` (source hashing, `toMd` only) and
`performance.now()` (call-duration timing — `src/oconv.js`, `src/worker.js`)
— available in a browser tab, in Bun, and inside a Worker alike. This is a hard property
for an air-gapped deployment, not a soft goal: `bun test
packages/front/office/oconv/` runs the whole suite, including the fidelity
harness, with no network access.

## Versioning

`profile` and `ir` are independent keys on purpose: the wire profile can
stay `v1` across pivot IR revisions (`oconv-ir/v1` → `v2` → …) as long as
the front-matter/body contract itself does not change; a profile-breaking
change gets its own `profile: v2`.

## See also

- [`docs/loss-matrix.md`](./loss-matrix.md) — per-pair fidelity coverage.
- [`../README.md`](../README.md) — package overview, Quick Start, worker
  usage.
- `src/write/ir-to-md.js` — the writer this page documents (its own
  file-header JSDoc is the profile's original, code-adjacent spec).
