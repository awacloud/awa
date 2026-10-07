---
module: pdfFullBundle
category: pdf/bundles
dependencies: [pdf, pdfContentOpsExtended, pdfFontCidTyped, pdfFontColorTagging, pdfTaggedPdfTyped, pdfAnnotExtended, pdfAOutputIntent, pdfUaTagged, pdfFormActionsExtended, pdfColorSpacesExtended, pdfShadingTyped, pdfTransparencyTyped, pdfSigPades, pdfSigAesGcm, pdfDocumentParts, pdfRedactionIso32005, pdfXPrepress, pdfWellTagged, pdfOptionalContentExtended, pdfEmbeddedFilesPortfolio, pdfAssociatedFiles2, pdfXmpExtended, pdfLinearizationWrite, pdf3dRichMedia, pdfJbig2Read, pdfMisc, pdfInfoDictDeprecated, pdfSandbox]
returns: object
worker-safe: true
status: complete
---

# pdfFullBundle

> Full strict PDF 2.0 bundle — `pdfLargeBundle`'s 21 extras + 6 more.

**Module** `pdfFullBundle` | **Source** `packages/front/office/pdf/src/bundles/pdf-full.js` | **Deps** `pdf` + the 27 extras enumerated under [Extras wired](#extras-wired) (28 names total, listed literally in the frontmatter `dependencies`) | **Worker-safe** yes

A module descriptor — declares the core plus every P0/P1/P2/P3 extra **except** the `legacy-*` family (27 extras total, one flat list — the source does not distinguish a separate "sandbox tail" tier). The runtime resolves the dependencies; the factory wires them into `pdf` via `.use(...)`. Fits callers that need every PDF 2.0 extra. For PDF 1.7 reading use [`pdfLegacyBundle`](./pdf-legacy.md).

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);
for (const m of extras)      rt.register(m);
for (const m of bundle)      rt.register(m);

