---
category: pdf
status: complete
---

# main

> Entry point of `@awacloud/pdf` — re-exports every factory and the ordered `modules` list for `ModuleRuntime`.

**Source** `packages/front/office/pdf/src/main.js` | **Sub-path** `@awacloud/pdf` (the `.` export) — not a module descriptor

No factory of its own — this file is a declarative manifest: it imports every `pdf*` module descriptor and aggregates them into five arrays (`fw_require`, `pkg_require`, `modules`, `extras`, `bundle`), plus one additive re-export block, to provide a single import point (`@awacloud/pdf`). The `modules` array is topologically sorted: `register(m)` in order guarantees each dependency precedes its dependents.

## Resolve

`main` is not a DI module; it is used via direct import:

```js
import { pdf, pdfErrors, modules } from '@awacloud/pdf';
```

The error classes (`PdfError`, `ParseError`, `RenderError`, `ContractError`, `EncryptionError`) are not exported at the top level — they are resolved via `pdfErrors.factory()` (see [`pdfErrors`](./errors.md)).

## API (exports)

| Export | Type | Description |
|--------|------|-------------|
| `pdf` | factory | Orchestrator — see [`pdf`](./pdf.md). |
| `pdfErrors` | factory | See [`pdfErrors`](./errors.md) — resolves the 5 error classes. |
| `pdfTokenizer` | factory | See [`pdfTokenizer`](./syntax/tokenizer.md). |
| `pdfParser` | factory | See [`pdfParser`](./syntax/parser.md). |
| `pdfXref` | factory | See [`pdfXref`](./syntax/xref.md). |
| `pdfTrailer` | factory | See [`pdfTrailer`](./syntax/trailer.md). |
| `pdfCatalog` | factory | See [`pdfCatalog`](./document/catalog.md). |
| `pdfPages` | factory | See [`pdfPages`](./document/pages.md). |
| `pdfPage` | factory | See [`pdfPage`](./document/page.md). |
| `pdfDocument` | factory | See [`pdfDocument`](./document/document.md). |
| `fw_require` | `factory[]` | The `@awacloud/fw` module descriptors required by fw-bound modules, their own transitive dependencies included (zlib, aes, asn1, rsa, ecc, ed25519, …). |
| `pkg_require` | `factory[]` | Cross-package descriptors: the whole `@awacloud/fonts` manifest (`fw_require` + `modules`) plus 4 internal `embed-pdf/subsetForPdf` helper descriptors (`embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`, `embedHash`) not re-exported by `@awacloud/fonts` itself — needed to resolve `pdfFontEmbed`'s full transitive graph. |
| `modules` | `factory[]` | PDF core — topologically ordered for `ModuleRuntime.register`. |
| `extras` | `factory[]` | The opt-in extras (P0/P1/P2/P3 + legacy + sandbox). |
| `bundle` | `factory[]` | Three descriptors: `pdfLargeBundle` / `pdfFullBundle` / `pdfLegacyBundle`. They are reachable through this array or their own sub-paths (`@awacloud/pdf/pdf-large`, …), not as named exports of the root — see [Bundles](./bundles/README.md). |

Beyond these arrays, **every module descriptor listed in `modules`** — from `pdfErrors`/`pdfShared` through the final `pdf` orchestrator, covering syntax, document, content, font, form, annotations, tagged PDF, encryption, signatures, OCG, outlines/destinations/actions, embedded files, linearization, metadata, prepress and associated files — **is additionally re-exported by its own binding name** (e.g. `import { pdfSignature, pdfCertChain } from '@awacloud/pdf'`), together with the 4 `pkg_require` fonts helper bindings. This is purely additive: the five arrays above stay byte-unchanged. The `extras` and `bundle` descriptors are **not** re-exported by name.

### Named descriptor exports

Derived from the `export { … }` block of `src/main.js` (its group comments
included):

