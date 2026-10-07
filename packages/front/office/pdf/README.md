# @awacloud/pdf

Pure JavaScript library to read and write PDF documents in the browser, with
no runtime dependency beyond
[`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/pdf@1.0.0/packages/front/fw)
and
[`@awacloud/fonts`](https://github.com/awacloud/awa/tree/@awacloud/pdf@1.0.0/packages/front/office/fonts).
The reference is ISO 32000-2:2020 (PDF 2.0); PDF 1.x files
are read too. `pdf.write` emits a `%PDF-2.0` header; `pdfBuilder.setVersion`
and `pdfWriter.writeDocument({ version })` emit the header they are given
(for example `%PDF-1.7`). Objects are re-emitted as read, not converted.

The core reads the file structure (classical cross-reference tables,
cross-reference streams, object streams, incremental updates) into a typed
object graph, and types the document layer on top of it: pages, resources,
content streams, fonts (parsing delegated to `@awacloud/fonts`), AcroForm,
annotations, Tagged PDF, optional content, outlines, actions, destinations,
embedded files, metadata and prepress boxes. It writes documents from a read
model or from scratch (`pdfBuilder`), as an incremental update, with
cross-reference streams, or encrypted with the standard security handler. It signs and verifies
PKCS#7 / PAdES signatures (levels B, T, LT, LTA) with public-key verification
through `@awacloud/fw/crypto/*` (synchronous, worker-safe, no Web Crypto). An
opt-in layer (`extra/*`) adds the long tail of PDF 2.0 and PDF 1.7 legacy
reading, grouped into the bundles `pdf-large`, `pdf-full` and `pdf-legacy`.

Known limits, so they are not a surprise:

- The whole file must be in memory as a `Uint8Array`; there is no streaming
  reader.
- An encrypted file is refused by `read` (`pdf/document/encrypted`) unless
  you opt in to the raw container; decryption is done by calling the
  security-handler modules (`pdfSecurity`, `pdfStandardV4/V5/V6`) yourself.
- Content streams are parsed to an operator list, not rendered.
- `write` re-emits the objects it is given: it does not convert legacy
  content (XFA, RC4 encryption, LZW streams, Sound / Movie annotations) to
  PDF 2.0 equivalents.
- JBIG2 is read at the segment-header level only (no image decode), and the
  linearization extra builds the linearization dictionary and a hint-stream
  placeholder, not a linearized file.

## Installation

```bash
npm install @awacloud/pdf
```

In the browser, via import map:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw":      "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/":     "/node_modules/@awacloud/fw/src/",
    "@awacloud/fonts":   "/node_modules/@awacloud/fonts/src/main.js",
    "@awacloud/fonts/":  "/node_modules/@awacloud/fonts/src/",
    "@awacloud/pdf":     "/node_modules/@awacloud/pdf/src/main.js",
    "@awacloud/pdf/":    "/node_modules/@awacloud/pdf/src/"
}}
</script>
```

## Quick Start

In the snippets below, `bytes` is a `Uint8Array` holding a PDF file.

### Stand-alone (without the `@awacloud/fw` runtime)

`pdf` (`src/pdf.js`) is a factory descriptor whose `factory` takes its
dependencies as positional arguments, so `import { pdf } from '@awacloud/pdf'`
cannot be invoked on its own. The zero-ceremony path is the committed
`dist/standalone` build, whose `pdf` root has every dependency inlined and is
invocable with no arguments:

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';

const api = pdfBundled.factory();
const doc = api.read(bytes);              // Uint8Array → typed model
console.log(doc.version);                 // header version, e.g. "1.5" or "2.0"
console.log(doc.pages.length);            // number of pages
console.log(doc.pages[0].mediaBox);       // the page's own /MediaBox, or null when inherited

const out = api.write(doc);               // → Uint8Array, %PDF-2.0
console.log(api.read(out).pages.length);  // the written file reads back
```

`api.write(doc)` re-emits the read model's indirect object graph in canonical
form: `%PDF-2.0` header, sequential objects, classical cross-reference table,
trailer. The layered `dist/standalone` roots (`pdf-large`, `pdf-full`,
`pdf-legacy` and the four `-rw` roots) are invocable the same way — see
[Committed dist](#committed-dist--two-build-surfaces) below.

### With the `@awacloud/fw` runtime

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of modules)    rt.register(m);

const api = rt.resolve('pdf');
const doc = api.read(bytes);
console.log(doc.pages.length);
```

### `.use(...)` hook (idempotent extension)

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';

const api = pdfBundled.factory();
api.use({
    name: 'my-extra',
    register(self) {
        return {
            countAnnots: (b) => self.read(b).pages
                .reduce((n, p) => n + p.annots.length, 0)
        };
    }
});
console.log(api.countAnnots(bytes));
console.log(api.usedExtension('my-extra'));   // true
```

`.use()` is **idempotent by name**: applying the same extension twice is a
no-op.

### With a bundle (extras wired automatically)

Bundles are module descriptors, consumed through a `ModuleRuntime`:

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);
for (const m of extras)      rt.register(m);
for (const m of bundle)      rt.register(m);

const api = rt.resolve('pdfLargeBundle');
const doc = api.read(bytes);
console.log(doc.pages.length);

// Each wired extra is reachable under its factory name:
console.log(api.usedExtension('pdfAOutputIntent'));        // true
console.log(api.pdfAOutputIntent.PDFA_PROFILES['2b'].iso); // 'ISO 19005-2:2011'
```

## Reading cross-reference forms

`api.read(bytes)` accepts classical (`xref` table) and PDF 1.5+
cross-reference-stream (`/Type /XRef`, §7.5.8) sections — mixed `/Prev`
chains and hybrid-reference files (a classical trailer carrying `/XRefStm`)
resolve end to end, and objects held in a `/Type /ObjStm` container (§7.5.7)
are materialised on demand. `/DecodeParms` (e.g. a PNG predictor on a
cross-reference stream) reach the decoders as plain parameters and are
honoured, and an indirect `/ExtGState` (or other resource category) on a page
does not drop the whole resource map. A non-catalog object that is free but
still referenced degrades to a recorded entry in `doc.losses` instead of
throwing (a free `/Root` is still refused); `appendIncremental` extends a
cross-reference-stream base with an uncompressed `/Type /XRef` section.

## Bundles

`src/main.js` exports the five descriptor arrays (`fw_require`,
`pkg_require`, `modules`, `extras`, `bundle`) and every `modules` descriptor
by binding name; the `extras` and `bundle` descriptors are **not** exported
individually from the root, so `import { pdfLargeBundle } from '@awacloud/pdf'`
is `undefined` — register the arrays as above, or import one bundle from its
own sub-path (`@awacloud/pdf/pdf-large`, `@awacloud/pdf/pdf-full`,
`@awacloud/pdf/pdf-legacy`).

- `pdfLargeBundle` — the core plus the P0 and P1 extras (common PDF 2.0
  features).
- `pdfFullBundle` — `pdf-large` plus the P2 and P3 extras, including the
  opt-in action sandbox linter.
- `pdfLegacyBundle` — `pdf-full` plus the PDF 1.7 legacy readers (XFA, RC4,
  deprecated filters, deprecated multimedia annotations).

Each bundle's extras are listed literally in its descriptor's
`dependencies`; see [`docs/api/bundles/`](docs/api/bundles/README.md) for the
per-bundle tables.

## Committed dist — two build surfaces

For consumers who don't want to hand-assemble the `fw_require` / `modules`
manifest, `dist/` ships a committed, pre-generated build: an 8-root matrix
crossing the four assembly roots (`pdf`, `pdf-large`, `pdf-full`,
`pdf-legacy`, the **Read** family) with four `-rw` roots (`pdf-rw`,
`pdf-large-rw`, `pdf-full-rw`, `pdf-legacy-rw`, the **Read+Write** family —
each Read root plus the write inventory, including `pdfXrefStreamWriter`, and
the signature verifier `pdfSignature` beside the signer), in two
path-discriminated surfaces:

| Surface | Path | Contents |
|---|---|---|
| `dist/build/` | `@awacloud/pdf/build/<root>` | fw-mode: declares its `@awacloud/fw` modules as `dependencies` (DI-injected), needs an `@awacloud/fw` runtime |
| `dist/standalone/` | `@awacloud/pdf/standalone/<root>` | framework-free: every reachable fw factory inlined in the body, zero runtime dependency (Worker-serializable) |

Each root emits a `.js` / `.min.js` / `.meta.json` triplet (e.g.
`dist/build/pdf-large.js`, `pdf-large.min.js`, `pdf-large.meta.json`), plus a
single `dist/build/index.js` barrel re-exporting the whole `src/main.js`
namespace (the five registration arrays and every named descriptor) for
registration on an `@awacloud/fw` runtime. Each `.meta.json` sidecar records
the root's `modules`, `fwDependencies` (read back from the generated
descriptor, never hardcoded) and build byte sizes. See
[`docs/api/bundles/dist-matrix.md`](docs/api/bundles/dist-matrix.md) for the
8-root × 2-surface table, the `-rw` naming scheme and the write inventory.

Idempotence: `bun run gen:bundles` (`tools/generate-bundles.mjs`) produces
byte-identical output across runs (no build stamp; every `.js` / `.min.js`
opens with the `/*! … */` licence banner at byte 0). It is a thin wrapper
around `@awacloud/tool-prebuild-generator`, a build tool of the source
monorepo that is not published.

**Invocability**: every `dist/standalone` root is invocable with no
arguments, the layered ones included — each layered extra is registered
through the `{ name, register }` envelope `pdf.use()` requires, so
`pdfRwBundled.factory()` returns a core on which
`core.usedExtension('pdfSign')` and `core.usedExtension('pdfSignature')` are
both `true` and `core.pdfSignature.verifySignature` is callable. The
`dist/build` roots need an `@awacloud/fw` runtime to inject their declared
dependencies.

## Source structure

```
src/
├── main.js            — entry point: the five descriptor arrays + named descriptors
├── pdf.js             — top-level api (read, header, write, use, usedExtension)
├── errors.js          — `pdfErrors` (PdfError + ParseError / RenderError /
│                         ContractError / EncryptionError + isPdfError)
├── _shared/           — `pdfShared` byte constants and stateless helpers
├── syntax/            — tokenizer, parser, serializer, xref, trailer,
│                         object streams, cross-reference streams, filters/
├── document/          — catalog, page tree, document reader, writers
│                         (classical, builder, incremental, xref-stream, encrypted)
├── content/ font/ form/ annot/ tagged/ ocg/ outline/ destination/ action/
├── embedded/ associatedFiles/ linearization/ metadata/ prepress/
├── crypto/            — security handlers V4 / V5 / V6, permissions, AES-GCM
├── sig/               — signature typing + verification, signing, ByteRange,
│                         RFC 3161 timestamps, certificate chains, DSS
├── extra/             — opt-in extras (P0–P3 + legacy)
└── bundles/           — pdf-large, pdf-full, pdf-legacy descriptors
```

## Documentation

| Guide | Link |
|-------|------|
| Getting started | [`docs/guide/getting-started.md`](docs/guide/getting-started.md) |
| Read pipeline | [`docs/guide/read-pdf.md`](docs/guide/read-pdf.md) |
| Extending via `.use()` | [`docs/guide/extending.md`](docs/guide/extending.md) |
| Coverage | [`docs/guide/coverage.md`](docs/guide/coverage.md) |
| PDF 1.7 legacy reading | [`docs/guide/legacy-1.7.md`](docs/guide/legacy-1.7.md) |
| Crypto — risks and limitations | [`docs/guide/crypto.md`](docs/guide/crypto.md) |
| PAdES signing and verification | [`docs/guide/pades-integration.md`](docs/guide/pades-integration.md) |

API per module: [`docs/api/README.md`](docs/api/README.md). Sibling package
with the same factory + bundles layout:
[`@awacloud/ooxml`](https://github.com/awacloud/awa/tree/@awacloud/pdf@1.0.0/packages/front/office/ooxml).

## Tests

```
$ bun test packages/front/office/pdf/
```

Co-located unit tests (`*.test.js` next to each source file) plus integration
suites under `tests/`, among them:

- `tests/roundtrip.integration.test.js` — wiring via the `@awacloud/fw`
  `ModuleRuntime`, read → write → read, worker transportability of every
  factory
- `tests/legacy-conversion.test.js` — PDF 1.x read tolerance
- `tests/fuzz.test.js` — garbage and truncated input → typed `ParseError`
- `tests/_helpers/build.js` — shared fixture builder

## Design choices

- **Plain binary format** — no ZIP (unlike `@awacloud/ooxml` and
  `@awacloud/odf`). The PDF container is its own format: `%PDF-2.0` header +
  indirect objects + cross-reference section + trailer.
- **Worker-safe** — each factory is self-sufficient (serializable via
  `factory.toString()`). Constants are inlined in the body, no mutable
  module-level closure.
- **No external dependency** — `@awacloud/fw` and `@awacloud/fonts` only.
  Codecs that `@awacloud/fw` does not provide (the simple filters, RC4, CCITT
  fax) are implemented in this package.
- **Typed errors** — no raw `throw new Error(...)`; only `PdfError` and its
  subclasses, with a stable kebab-case `code` and a structured `context`.
  The classes are not exported at the top level: they are declared inside
  the `pdfErrors` factory body, so each `pdfErrors.factory()` call creates a
  fresh set of classes. Resolve `pdfErrors` through one `ModuleRuntime`
  (which caches the instance) to share class identities across consumers;
  across two separate `factory()` calls, `instanceof` does not hold — compare
  `e.code` instead.

## Exposed sub-paths

| Sub-path | Target | Usage |
|---|---|---|
| `@awacloud/pdf` | `src/main.js` | entry point — the five descriptor arrays + every core descriptor by name |
| `@awacloud/pdf/pdf` | `src/pdf.js` | the top-level `pdf` descriptor only |
| `@awacloud/pdf/errors` | `src/errors.js` | the `pdfErrors` descriptor (resolves `PdfError` + 4 subclasses) |
| `@awacloud/pdf/serializer` | `src/syntax/serializer.js` | the `pdfSerializer` descriptor (typed object → bytes) |
| `@awacloud/pdf/filters/*.js` | `src/syntax/filters/*.js` | stream filters by file name with the `.js` suffix, e.g. `@awacloud/pdf/filters/ascii85.js` |
| `@awacloud/pdf/filters/*` | `src/syntax/filters/*.js` | stream filters (`flate`, `asciiHex`, `ascii85`, `runLength`, `dispatch`); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/annot/*.js` | `src/annot/*.js` | annotations by file name with the `.js` suffix, e.g. `@awacloud/pdf/annot/annot.js` |
| `@awacloud/pdf/annot/*` | `src/annot/*.js` | annotations (text, link, markup, widget, redact, …); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/tagged/*.js` | `src/tagged/*.js` | Tagged PDF by file name with the `.js` suffix |
| `@awacloud/pdf/tagged/*` | `src/tagged/*.js` | Tagged PDF (structure tree, elements, parent tree, …); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/crypto/*.js` | `src/crypto/*.js` | encryption by file name with the `.js` suffix |
| `@awacloud/pdf/crypto/*` | `src/crypto/*.js` | encryption (security handlers V4 / V5 / V6, permissions, AES-GCM); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/sig/*.js` | `src/sig/*.js` | signatures by file name with the `.js` suffix |
| `@awacloud/pdf/sig/*` | `src/sig/*.js` | signatures (verify, sign, ByteRange, RFC 3161, certificate chain, DSS); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/ocg/*.js` | `src/ocg/*.js` | optional content by file name with the `.js` suffix |
| `@awacloud/pdf/ocg/*` | `src/ocg/*.js` | optional content (OCG + configuration); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/action/*.js` | `src/action/*.js` | actions by file name with the `.js` suffix |
| `@awacloud/pdf/action/*` | `src/action/*.js` | actions (GoTo, URI, Named, Launch, …); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/embedded/*.js` | `src/embedded/*.js` | embedded files by file name with the `.js` suffix |
| `@awacloud/pdf/embedded/*` | `src/embedded/*.js` | embedded files (file specification, embedded file, collection); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/metadata/*.js` | `src/metadata/*.js` | metadata by file name with the `.js` suffix |
| `@awacloud/pdf/metadata/*` | `src/metadata/*.js` | metadata (Info dictionary, XMP); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/prepress/*.js` | `src/prepress/*.js` | prepress by file name with the `.js` suffix |
| `@awacloud/pdf/prepress/*` | `src/prepress/*.js` | prepress (output intents, page boundaries); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/extra/*.js` | `src/extra/*.js` | opt-in extra descriptors by file name with the `.js` suffix |
| `@awacloud/pdf/extra/*` | `src/extra/*.js` | opt-in extra descriptors (P0–P3 + legacy); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/bundles/*.js` | `src/bundles/*.js` | bundle descriptors by file name with the `.js` suffix |
| `@awacloud/pdf/bundles/*` | `src/bundles/*.js` | bundle descriptors (`pdf-large`, `pdf-full`, `pdf-legacy`); resolved by Bun/Node through the exports map |
| `@awacloud/pdf/pdf-large` | `src/bundles/pdf-large.js` | the `pdfLargeBundle` descriptor |
| `@awacloud/pdf/pdf-full` | `src/bundles/pdf-full.js` | the `pdfFullBundle` descriptor |
| `@awacloud/pdf/pdf-legacy` | `src/bundles/pdf-legacy.js` | the `pdfLegacyBundle` descriptor |
| `@awacloud/pdf/build/*` | `dist/build/*` | committed fw-mode build — Read roots (`pdf`, `pdf-large`, `pdf-full`, `pdf-legacy`), Read+Write roots (`pdf-rw`, `pdf-large-rw`, `pdf-full-rw`, `pdf-legacy-rw`), and the `index.js` barrel |
| `@awacloud/pdf/standalone/*` | `dist/standalone/*` | committed framework-free build, same 8 roots |

The `src/document/*` modules (writers, builder, catalog, pages, resources)
have no sub-path of their own: they are reached through the root entry's
named descriptors.

## Maturity

L4 (`awa.maturity` in `package.json`): the package covers its declared
surface, within the limits listed above, and ships a test suite and
per-module reference pages.

## Licence

`AGPL-3.0-only` — see [`LICENSE`](./LICENSE). The package is also available
under a commercial licence; see [`NOTICE`](./NOTICE).

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu
- Source: [`packages/front/office/pdf`](https://github.com/awacloud/awa/tree/@awacloud/pdf@1.0.0/packages/front/office/pdf)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: https://github.com/awacloud/awa/blob/@awacloud/pdf@1.0.0/SECURITY.md
