# @awacloud/oconv

Convert office documents in plain JavaScript: DOCX, ODT, XLSX, ODS, PPTX, ODP and PDF to structured Markdown, Markdown to DOCX, ODT or PDF, with a loss ledger returned by every call.

Document conversion in plain JavaScript, through one versioned pivot
representation (`oconv-ir/v2`). `toMd` turns a `.docx`, `.odt`, `.xlsx`,
`.ods`, `.pptx`, `.odp` or `.pdf` document into a structured-markdown profile
built for retrieval pipelines; `fromMd` writes Markdown back out as `.docx`,
`.odt` or `.pdf`; `convert` goes document to document for four pairs
(`docx → odt`, `odt → docx`, `docx → pdf`, `odt → pdf`) with no Markdown
step. Every call returns a machine-readable loss ledger. The losses the
pipeline detects are recorded; the known silent cases are listed in the
[loss matrix](./docs/loss-matrix.md).

No network access, no external tool, no bundler. Its only runtime
dependencies are
[`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/oconv@2.0.0/packages/front/fw)
and the office packages it composes:
[`@awacloud/ooxml`](https://github.com/awacloud/awa/tree/@awacloud/oconv@2.0.0/packages/front/office/ooxml),
[`@awacloud/odf`](https://github.com/awacloud/awa/tree/@awacloud/oconv@2.0.0/packages/front/office/odf),
[`@awacloud/md`](https://github.com/awacloud/awa/tree/@awacloud/oconv@2.0.0/packages/front/office/md),
[`@awacloud/pdf`](https://github.com/awacloud/awa/tree/@awacloud/oconv@2.0.0/packages/front/office/pdf)
and
[`@awacloud/fonts`](https://github.com/awacloud/awa/tree/@awacloud/oconv@2.0.0/packages/front/office/fonts).

Bounds, stated up front: `fromMd` is structural only (one fixed built-in style
set per target, never caller styling); `pdf → md` reads the text layer
(pictures only on request, no scanned pages, no OCR); `md → pdf` is a bounded
typesetter (one page size per document, one column, greedy line breaking, no
hyphenation, no justification, no table splitting). The [loss matrix](./docs/loss-matrix.md) gives the
Preserved / Degraded / Dropped breakdown for every pair.

## Installation

```bash
npm install @awacloud/oconv
```

In the browser, via an import map that covers every package the converter
loads, sub-path imports of `@awacloud/md` and `@awacloud/fonts` included:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw/":     "/node_modules/@awacloud/fw/src/",
    "@awacloud/md":      "/node_modules/@awacloud/md/src/main.js",
    "@awacloud/md/":     "/node_modules/@awacloud/md/src/",
    "@awacloud/ooxml":   "/node_modules/@awacloud/ooxml/src/main.js",
    "@awacloud/odf":     "/node_modules/@awacloud/odf/src/main.js",
    "@awacloud/pdf":     "/node_modules/@awacloud/pdf/src/main.js",
    "@awacloud/fonts":   "/node_modules/@awacloud/fonts/src/main.js",
    "@awacloud/fonts/":  "/node_modules/@awacloud/fonts/src/",
    "@awacloud/oconv":   "/node_modules/@awacloud/oconv/src/main.js",
    "@awacloud/oconv/":  "/node_modules/@awacloud/oconv/"
}}
</script>
```

The worker needs no import map at all: `src/worker.js` is a self-contained
bundle (see [Worker usage](#worker-usage)), so a page serving the package's
`src/` at `/vendor/oconv/` starts it as `/vendor/oconv/worker.js`, the file
the `@awacloud/oconv/worker.js` specifier names under an `exports`-aware
resolver.

## Quick Start

Register the package's modules in an `@awacloud/fw` `ModuleRuntime`, resolve
the `oconv` facade, and call it:

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');

// Document -> structured Markdown.
const result = await oconv.toMd({
    name: 'report.docx',
    bytes: docxBytes,                        // Uint8Array
    convertedAt: '2026-01-01T00:00:00Z'      // required, never defaulted
});
console.log(result.markdown);   // front matter + CommonMark/GFM body
console.log(result.anchors);    // [{ level, anchor }, ...], the heading index
console.log(result.lossy);      // boolean
console.log(result.losses);     // [{ code, detail }, ...]
```

```js
// Markdown -> .docx, .odt or .pdf.
const written = await oconv.fromMd({
    markdown: '# Report\n\nSome **bold** text.\n',
    target: 'docx'                // 'docx' | 'odt' | 'pdf'
});
console.log(written.bytes);     // Uint8Array, the .docx container
console.log(written.target);    // 'docx'
console.log(written.losses);    // [{ code, detail }, ...]
```

```js
// Document -> document, no Markdown step.
const odt = await oconv.convert({
    bytes: docxBytes,             // Uint8Array, required
    name: 'report.docx',          // optional; its extension gives the source format
    target: 'odt'                 // required, never derived from `name`
});
console.log(odt.bytes);         // Uint8Array, the .odt container
console.log(odt.format);        // 'docx', the resolved source format
console.log(odt.losses);        // reader losses, then writer losses
```

`toMd`, `fromMd` and `convert` are the facade's only members. The
[getting-started guide](./docs/guide/getting-started.md) walks through the
same three calls; [`docs/api/oconv.md`](./docs/api/oconv.md) lists every
input field and error.

## Structured Markdown output

`toMd` emits the structured-markdown profile v1: literal YAML front matter
(source provenance, a SHA-256 of the source bytes, the caller's
`convertedAt`), a deterministic ASCII heading-anchor index for chunking, GFM
tables, an asset manifest and the loss ledger. `convertedAt` is required and
never defaults to the clock, so two calls on the same bytes produce the same
Markdown byte for byte. [`docs/profile-v1.md`](./docs/profile-v1.md) is the
full wire contract. The asset manifest carries the bytes of the pictures a
docx, odt or pptx source holds (a pptx picture named `image<k>.<ext>` per
distinct picture of the deck); a pdf's, on request (`pdfInclude`, below).

The source format comes from `name`'s extension (`.docx`, `.odt`, `.xlsx`,
`.ods`, `.pptx`, `.odp`, `.pdf`, case-insensitive) unless `format` is given;
an unresolved format throws `oconv: unsupported format`. These reader
options exist:

- `includeNotes` (boolean, default `false`, `pptx` / `odp`): renders speaker
  notes as a trailing blockquote per slide instead of recording a
  `slides/notes-omitted` loss. It has no effect on `pptx`, whose reader
  never receives speaker notes from `@awacloud/ooxml`.
- `formOpBudget` (`pdf` only): the per-page operator budget for Form
  XObjects, default `1000000`. It must be a safe integer of at least 1, else
  `oconv: bad form op budget`; passing it for another format throws
  `oconv: form op budget needs format pdf`.
- `pdfInfer` (`pdf` only): inference on an untagged PDF. Not given, it is
  `['headings', 'tables']`; `[]` reads the text-first way, without
  inference. `['headings']` turns a short line set larger than the
  body text, or a short line set wholly in bold, into a Markdown heading,
  its level ranked by size; `['tables']` reads a table drawn with rules
  (a grid of crossing lines) and a block of lines whose short pieces align
  in columns (measured on opendataloader-bench: overall 0.5754 without inference,
  0.8370 with both). `['running']` leaves out a running header or footer: a
  line near the top or bottom of the page whose text, page numbers
  aside, recurs at the same height on half the pages (3 pages or more),
  recorded `text/running-dropped`. A tagged PDF keeps its own structure.
  An unknown or repeated name throws `oconv: bad pdf infer`; passing it for
  another format throws `oconv: pdf infer needs format pdf`.
- `pdfDeclare` (`pdf` only, opt-in): records what the pdf reader otherwise
  does silently. `['positional']` adds one `struct/positional` loss when
  an untagged PDF's structure was built from the text's positions (the
  detail names it: `paragraphs`, plus `headings` and `tables` under
  `pdfInfer`), so such a read is `lossy`. An unknown or repeated name
  throws `oconv: bad pdf declare`; passing it for another format throws
  `oconv: pdf declare needs format pdf`.
- `pdfInclude` (`pdf` only, opt-in): brings back parts the pdf reader
  otherwise drops. `['images']` places each JPEG or JPEG 2000 (JP2)
  picture, and each grey, RGB or indexed raw-pixel one written as a PNG
  (its soft mask as alpha, an ICC profile kept), where it is drawn, as a
  Markdown image (`image-<obj>.jpg` / `.jp2` / `.png`) whose bytes come
  back in `assets`; a mask that cannot be applied — a JPEG's, a stencil —
  is recorded (`image/mask-dropped`), and every other picture (CMYK, fax,
  JBIG2, an inline image) is still dropped (`image/dropped`). On a tagged
  PDF a picture stands with the struct element that lists it. An unknown
  or repeated name throws `oconv: bad pdf include`; passing it for another
  format throws `oconv: pdf include needs format pdf`.
- `pdfPassword` (`pdf` only): the user or owner password (a string or
  bytes) that opens an encrypted PDF, RC4 (V1 / V2) files included (oconv
  passes pdf's read-only `pdfLegacyRc4Read` to every pdf read). Without it
  the empty password is tried: a PDF it opens converts, recorded
  `pdf/opened-with-empty-user-password` (its detail the permission bits),
  and one it does not open throws `pdf/document/encrypted`; a wrong
  `pdfPassword` throws `pdf/document/bad-password`. Passing it for another
  format throws `oconv: pdf password needs format pdf`.
- `pdfEmptyPassword` (`pdf` only): `false` refuses every encrypted PDF read
  with no `pdfPassword` (`pdf/document/encrypted`), as 1.x did; `true` is
  the default; another value throws `oconv: bad pdf empty password`, and
  passing it for another format throws
  `oconv: pdf empty password needs format pdf`.
- `pdfLineHyphens` (`pdf` only, opt-in): `'drop'` or `'keep'`. A word a
  hyphen cuts at a line end comes out `infor- mation` by default (a soft
  hyphen always joins); `'drop'` joins it without the hyphen
  (`information`, though a compound cut at its own hyphen loses it),
  `'keep'` with it (`infor-mation`, `well-known`). Another value throws
  `oconv: bad pdf line hyphens`; passing it for another format throws
  `oconv: pdf line hyphens needs format pdf`.
- `pdfRecoverXref` (`pdf` only): the PDF reader rebuilds a cross-reference
  chain it cannot use (a damaged or truncated file) from the file's object
  definitions by default; `false` reads strictly, the chain's error
  thrown; `true` is the default; another value
  throws `oconv: bad pdf recover xref`, and passing it for another format
  throws `oconv: pdf recover xref needs format pdf`. The rebuild is not
  recorded in the ledger: `toMd` does not forward the PDF reader's own
  losses (a known silent case, listed in the
  [loss matrix](./docs/loss-matrix.md#known-silent-cases)).
- `odtInclude` (`odt` only, opt-in): brings back parts the odt reader
  otherwise drops. `['toc']` reads a table of contents' entries (and its
  title) as paragraphs at its place, as the document shows them, page
  numbers included and links not; without it the table of contents is
  dropped (`block/dropped`). An unknown or repeated name throws
  `oconv: bad odt include`; passing it for another format throws
  `oconv: odt include needs format odt`.
- `docxInclude` (`docx` only, opt-in): the same for a docx. `['toc']`
  reads a table of contents control's entries as paragraphs at its place,
  as the document shows them, page numbers included and links not;
  without it the control is dropped (`block/dropped`, detail `toc`). An
  unknown or repeated name throws `oconv: bad docx include`; passing it
  for another format throws `oconv: docx include needs format docx`.
- `sheets` (`xlsx` and `ods`, opt-in): `'table'` (the default) writes each
  sheet as a GFM table; `'csv'` or `'tsv'` as one fenced `csv` / `tsv` block
  under the sheet's heading — on a dense sheet a pipe table can weigh more
  than its source, a CSV block a fraction of it. csv quotes per RFC 4180;
  tsv escapes a cell's backslash, tab and line breaks (`sheet/tsv-escaped`).
  Another value throws `oconv: bad sheets`; passing it for another format
  throws `oconv: sheets needs format xlsx or ods`.
- `sheetCellBudget` (`xlsx` and `ods`): a positive safe integer,
  **5,000,000 by default** (since 2.0.0; `Number.MAX_SAFE_INTEGER` pads
  every sheet as 1.x did). A sheet whose padded table would hold more cells — one very wide row
  pads every other row to its width — is written unpadded instead: one
  `<A1 address>: <text>` line per value (its rows unpadded under `sheets`
  `'csv'` / `'tsv'`), recorded `sheet/sparse-form`. Another value throws
  `oconv: bad cell budget`; passing it for another format throws
  `oconv: sheet cell budget needs format xlsx or ods`.
- `outputBudget` (every format): `{ bytes, overflow }`, **256 MiB
  `'throw'` by default** (since 2.0.0; a missing `bytes` takes 256 MiB;
  `bytes: Number.MAX_SAFE_INTEGER` renders as 1.x did). After the read, the
  UTF-8 size of the document's text (the markdown adds its syntax on top)
  is compared with `bytes`, a positive safe integer, before
  any markdown is built, so a small file that expands to gigabytes of text
  fails fast instead of running out of memory. Past it, `overflow`
  `'throw'` (the default) throws `oconv: output too large`; `'truncate'`
  keeps the leading blocks (and a crossing table's leading rows) that fit
  and records `doc/truncated`. Another shape throws `oconv: bad output
  budget`. The bound is `irToMd`'s (`opts.outputBudget`), so a caller of
  the renderer, oview's copy among them, takes it too.
- `archiveLimits` (office formats, opt-in): `{ maxParts, maxUncompressed,
  maxRatio, maxDepth }`, any of them, passed to the docx, xlsx, pptx,
  odt, ods or odp reader. A large deck or a workbook that inflates past
  256 MiB is refused by the readers' defaults; this raises (or lowers)
  them per call, `0` disabling a check. The ODF readers take the first
  three. A key or value that is not one of these non-negative safe
  integers throws `oconv: bad archive limits`; passing it for a pdf throws
  `oconv: archive limits need an office source`.

One writer option exists, `opts.frontMatter`: `'full'` (the default),
`'compact'` (the loss ledger with one counted line per code and detail —
a long document's front matter shrinks by an order of magnitude) or
`'none'` (the Markdown body alone; the result's `anchors`, `losses` and
`assets` stand in for it). Any other value throws `oconv: bad front
matter`.

The `.odt` reader resolves run and list formatting from automatic styles and
from named styles that are fully mapped (a single style, no parent-style
chain); monospace resolves only through a fixed-pitch or generic-modern font
face. A foreign `.odt` styled through parent chains or partially mapped
styles still yields `run/format-unresolved` or `list/numbering-unresolved`.

## Writing documents from Markdown

`fromMd` accepts structured Markdown (profile v1) or plain CommonMark/GFM.
The target comes from `target`, else from `name`'s extension. Each target
carries one fixed, built-in style set and no caller styling:

- `docx`: `Normal`, `Heading1` to `Heading6`, `SourceCode` (code blocks),
  `BlockText` (quotes), `HorizontalRule` (thematic breaks) and the
  `TableGrid` table style; tables are bordered and padded. Reading a docx
  back maps those paragraph styles to a code block, a quote and a rule.
- `odt`: `Standard`, `Text body`, `Heading`, `Heading 1` to `Heading 6`,
  `Preformatted Text` (code blocks), `Quotations` (quotes) and `Horizontal
  Line` (thematic breaks) — LibreOffice's own names; tables are bordered.
  Reading an odt back maps those three paragraph styles to a code block, a
  quote and a rule.
- `pdf`: the bounded typesetter. `opts.pdf` sets page size, margin, type
  sizes, page numbers and embedded font programs;
  [`docs/pdf-writer.md`](./docs/pdf-writer.md) is the option, font-route and
  loss-code reference.

```js
// The pdf target with no options: Standard 14 fonts, nothing embedded.
const pdf = await oconv.fromMd({
    markdown: '# Report\n\nSome **bold** text.\n',
    target: 'pdf'
});
console.log(pdf.bytes);         // Uint8Array, the .pdf bytes

// With options (see docs/pdf-writer.md for the full table).
const letter = await oconv.fromMd({
    markdown: '# Report\n\nSome **bold** text.\n',
    target: 'pdf',
    opts: { pdf: { pageSize: 'Letter', pageNumbers: false } }
});
console.log(letter.losses);     // []
```

A GFM task-list item (`- [x] done`, `- [ ] todo`) keeps its checkbox. `docx`
and `odt` write it as a leading `☒ ` / `☐ ` run of the item's first paragraph,
with no loss. `pdf` draws the glyph only when the regular face covers it,
which neither the Standard 14 faces nor the Liberation pack do, so there the
writer records `list/task-marker-dropped`, once per item. `toMd` writes
`[x]` / `[ ]` back from an item that came from Markdown; read back from a
`docx` or `odt`, the item carries the `☒` / `☐` text instead.

Images come in through `assets`, which maps a Markdown image destination,
exactly as written (`![Diagram](<my diagram.jpg>)` is the key
`my diagram.jpg`), to its encoded bytes. Nothing is fetched; caller bytes win
over any the reader carried; a key no image references is ignored:

```js
const illustrated = await oconv.fromMd({
    markdown: '# Report\n\n![Diagram](diagram.jpg)\n',
    target: 'pdf',
    assets: { 'diagram.jpg': jpegBytes }   // Uint8Array
});
console.log(illustrated.losses);   // [], the JPEG was placed
```

What happens next depends on the target, and the ledger says which:

- `docx` places the image at its own size, read from its header (PNG,
  JPEG or GIF; 96 dpi when the file states none; scaled down to fit
  6 in × 8 in), with its alt text as the picture description. A header it
  cannot read gives `@awacloud/ooxml`'s default 2 in × 4:3 box and records
  `image/size-defaulted`.
- `pdf` places JPEG with 1 or 3 colour components and non-interlaced PNG
  (alpha and `tRNS` transparency as a soft mask). An interlaced or
  malformed PNG, CMYK JPEG and every other encoding are refused with
  `layout/image-dropped`, `reason: 'unsupported-encoding'` and a `format`
  when it can be named (see
  [`docs/pdf-writer.md`](./docs/pdf-writer.md#images)).
- `odt` places an image whose bytes are reachable (a caller `assets` entry, or
  bytes the reader carried) as a `Pictures/` part in an inline frame sized
  by the same rule as docx, its alt text as the frame title (a header it
  cannot read gives a 2 in × 1.5 in frame and records
  `image/size-defaulted`). With no bytes it keeps the image's place as an
  empty frame in that default box (`image/placeholder`). Read back through
  `toMd`, the frame surfaces as an image asset with its bytes (none for an
  empty frame), its alt text and its name (the frame's `draw:name`, unique
  per document).

`assets` must be a non-null, non-array object of `Uint8Array` values, else
`fromMd` throws `oconv: bad assets`.

Provenance differs by target. A `.docx` carries no document-properties part
at all. A `.odt` always carries `meta:generator: '@awacloud/odf'` in
`meta.xml`. A `.pdf` always carries `/Producer` and `/Creator`, both
`'@awacloud/oconv'`. Every target is byte-reproducible: two identical calls
give byte-identical bytes. `@awacloud/ooxml` and `@awacloud/odf` stamp every
zip entry of a `.docx` and an `.odt` with a fixed 1980-01-01 00:00 timestamp,
and the `.pdf` target writes no date, its `/ID` derived from the written
bytes.

## Cross-format conversion

`convert` runs a reader and a writer back to back, the same ones `toMd` and
`fromMd` use, for exactly four pairs: `docx → odt`, `odt → docx`,
`docx → pdf` and `odt → pdf`. Any other pair throws
`oconv: unsupported pair`. The `→ pdf` pairs take the same `opts.pdf` as
`fromMd`.

A pair's fidelity is the composition of the reader's row and the writer's row
in the [loss matrix](./docs/loss-matrix.md). [`docs/convert.md`](./docs/convert.md)
covers the signature, the error order and the worker message.

## Default fonts for PDF output

With no `opts.pdf.fonts`, the pdf writer uses the Standard 14 fonts (WinAnsi
text only). Registering the optional
[`@awacloud/oconv-fonts`](https://github.com/awacloud/awa/tree/@awacloud/oconv@2.0.0/packages/front/office/oconv-fonts)
pack switches every style class you did not supply to embedded Liberation
faces. This package never imports the pack and does not list it as a
dependency; the writer finds it by the module name `oconvDefaultFaces`.
Register it before the first `resolve('oconv')` on that runtime:

```js
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const facesRuntime = new ModuleRuntime();
facesRuntime.registerAll(fw_require);
await registerDefaultFaces(facesRuntime);
facesRuntime.registerAll(modules);
const oconvWithFaces = facesRuntime.resolve('oconv');

const unicode = await oconvWithFaces.fromMd({
    markdown: '# Rapport\n\nCafé, déjà vu, Привет.\n',
    target: 'pdf'
});
console.log(unicode.losses);    // [], no font fallback, nothing unencodable
```

An explicit `opts.pdf.fonts[class]` still wins over the pack, per style class.
[`docs/pdf-writer.md`](./docs/pdf-writer.md) explains the precedence and the
covered Unicode ranges.

## Worker usage

`src/worker.js` runs the same conversions off the main thread, one
conversion per message. It is a self-contained bundle of its
source, `src/worker/entry.js`, built by `bun run gen:worker`: it imports
nothing, so it starts in a static page (a module worker has no import map)
and under Bun or Node alike. Load it by its specifier, or by its real path
(`/vendor/oconv/worker.js` when the package's `src/` is served at
`/vendor/oconv/`). Errors come back as data:
`error` is a string on failure and `null` on success, never an exception
thrown across the boundary.

```js
const worker = new Worker(
    import.meta.resolve('@awacloud/oconv/worker.js'),
    { type: 'module' }
);

worker.onmessage = (ev) => {
    const { id, ms, error, warnings, losses } = ev.data;
    // toMd replies add `chars` and `markdown`; fromMd and convert replies add `bytes`.
    // `losses` is the loss ledger itself, the same `{ code, detail }` records the
    // facade returns (`[]` on error); `warnings` is its length.
    console.log(id, error, warnings, losses.map((loss) => loss.code));
};

// toMd: bytes plus `at`, the conversion timestamp. Transfer a copy.
const buffer = docxBytes.slice().buffer;
worker.postMessage(
    { id: 1, name: 'report.docx', bytes: buffer, at: '2026-01-01T00:00:00Z' },
    [buffer]
);

// fromMd: any message carrying a `markdown` string.
worker.postMessage({ id: 2, markdown: '# Report\n', target: 'docx' });

// convert: bytes plus a `target`, and no `markdown`.
const source = docxBytes.slice().buffer;
worker.postMessage({ id: 3, name: 'report.docx', bytes: source, target: 'odt' }, [source]);
```

`opts` (including `opts.pdf`) crosses the boundary on the `fromMd` and
`convert` messages, forwarded only when the message carries the key. A
registered `oconvDefaultFaces` pack does not cross: its descriptor holds its
bytes inside its factory. The host resolves them on its own thread and posts
the byte map as a separate `defaultFaces` field:

```js
const defaultFaces = facesRuntime.resolve('oconvDefaultFaces').defaultFaces();
worker.postMessage({
    id: 4,
    markdown: '# Rapport\n\nCafé.\n',
    target: 'pdf',
    opts: { pdf: { pageNumbers: false } },
    defaultFaces
});
```

[`docs/api/worker.md`](./docs/api/worker.md) lists the three message
envelopes and their replies.

## Source layout

- [`src/ir/`](./src/ir): the pivot representation `oconv-ir/v2` and its
  validator. It imports nothing.
- [`src/read/`](./src/read): one reader per source format, each composing one
  office package's public API (`@awacloud/ooxml`, `@awacloud/odf`,
  `@awacloud/pdf` with `@awacloud/fonts`), plus the Markdown reader behind
  `fromMd`. A capability that public API does not expose becomes a recorded
  loss, never a reach into package internals.
- [`src/read/pdf/`](./src/read/pdf): the pdf reader's text extraction, font
  decoding and tagged-structure walk.
- [`src/write/`](./src/write): the profile v1 Markdown writer (an
  `@awacloud/md` syntax tree, never hand-built Markdown text) and the
  `.docx`, `.odt` and `.pdf` writers. The `.docx` and `.odt` writers go
  through the typed write models of `@awacloud/ooxml` and `@awacloud/odf` and
  never author XML by hand.
- [`src/write/pdf/`](./src/write/pdf): the typesetter's option validation,
  font metrics, line breaking, page stacking and one renderer per block kind.
- [`src/oconv.js`](./src/oconv.js): the facade.
- [`src/worker/entry.js`](./src/worker/entry.js): the worker's source;
  [`src/worker.js`](./src/worker.js) is its generated bundle
  (`tools/generate-worker.mjs`).
- [`src/main.js`](./src/main.js): the module manifest.

The test suite runs from the repository root with
`bun test packages/front/office/oconv/`. Its corpus is vendored in the
repository under the package's `tests/_fixtures/corpus/`: documents generated
by each office package's own writer, plus real-world `.docx`, `.xlsx`,
`.pptx` (Apache POI test data, Apache-2.0) and `.pdf` files, with their
origin recorded in `PROVENANCE.md` files.

## Exposed sub-paths

| Sub-path | Target | Usage |
|---|---|---|
| `@awacloud/oconv` | `src/main.js` | Module manifest (`fw_require`, `pkg_require`, `modules`, `extras`, `bundle`): register `fw_require` and `modules` in a `ModuleRuntime`, then resolve `oconv` |
| `@awacloud/oconv/worker.js` | `src/worker.js` | The bundled worker, passed to `new Worker(...)`, never imported (the 1.x `@awacloud/oconv/src/worker.js` key is gone) |

## Maturity

L3 (`awa.maturity` in `package.json`): the three facade members and the
worker entry are covered by the package's test suite, and every public module
has a reference page under [`docs/api/`](./docs/api/README.md). It is not
published to the npm registry yet.

## Licence

`AGPL-3.0-only`, see [`LICENSE`](./LICENSE). A commercial licence is also
available; [`NOTICE`](./NOTICE) gives the contact.

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu/
- Source: [`packages/front/office/oconv`](https://github.com/awacloud/awa/tree/@awacloud/oconv@2.0.0/packages/front/office/oconv)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: https://github.com/awacloud/awa/blob/@awacloud/oconv@2.0.0/SECURITY.md
- Documentation: [index](./docs/README.md),
  [getting started](./docs/guide/getting-started.md),
  [API reference](./docs/api/README.md),
  [profile v1](./docs/profile-v1.md),
  [loss matrix](./docs/loss-matrix.md),
  [`convert`](./docs/convert.md),
  [pdf writer](./docs/pdf-writer.md),
  [changelog](./CHANGELOG.md)
