# API Reference

| Section | Modules | Description |
|---------|---------|-------------|
| [Syntax](./syntax/README.md) | `pdfTokenizer`, `pdfParser`, `pdfXref`, `pdfTrailer` | ISO 32000-2 §7.2–§7.5 — binary layer. |
| [Document](./document/README.md) | `pdfCatalog`, `pdfPages`, `pdfPage`, `pdfDocument`, `pdfResources`, `pdfWriter`, `pdfBuilder`, `pdfIncrementalWriter`, `pdfEncryptedWriter`, `pdfXrefStreamWriter` | §7.7 / §7.8.3 — typed document layer. |
| [Content](./content/README.md) | `pdfContentOps`, `pdfContentStream`, `pdfGraphics`, `pdfText`, `pdfColor`, `pdfImages` | §7.8 / §8 / §9.3–§9.4 — content streams. |
| [Font](./font/README.md) | `pdfFont`, `pdfFontEncoding`, `pdfType3`, `pdfFontEmbed` | §9.6 / §9.7 / §9.9 — fonts. |
| [Form](./form/README.md) | `pdfAcroForm`, `pdfFieldTree`, `pdfButtonField`, `pdfTextField`, `pdfChoiceField`, `pdfSignatureField`, `pdfAppearance` | §12.7 / §12.5.5 — interactive forms. |
| [Annot](./annot/README.md) | `pdfAnnot`, `pdfTextAnnot`, `pdfLinkAnnot`, `pdfMarkupAnnot`, `pdfShapeAnnot`, `pdfFreeTextAnnot`, `pdfInkAnnot`, `pdfStampAnnot`, `pdfFileAttachAnnot`, `pdfWidgetAnnot`, `pdfPopupAnnot`, `pdfProjectionAnnot`, `pdfRedactAnnot` | §12.5 — annotations. |
| [Tagged](./tagged/README.md) | `pdfStructTree`, `pdfStructElement`, `pdfRoleMap`, `pdfParentTree`, `pdfClassMap`, `pdfMarkedContent` | §14.6 / §14.7 / §14.8 — Tagged PDF, PDF/UA-2. |
| [Crypto](./crypto/README.md) | `pdfSecurity`, `pdfStandardV4`, `pdfStandardV5`, `pdfStandardV6`, `pdfPermissions`, `pdfAesGcm` | §7.6 + ISO TS 32003 — encryption. |
| [Sig](./sig/README.md) | `pdfSignature`, `pdfSign`, `pdfByteRange`, `pdfTimestamp`, `pdfCertChain`, `pdfDssBuilder`, `pdfSigOids`, `pdfSha1` | §12.8 + ISO TS 32001/32002 — signatures. |
| [OCG](./ocg/README.md) | `pdfOCG`, `pdfOCConfig` | §8.11 — optional content. |
| [Outline](./outline/README.md) | `pdfOutline` | §12.3.3 — bookmarks. |
| [Destination](./destination/README.md) | `pdfDestination` | §12.3.2. |
| [Action](./action/README.md) | `pdfAction`, `pdfActionGoTo`, `pdfActionUri`, `pdfActionNamed`, `pdfActionLaunch` | §12.6 — actions. |
| [Embedded](./embedded/README.md) | `pdfFileSpec`, `pdfEmbeddedFile`, `pdfCollection` | §7.11 — attachments. |
| [Linearization](./linearization/README.md) | `pdfLinearization` | Annex F — Fast Web View. |
| [Metadata](./metadata/README.md) | `pdfInfo`, `pdfXmp` | §14.3 — metadata. |
| [Prepress](./prepress/README.md) | `pdfOutputIntent`, `pdfPageBoundary` | §14.11 — prepress. |
| [Associated Files](./associatedFiles/README.md) | `pdfAssociatedFiles` | PDF 2.0 / PDF20_AN002-AF. |
| [Extras](./extra/README.md) | 32 opt-in modules (P0/P1/P2/P3/legacy) | L3+ coverage — color fonts, CID, full ExtGState, PAdES, AES-GCM, PDF/A, PDF/X, PDF/UA, WTPDF, 3D, JBIG2, legacy XFA, RC4, LZW… |
| [Bundles](./bundles/README.md) | `pdf-large`, `pdf-full`, `pdf-legacy` | Pre-wired factories combining core + extras. |

## Top-level

| Module | Source | Description |
|--------|--------|-------------|
| [`pdf`](./pdf.md) | [`src/pdf.js`](../../src/pdf.js) | Public orchestrator, `.use()` hook. |
| [`pdfErrors`](./errors.md) | [`src/errors.js`](../../src/errors.js) | `PdfError` hierarchy. |
| [`pdfShared`](./_shared/README.md) | [`src/_shared/index.js`](../../src/_shared/index.js) | Byte-level constants and stateless helpers. |
| `main` (re-export) | [`src/main.js`](../../src/main.js) | See [`main`](./main.md). |

## See also

- [Documentation index](../README.md)
- [Guide getting-started](../guide/getting-started.md)
