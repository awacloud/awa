# Prepress — ISO 32000-2 §14.11

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [`pdfOutputIntent`](./outputIntent.md) | `{ typeOutputIntent }` | `pdfErrors`, `pdfParser` | §14.11.5 — target colour environment. |
| [`pdfSrgbIcc`](./srgb-icc.md) | `{ buildSrgbIcc, SRGB_ICC_N, SRGB_CONDITION }` | — | A first-party sRGB ICC profile, the default destination profile of a PDF/A output intent. |
| [`pdfPageBoundary`](./pageBoundary.md) | `{ effectiveMediaBox, effectiveCropBox, effectiveTrimBox, effectiveBleedBox, effectiveArtBox }` | `pdfErrors`, `pdfParser` | §14.11.2 — boundary boxes. |

## See also

- [Document](../document/README.md) · [Metadata](../metadata/README.md)
