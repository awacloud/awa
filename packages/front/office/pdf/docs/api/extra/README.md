# Extras — L3+ opt-in coverage

Optional modules beyond core PDF 2.0. Each is a `{ name, dependencies, factory }` descriptor, consumable directly via `runtime.resolve(name)` or through `pdfApi.use(...)`. Grouped by phase priority.

## P0 — critical coverage (7)

| Module | Status | Description |
|--------|--------|-------------|
| [`pdfContentOpsExtended`](./content-ops-extended.md) | read | Extended gstate operators + full ExtGState catalog §8.4.5. |
| [`pdfFontCidTyped`](./font-cid-typed.md) | read | CIDFont, CSI, `/W`, predefined CMaps §9.7. |
| [`pdfFontColorTagging`](./font-color-tagging.md) | read | Color fonts (COLR/CPAL/sbix/SVG) §9.8.2. |
| [`pdfTaggedPdfTyped`](./tagged-pdf-typed.md) | read | Structural attribute owners §14.8.5. |
| [`pdfAnnotExtended`](./annot-extended.md) | read | Watermark/3D/RichMedia/Sound/Movie/Screen §12.5.6. |
| [`pdfAOutputIntent`](./pdf-a-output-intent.md) | lint | PDF/A detection + basic lint. |
| [`pdfUaTagged`](./pdf-ua-tagged.md) | lint | PDF/UA-1/2 linter. |

## P1 — extended coverage (14)

| Module | Status | Description |
|--------|--------|-------------|
| [`pdfFormActionsExtended`](./form-actions-extended.md) | read | Extended actions §12.6.4. |
| [`pdfColorSpacesExtended`](./color-spaces-extended.md) | read | Typed color spaces §8.6. |
| [`pdfShadingTyped`](./shading-typed.md) | read | Shadings 1-7 + Functions 0/2/3/4 §8.7.4 / §7.10. |
| [`pdfTransparencyTyped`](./transparency-typed.md) | read | Transparency Group + Soft Mask + blend modes §11. |
| [`pdfSigPades`](./sig-pades.md) | read | PAdES profile + DSS + Reference §12.8.4.3. |
| [`pdfSigAesGcm`](./sig-aes-gcm.md) | read | AES-GCM crypt filter ISO/TS 32003. |
| [`pdfDocumentParts`](./document-parts.md) | read | DPartRoot/DPart/DPM ISO/TS 32004. |
| [`pdfRedactionIso32005`](./redaction-iso32005.md) | read | Redaction workflow ISO/TS 32005. |
| [`pdfXPrepress`](./pdf-x-prepress.md) | lint | PDF/X profiles ISO 15930. |
| [`pdfWellTagged`](./well-tagged-pdf.md) | lint | WTPDF 1.0 best-practices. |
| [`pdfOptionalContentExtended`](./optional-content-extended.md) | read | OCG VE + Order tree + RBGroups §8.11. |
| [`pdfEmbeddedFilesPortfolio`](./embedded-files-portfolio.md) | read | Portfolio `/Schema`/`/Sort`/`/Navigator`. |
| [`pdfAssociatedFiles2`](./associated-files.md) | read | Extended `/AF`, PDF 2.0. |
| [`pdfXmpExtended`](./xmp-extended.md) | read | XMP packet extractor. |

## P2 — PDF 2.0 long tail (3)

| Module | Status | Description |
|--------|--------|-------------|
| [`pdfLinearizationWrite`](./linearization-write.md) | write | Linearization Parameter Dict (Annex F). |
| [`pdf3dRichMedia`](./3d-richmedia.md) | read | Detailed 3D/RichMedia §13.6. |
| [`pdfJbig2Read`](./jbig2-read.md) | read (partial) | JBIG2 segment headers — decode not implemented. |

## P3 — Catalog + Info tail, sandbox (3)

| Module | Status | Description |
|--------|--------|-------------|
| [`pdfMisc`](./misc.md) | read | SpiderInfo/Threads/Legal/Requirements/Perms/NeedsRendering. |
| [`pdfInfoDictDeprecated`](./info-dict-deprecated.md) | lint | Deprecated Info dict → XMP mapping. |
| [`pdfSandbox`](./pdf-sandbox.md) | lint | Active-content (Launch/JavaScript/SubmitForm/…) sandbox linter. |

## Legacy — PDF 1.7 read + deprecated filters (5)

| Module | Status | Description |
|--------|--------|-------------|
| [`pdfLegacyXfaRead`](./legacy-xfa-read.md) | read-only | Opaque `/XFA` packets. |
| [`pdfLegacyRc4Read`](./legacy-rc4-read.md) | read-only | RC4 v2/v3 password + decrypt. |
| [`pdfCcittFaxDecoder`](./ccitt-fax-decoder.md) | read + write | Full CCITT Group 3/Group 4 (T.4/T.6) codec. |
| [`pdfLegacyDeprecatedFilters`](./legacy-deprecated-filters.md) | read | LZW + CCITT (via `pdfCcittFaxDecoder`) + DCT + JPX. |
| [`pdfLegacyDeprecatedAnnots`](./legacy-deprecated-annots.md) | read | Sound/Movie/Screen in detail. |

## Common pattern

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);
for (const m of extras)      rt.register(m);
for (const m of bundle)      rt.register(m);

const ext = rt.resolve('pdfContentOpsExtended');
ext.typeExtGState(dict);
```

Unlike the `modules` array, `extras` entries are **not** part of the package
root's additive re-export list (`import { pdfContentOpsExtended } from
'@awacloud/pdf'` does not exist) — each extra is only reachable through the
`extras` array above, through `ModuleRuntime`, or through its own
`./extra/*` export subpath. A sibling composer that wants to avoid building a
runtime can import the extra directly by subpath and resolve its declared
`dependencies` (always core `modules` members, reachable from the package
root) itself:

```js
import { pdfContentOpsExtended } from '@awacloud/pdf/extra/content-ops-extended';
import { pdfErrors, pdfParserObj } from '@awacloud/pdf';

const ext = pdfContentOpsExtended.factory(pdfErrors.factory(), pdfParserObj.factory());
ext.typeExtGState(dict);
```

## See also

- [Bundles](../bundles/README.md)
- [API index](../README.md)
