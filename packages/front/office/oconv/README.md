# @awacloud/oconv

Document conversion in plain JavaScript, through one versioned pivot
representation (`oconv-ir/v1`). `toMd` turns a `.docx`, `.odt`, `.xlsx`,
`.ods`, `.pptx`, `.odp` or `.pdf` document into a structured-markdown profile
built for retrieval pipelines; `fromMd` writes Markdown back out as `.docx`,
`.odt` or `.pdf`; `convert` goes document to document for four pairs
(`docx → odt`, `odt → docx`, `docx → pdf`, `odt → pdf`) with no Markdown
step. Every call returns a machine-readable loss ledger. The losses the
pipeline detects are recorded; the known silent cases are listed in the
[loss matrix](./docs/loss-matrix.md).

No network access, no external tool, no bundler. Its only runtime
dependencies are
[`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/oconv@1.0.0/packages/front/fw)
and the office packages it composes:
[`@awacloud/ooxml`](https://github.com/awacloud/awa/tree/@awacloud/oconv@1.0.0/packages/front/office/ooxml),
[`@awacloud/odf`](https://github.com/awacloud/awa/tree/@awacloud/oconv@1.0.0/packages/front/office/odf),
[`@awacloud/md`](https://github.com/awacloud/awa/tree/@awacloud/oconv@1.0.0/packages/front/office/md),
[`@awacloud/pdf`](https://github.com/awacloud/awa/tree/@awacloud/oconv@1.0.0/packages/front/office/pdf)
and
[`@awacloud/fonts`](https://github.com/awacloud/awa/tree/@awacloud/oconv@1.0.0/packages/front/office/fonts).

Bounds, stated up front: `fromMd` is structural only (one fixed built-in style
set per target, never caller styling); `pdf → md` reads text only (no scanned
pages, no OCR); `md → pdf` is a bounded typesetter (one page size per
document, one column, greedy line breaking, no hyphenation, no justification,
no table splitting). The [loss matrix](./docs/loss-matrix.md) gives the
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

The `@awacloud/oconv/` prefix points at the package root, so the worker
specifier `@awacloud/oconv/src/worker.js` names the same file as it does
under an `exports`-aware resolver.

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
full wire contract.

The source format comes from `name`'s extension (`.docx`, `.odt`, `.xlsx`,
`.ods`, `.pptx`, `.odp`, `.pdf`, case-insensitive) unless `format` is given;
an unresolved format throws `oconv: unsupported format`. Two reader options
exist:

- `includeNotes` (boolean, default `false`, `pptx` / `odp`): renders speaker
  notes as a trailing blockquote per slide instead of recording a
  `slides/notes-omitted` loss. It has no effect on `pptx`, whose reader
  never receives speaker notes from `@awacloud/ooxml`.
- `formOpBudget` (`pdf` only): the per-page operator budget for Form
  XObjects, default `1000000`. It must be a safe integer of at least 1, else
  `oconv: bad form op budget`; passing it for another format throws
  `oconv: form op budget needs format pdf`.

The `.odt` reader resolves run and list formatting from automatic styles and
from named styles that are fully mapped (a single style, no parent-style
chain); monospace resolves only through a fixed-pitch or generic-modern font
face. A foreign `.odt` styled through parent chains or partially mapped
styles still yields `run/format-unresolved` or `list/numbering-unresolved`.

## Writing documents from Markdown

`fromMd` accepts structured Markdown (profile v1) or plain CommonMark/GFM.
The target comes from `target`, else from `name`'s extension. Each target
carries one fixed, built-in style set and no caller styling:

- `docx`: `Normal`, `Heading1` to `Heading6` and the `TableGrid` table
  style; tables are bordered and padded.
- `odt`: `Standard`, `Text body`, `Heading` and `Heading 1` to `Heading 6`;
  tables are bordered.
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

Images come in through `assets`, which maps a Markdown image destination,
exactly as written, to its encoded bytes. Nothing is fetched; caller bytes win
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

- `docx` places the image in `@awacloud/ooxml`'s default 2 in × 4:3 box and
  records `image/size-defaulted`.
- `pdf` places JPEG with 1 or 3 colour components. PNG, CMYK JPEG and every
  other encoding are refused with `layout/image-dropped` and
  `reason: 'unsupported-encoding'` (see
  [`docs/pdf-writer.md`](./docs/pdf-writer.md#images)).
- `odt` places an image whose bytes are reachable (a caller `assets` entry, or
  bytes the reader carried) as a `Pictures/` part in a 2 in × 1.5 in inline
  frame and records `image/size-defaulted`. With no bytes it records
  `image/dropped`. Read back through `toMd`, the frame surfaces as
  `image/unresolved` with detail `draw:frame`.

`assets` must be a non-null, non-array object of `Uint8Array` values, else
`fromMd` throws `oconv: bad assets`.

Provenance and reproducibility differ by target. A `.docx` carries no
document-properties part at all. A `.odt` always carries
`meta:generator: '@awacloud/odf'` in `meta.xml`. A `.pdf` always carries
`/Producer` and `/Creator`, both `'@awacloud/oconv'`. The `docx` target is
byte-reproducible: `@awacloud/ooxml` stamps every zip entry with a fixed
1980-01-01 00:00 timestamp. The `odt` target is not: the ODF package writer
stamps the current time, so two identical calls give equal document models but
may give different bytes. The `pdf` target is byte-reproducible: it writes no
date and no `/ID`.

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
[`@awacloud/oconv-fonts`](https://github.com/awacloud/awa/tree/@awacloud/oconv@1.0.0/packages/front/office/oconv-fonts)
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
conversion per message. Load it by its specifier, or by its real path (a
`new URL()` never goes through an import map). Errors come back as data:
`error` is a string on failure and `null` on success, never an exception
thrown across the boundary.

```js
const worker = new Worker(
    import.meta.resolve('@awacloud/oconv/src/worker.js'),
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

- [`src/ir/`](./src/ir): the pivot representation `oconv-ir/v1` and its
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
- [`src/worker.js`](./src/worker.js): the worker entry.
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
| `@awacloud/oconv/src/worker.js` | `src/worker.js` | Worker entry, passed to `new Worker(...)`, never imported |

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

- Website: https://awaforge.eu
- Source: [`packages/front/office/oconv`](https://github.com/awacloud/awa/tree/@awacloud/oconv@1.0.0/packages/front/office/oconv)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: https://github.com/awacloud/awa/blob/@awacloud/oconv@1.0.0/SECURITY.md
- Documentation: [index](./docs/README.md),
  [getting started](./docs/guide/getting-started.md),
  [API reference](./docs/api/README.md),
  [profile v1](./docs/profile-v1.md),
  [loss matrix](./docs/loss-matrix.md),
  [`convert`](./docs/convert.md),
  [pdf writer](./docs/pdf-writer.md),
  [changelog](./CHANGELOG.md)