const api = rt.resolve('pdfFullBundle');
const doc = api.read(pdfBytes);
const out = api.write(doc);
```

The `extras` and `bundle` descriptors are **not** re-exported from the package root by binding name — `import { pdfFullBundle } from '@awacloud/pdf'` is `undefined`. Register the arrays as above, or import the single descriptor from its own subpath export (`import { pdfFullBundle } from '@awacloud/pdf/pdf-full';`).

## API

| Export | Description |
|--------|-------------|
| `pdfFullBundle` | Descriptor `{ name, dependencies, factory }`. Resolved by `ModuleRuntime` → `pdf` instance wired with all 27 P0-P3 extras. |

The resolved instance is the core `pdf` object (`src/pdf.js`) with the 27 extras merged in — it carries `pdf`'s own 5 members plus one property per wired extra name:

| Member | Signature | Description |
|--------|-----------|--------------|
| `read` | `(bytes: Uint8Array) => doc` | Full document read. |
| `header` | `(bytes: Uint8Array) => { version, end }` | Header-only read, no xref/catalog walk. |
| `write` | `(doc) => Uint8Array` | PDF 2.0 write. |
| `use` | `(ext) => api` | Extension hook (idempotent by name); this is how the bundle factory wires each extra. |
| `usedExtension` | `(name: string) => boolean` | Whether an extension name has already been applied via `.use()`. The bundle factory calls `.use({ name, register })` once per wired extra (e.g. `'pdfSandbox'`), so `api.usedExtension('pdfSandbox')` is `true` right after resolve — `api.usedExtension('pdfFullBundle')` is `false`, since the bundle's own descriptor name is never itself passed to `.use()`. |

## Extras wired

Items 1-21 are [`pdfLargeBundle`](./pdf-large.md)'s extras, re-listed here so every member of the resolved instance is documented on this page; items 22-27 are `pdf-full`'s own additions.

| # | Extra | Phase | Status |
|---|-------|-------|--------|
| 1 | [`pdfContentOpsExtended`](../extra/content-ops-extended.md) | P0 | read |
| 2 | [`pdfFontCidTyped`](../extra/font-cid-typed.md) | P0 | read |
| 3 | [`pdfFontColorTagging`](../extra/font-color-tagging.md) | P0 | read |
| 4 | [`pdfTaggedPdfTyped`](../extra/tagged-pdf-typed.md) | P0 | read |
| 5 | [`pdfAnnotExtended`](../extra/annot-extended.md) | P0 | read |
| 6 | [`pdfAOutputIntent`](../extra/pdf-a-output-intent.md) | P0 | lint |
| 7 | [`pdfUaTagged`](../extra/pdf-ua-tagged.md) | P0 | lint |
| 8 | [`pdfFormActionsExtended`](../extra/form-actions-extended.md) | P1 | read |
| 9 | [`pdfColorSpacesExtended`](../extra/color-spaces-extended.md) | P1 | read |
| 10 | [`pdfShadingTyped`](../extra/shading-typed.md) | P1 | read |
| 11 | [`pdfTransparencyTyped`](../extra/transparency-typed.md) | P1 | read |
| 12 | [`pdfSigPades`](../extra/sig-pades.md) | P1 | read |
| 13 | [`pdfSigAesGcm`](../extra/sig-aes-gcm.md) | P1 | read |
| 14 | [`pdfDocumentParts`](../extra/document-parts.md) | P1 | read |
| 15 | [`pdfRedactionIso32005`](../extra/redaction-iso32005.md) | P1 | read |
| 16 | [`pdfXPrepress`](../extra/pdf-x-prepress.md) | P1 | lint |
| 17 | [`pdfWellTagged`](../extra/well-tagged-pdf.md) | P1 | lint |
| 18 | [`pdfOptionalContentExtended`](../extra/optional-content-extended.md) | P1 | read |
| 19 | [`pdfEmbeddedFilesPortfolio`](../extra/embedded-files-portfolio.md) | P1 | read |
| 20 | [`pdfAssociatedFiles2`](../extra/associated-files.md) | P1 | read |
| 21 | [`pdfXmpExtended`](../extra/xmp-extended.md) | P1 | read |
| 22 | [`pdfLinearizationWrite`](../extra/linearization-write.md) | P2 | write |
| 23 | [`pdf3dRichMedia`](../extra/3d-richmedia.md) | P2 | read |
| 24 | [`pdfJbig2Read`](../extra/jbig2-read.md) | P2 | read (partial) |
| 25 | [`pdfMisc`](../extra/misc.md) | P3 | read |
| 26 | [`pdfInfoDictDeprecated`](../extra/info-dict-deprecated.md) | P3 | lint |
| 27 | [`pdfSandbox`](../extra/pdf-sandbox.md) | P3 | opt-in audit hook |

## When to choose

- `pdf-large` — minimal: the common PDF 2.0 features.
- **`pdf-full`** — every PDF 2.0 extra. Choose it when the linearization-dictionary builder, 3D/RichMedia, JBIG2 segment-header read, or Info-dict lint are required.
- `pdf-legacy` — full + PDF 1.7 read (XFA, RC4, LZW, …).

## Examples

### Bootstrap

```js
const api = rt.resolve('pdfFullBundle');
```

### Header only

```js
api.header(bytes);   // { version: '2.0', end: <offset> } — no xref/catalog walk
```

### Checking a wired extra

```js
api.usedExtension('pdfSandbox');        // true — wired by the bundle factory
api.usedExtension('not-a-real-extra');  // false
```

### Emitting a linearized dict

```js
const dict = api.pdfLinearizationWrite.buildLinearizedDict({
    Linearized: 1.0, L: 50000, H: [200, 500],
    O: 5, E: 4000, N: 10, T: 48000
});
```

### Enumerating a JBIG2 stream

```js
const segs = api.pdfJbig2Read.parseSegments(jbig2Bytes);
```

### Info → XMP audit

```js
const r = api.pdfInfoDictDeprecated.lint({ version: 2.0, info, xmpPresent: false });
r.warnings;
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/use/bad-extension` | `ContractError` | `.use()` is called with an object missing `name`/`register` (thrown by the core `pdf` orchestrator, not specific to bundles). |

## See also

- [`pdf-large`](./pdf-large.md)
- [`pdf-legacy`](./pdf-legacy.md)
- [Bundles index](./README.md)
- [Extras index](../extra/README.md)
