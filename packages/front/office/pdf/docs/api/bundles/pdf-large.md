---
module: pdfLargeBundle
category: pdf/bundles
dependencies: [pdf, pdfContentOpsExtended, pdfFontCidTyped, pdfFontColorTagging, pdfTaggedPdfTyped, pdfAnnotExtended, pdfAOutputIntent, pdfUaTagged, pdfFormActionsExtended, pdfColorSpacesExtended, pdfShadingTyped, pdfTransparencyTyped, pdfSigPades, pdfSigAesGcm, pdfDocumentParts, pdfRedactionIso32005, pdfXPrepress, pdfWellTagged, pdfOptionalContentExtended, pdfEmbeddedFilesPortfolio, pdfAssociatedFiles2, pdfXmpExtended]
returns: object
worker-safe: true
status: complete
---

# pdfLargeBundle

> Core PDF + P0/P1 extras — the common PDF 2.0 features.

**Module** `pdfLargeBundle` | **Source** `packages/front/office/pdf/src/bundles/pdf-large.js` | **Deps** `pdf` + the 21 extras enumerated under [Extras wired](#extras-wired) (22 names total, listed literally in the frontmatter `dependencies`) | **Worker-safe** yes

A module descriptor that declares the core `pdf` and **21 P0+P1 extras** as dependencies. The runtime supplies the already-constructed instances; the factory wires them into `pdf` via `.use(...)` and returns the enriched instance. Fits most production use where the long tail (PDF 1.7 legacy, deprecated filters, the linearization-dictionary builder) is not required.

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

const api = rt.resolve('pdfLargeBundle');
const doc = api.read(pdfBytes);
doc.pages.length;
```

`@awacloud/pdf`'s root entry re-exports the **five descriptor arrays** (`fw_require`, `pkg_require`, `modules`, `extras`, `bundle`) plus every `modules` descriptor by binding name. The `extras` and `bundle` descriptors are **not** individually re-exported from the root — `import { pdfLargeBundle } from '@awacloud/pdf'` is `undefined`. Register the arrays as above, or import a single bundle descriptor from its own subpath export:

```js
import { pdfLargeBundle } from '@awacloud/pdf/pdf-large';        // or '@awacloud/pdf/bundles/pdf-large'
```

Every dependency listed in `dependencies` must be `register()`ed on the `ModuleRuntime` before `resolve('pdfLargeBundle')` — the runtime resolves by name and throws `Module not found: <name>` if one is missing. Registering all five arrays is the pattern used by the package's own test bootstrap (`tests/_helpers/build.js`); `pdf-large` itself resolves without `fw_require`/`pkg_require` registered, but the sibling bundles do not (see [`pdf-legacy`](./pdf-legacy.md)), so registering all five is the safe default.

## API

| Export | Description |
|--------|-------------|
| `pdfLargeBundle` | Descriptor `{ name, dependencies, factory }`. Resolved by `ModuleRuntime` → `pdf` instance wired with the P0+P1 extras. |

The resolved instance is the core `pdf` object (`src/pdf.js`) with the 21 extras merged in — it carries `pdf`'s own 5 members plus one property per wired extra name:

| Member | Signature | Description |
|--------|-----------|--------------|
| `read` | `(bytes: Uint8Array) => doc` | Full document read. |
| `header` | `(bytes: Uint8Array) => { version, end }` | Header-only read, no xref/catalog walk. |
| `write` | `(doc) => Uint8Array` | PDF 2.0 write. |
| `use` | `(ext) => api` | Extension hook (idempotent by name); this is how the bundle factory wires each extra. |
| `usedExtension` | `(name: string) => boolean` | Whether an extension name has already been applied via `.use()`. The bundle factory calls `.use({ name, register })` once per wired extra (its own name, e.g. `'pdfSigPades'`), so `api.usedExtension('pdfSigPades')` is `true` right after resolve — `api.usedExtension('pdfLargeBundle')` is `false`, since the bundle's own descriptor name is never itself passed to `.use()`. |

## Extras wired

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

## When to choose

- **`pdf-large`** — standard production use, typed PDF 2.0 read/write of the common features. No linearization-dictionary builder, no 3D/RichMedia, no legacy 1.7.
- `pdf-full` — adds the linearization-dictionary builder, 3D/RichMedia, JBIG2 segment-header read, `/Info` lint, misc tail. Choose it when you need every PDF 2.0 extra.
- `pdf-legacy` — adds XFA read, RC4 decryption helpers, LZW / CCITT fax decode, Sound/Movie/Screen typing. Choose it for PDF 1.7 reading.

## Examples

### Read + extra

```js
const api = rt.resolve('pdfLargeBundle');
const doc = api.read(bytes);

// Use a wired extra via api.<extName>
const padesProfile = api.pdfSigPades.detectPadesProfile(sigDict, ctx);
```

### Write

```js
const api = rt.resolve('pdfLargeBundle');
const out = api.write(doc);   // PDF 2.0 bytes
```

### Header only

```js
const api = rt.resolve('pdfLargeBundle');
api.header(bytes);   // { version: '2.0', end: <offset> } — no xref/catalog walk
```

### Checking a wired extra

```js
const api = rt.resolve('pdfLargeBundle');
api.usedExtension('pdfSigPades');       // true — wired by the bundle factory
api.usedExtension('not-a-real-extra');  // false
```

### Adding a custom extra

```js
const api = rt.resolve('pdfLargeBundle');
api.use({ name: 'myThing', register(self) { return { myThing: {/* … */} }; } });
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/use/bad-extension` | `ContractError` | `.use()` is called with an object missing `name`/`register` (thrown by the core `pdf` orchestrator, not specific to bundles). |

## See also

- [`pdf-full`](./pdf-full.md)
- [`pdf-legacy`](./pdf-legacy.md)
- [Bundles index](./README.md)
- [Extras index](../extra/README.md)
