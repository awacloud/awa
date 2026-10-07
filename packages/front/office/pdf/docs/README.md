# Documentation `@awacloud/pdf`

Pure-JS reader/writer for PDF documents. See the [package README](../README.md) for the high-level pitch and [`CHANGELOG.md`](../CHANGELOG.md) for the L3→L4 finalization history.

> **Current state** — **L4** (`awa.maturity`). Full ISO 32000-2:2020 (PDF 2.0) read + write across syntax, document structure, content streams, fonts, AcroForm, annotations, Tagged PDF, encryption (AES-256), digital signatures (PKCS#7 with real public-key verification), OCG, outlines/actions/destinations, embedded files, linearization, metadata and prepress, plus 32 opt-in extras and legacy PDF 1.7 read tolerance. See [Coverage](./guide/coverage.md) for the full breakdown.

## Guides

| Guide | Topic |
|-------|-------|
| [Getting started](./guide/getting-started.md) | Install, `ModuleRuntime` registration, first read. |
| [Read pipeline](./guide/read-pdf.md) | header → xref → trailer → catalog → pages. |
| [Extending via `.use()`](./guide/extending.md) | Extension hook, idempotence by name. |
| [Coverage](./guide/coverage.md) | Full ISO 32000-2 coverage table + extras + known limitations. |
| [Crypto — risks and limitations](./guide/crypto.md) | Encryption/signature guarantees, what `verified`/`valid` actually prove. |
| [Legacy 1.7](./guide/legacy-1.7.md) | PDF 1.x header tolerance on read + a real core-pipeline constraint. |
| [PAdES integration](./guide/pades-integration.md) | bytes → signed PDF → verification report; `tsaSign` seam; trust-model boundaries; the normative claim matrix. |

## API reference

Full index: [`api/README.md`](./api/README.md) — every sub-domain, its modules, and the 32 opt-in extras.

| Section | Modules |
|---------|---------|
| [Top-level](./api/README.md) | `pdf`, `pdfErrors`, `pdfShared` |
| [Syntax (§7.2–7.5)](./api/syntax/README.md) | `pdfTokenizer`, `pdfParser`, `pdfXref`, `pdfTrailer`, filters |
| [Document (§7.7–7.8)](./api/document/README.md) | `pdfCatalog`, `pdfPages`, `pdfPage`, `pdfDocument`, `pdfResources`, `pdfWriter`, `pdfBuilder`, `pdfIncrementalWriter`, `pdfEncryptedWriter`, `pdfXrefStreamWriter` |
| [Content (§8/§9.3–9.4)](./api/content/README.md) | `pdfContentOps`, `pdfContentStream`, `pdfGraphics`, `pdfText`, `pdfColor`, `pdfImages` |
| [Font (§9.6–9.9)](./api/font/README.md) | `pdfFont`, `pdfFontEncoding`, `pdfType3`, `pdfFontEmbed` |
| [Form (§12.7)](./api/form/README.md) | `pdfAcroForm`, `pdfFieldTree`, field typers, `pdfAppearance` |
| [Annot (§12.5)](./api/annot/README.md) | `pdfAnnot` + 12 subtype typers |
| [Tagged (§14.6–14.8)](./api/tagged/README.md) | `pdfStructTree`, `pdfStructElement`, `pdfRoleMap`, `pdfParentTree`, `pdfClassMap`, `pdfMarkedContent` |
| [Crypto (§7.6, ISO TS 32003)](./api/crypto/README.md) | `pdfSecurity`, `pdfStandardV4/V5/V6`, `pdfPermissions`, `pdfAesGcm` |
| [Sig (§12.8, ISO TS 32001/32002)](./api/sig/README.md) | `pdfSignature`, `pdfSign`, `pdfByteRange`, `pdfTimestamp`, `pdfCertChain`, `pdfDssBuilder`, `pdfSigOids`, `pdfSha1` |
| [OCG (§8.11)](./api/ocg/README.md) | `pdfOCG`, `pdfOCConfig` |
| [Outline (§12.3.3)](./api/outline/README.md) | `pdfOutline` |
| [Destination (§12.3.2)](./api/destination/README.md) | `pdfDestination` |
| [Action (§12.6)](./api/action/README.md) | `pdfAction` + 4 subtype typers |
| [Embedded (§7.11)](./api/embedded/README.md) | `pdfFileSpec`, `pdfEmbeddedFile`, `pdfCollection` |
| [Linearization (Annex F)](./api/linearization/README.md) | `pdfLinearization` |
| [Metadata (§14.3)](./api/metadata/README.md) | `pdfInfo`, `pdfXmp` |
| [Prepress (§14.11)](./api/prepress/README.md) | `pdfOutputIntent`, `pdfPageBoundary` |
| [Associated Files (PDF 2.0)](./api/associatedFiles/README.md) | `pdfAssociatedFiles` |
| [Extras](./api/extra/README.md) | 32 opt-in modules (P0/P1/P2/P3/legacy) |
| [Bundles](./api/bundles/README.md) | `pdf-large`, `pdf-full`, `pdf-legacy` |
| [Committed dist bundle matrix](./api/bundles/dist-matrix.md) | Read / Read+Write × size-segmentation, 8 roots × 2 surfaces |

## See also

- [README package](../README.md)
- [CHANGELOG](../CHANGELOG.md)
- [`@awacloud/fw` doc format spec](https://github.com/awacloud/awa/blob/@awacloud/pdf@1.0.0/packages/front/fw/docs/guide/doc-format.md)
- [`@awacloud/ooxml`](https://github.com/awacloud/awa/blob/@awacloud/pdf@1.0.0/packages/front/office/ooxml/docs/README.md) — sibling factory + bundles archetype