| Group | Named exports |
|-------|---------------|
| Errors / shared | `pdfErrors`, `pdfShared` |
| Syntax | `pdfTokenizer`, `pdfParserObj`, `pdfParser`, `pdfXref`, `pdfTrailer`, `pdfSerializer`, `pdfFlate`, `pdfAsciiHex`, `pdfAscii85`, `pdfRunLength`, `pdfFilterDispatch`, `pdfObjStream`, `pdfCrossRefStream` |
| Document | `pdfCatalog`, `pdfPages`, `pdfPage`, `pdfDocument`, `pdfWriter`, `pdfBuilder`, `pdfEncryptedWriter`, `pdfIncrementalWriter`, `pdfXrefStreamWriter`, `pdfResources` |
| Content | `pdfContentOps`, `pdfContentStream`, `pdfGraphics`, `pdfText`, `pdfColor`, `pdfImages` |
| Font | `pdfFont`, `pdfFontEncoding`, `pdfType3`, `pdfFontEmbed` |
| Form | `pdfAcroForm`, `pdfFieldTree`, `pdfButtonField`, `pdfTextField`, `pdfChoiceField`, `pdfSignatureField`, `pdfAppearance` |
| Annotations | `pdfAnnot`, `pdfTextAnnot`, `pdfLinkAnnot`, `pdfMarkupAnnot`, `pdfShapeAnnot`, `pdfFreeTextAnnot`, `pdfInkAnnot`, `pdfStampAnnot`, `pdfFileAttachAnnot`, `pdfWidgetAnnot`, `pdfPopupAnnot`, `pdfProjectionAnnot`, `pdfRedactAnnot` |
| Tagged | `pdfStructTree`, `pdfStructElement`, `pdfRoleMap`, `pdfParentTree`, `pdfClassMap`, `pdfMarkedContent` |
| Encryption | `pdfSecurity`, `pdfStandardV4`, `pdfStandardV5`, `pdfStandardV6`, `pdfPermissions`, `pdfAesGcm` |
| Signatures | `pdfSigOids`, `pdfSha1`, `pdfSignature`, `pdfByteRange`, `pdfTimestamp`, `pdfCertChain`, `pdfDssBuilder`, `pdfSign` |
| Optional Content | `pdfOCG`, `pdfOCConfig` |
| Outlines / Destinations / Actions | `pdfOutline`, `pdfDestination`, `pdfAction`, `pdfActionGoTo`, `pdfActionUri`, `pdfActionNamed`, `pdfActionLaunch` |
| Embedded files | `pdfFileSpec`, `pdfEmbeddedFile`, `pdfCollection` |
| Linearization / Metadata / Prepress / Associated | `pdfLinearization`, `pdfInfo`, `pdfXmp`, `pdfOutputIntent`, `pdfPageBoundary`, `pdfAssociatedFiles` |
| Top-level | `pdf` |
| `pkg_require` — `@awacloud/fonts` subset helper bindings | `embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`, `embedHash` | See each module's own category page (e.g. [`pdfSignature`](./sig/signature.md), [`pdfAcroForm`](./form/acroform.md)) for its individual API.

## Examples

### Wire via the fw runtime

`fw_require` is needed as soon as a resolved module reaches an `@awacloud/fw`
factory — `pdf` does, through the Flate filter — so register it first:

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of modules)    rt.register(m);

const api = rt.resolve('pdf');
const doc = api.read(bytes);
```

### Stand-alone, without a runtime

`pdf.factory()` takes its dependencies as positional arguments; the
zero-argument entry is the committed framework-free build:

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';
pdfBundled.factory().read(bytes);
```

### Typed catch subscription

```js
import { pdfErrors } from '@awacloud/pdf';
const { PdfError } = pdfErrors.factory();

try { /* … */ }
catch (e) { if (e instanceof PdfError) console.log(e.code); else throw e; }
```

## Errors

This module throws no errors of its own — it only re-exports.

## See also

- [`pdf`](./pdf.md) — main orchestrator.
- [Getting started](../guide/getting-started.md)
