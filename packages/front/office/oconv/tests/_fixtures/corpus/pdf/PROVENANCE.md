# `@awacloud/oconv` pdf read corpus — provenance & licence

> Vendored per the durable owner ruling (`ai/memory/lessons.md`,
> 2026-07-20): **`references/` is documentation, never a code dependency** —
> anything a test consumes is committed under this package. The pdf reader
> tests (`src/read/pdf-to-ir.test.js`) read the COMMITTED bytes below and
> never fetch or reach outside the package.

## 1 — `facturx-minimum-sample.pdf` — first-party copy of `@awacloud/facturx`'s committed corpus

A **byte-identical copy** of the file already committed in the sibling
`@awacloud/facturx` package at
`packages/front/office/facturx/tests/_fixtures/corpus/facturx-minimum-sample.pdf`.
It is copied here (not re-fetched) so the `@awacloud/oconv` pdf-reader suite is
self-contained in a fresh worktree/clone without cross-package fixture
reads.

| File | Bytes | SHA-256 |
|---|---|---|
| `facturx-minimum-sample.pdf` | 299343 | `44cad7dc69d4b459c8fdee2afd8097e056e778d057aa7587e49cca163abc7f00` |

The SHA-256 matches the pin recorded in `@awacloud/facturx`'s own corpus README
(`.../facturx/tests/_fixtures/corpus/README.md`, MINIMUM profile row),
verified on copy.

**Upstream provenance** (unchanged from the facturx corpus): the official
**FNFE-MPE Factur-X 1.09** MINIMUM example invoice — a real PDF/A-3 document
with an embedded Cross-Industry Invoice (CII) XML, published by the Forum
National de la Facture Électronique as an interop/conformance reference.
Licence: FNFE-MPE official Factur-X example invoices, published precisely to
be used as interop references (no redistribution restriction). See the
facturx corpus README for the full FNFE-MPE provenance and the ZUGFeRD
cross-check pins.

**Rationale for vendoring here**: task 05
(`ai/batches/types/office/BATCH_14/05-pdf-to-ir.md`) requires the tier-1 pdf
reader to be measured end-to-end against a REAL PDF. This MINIMUM sample
carries embedded, ToUnicode-bearing fonts, so it exercises the full read
path (public content-stream graph → per-page font resolution → ToUnicode
decode) on genuine, non-synthetic bytes.

**Measured decode coverage** (this reader, `pdfToIr` over `pdf.read` — tasks
01 + 02 delivered): 1 page, **4128 / 4128 character codes decoded = 100.00%
(0 undecodable)**, all via the ToUnicode-CMap path; 3585 content-stream
operators; one `image/dropped` loss (the embedded logo raster — tier 1 keeps
no images). This re-measures the W0 **pre-AGL 0.9% bound** — the lift comes
from task 01 making `pdfContentStream` reachable through the public module
graph and the embedded fonts' own ToUnicode CMaps (the AGL hop from task 02
is the fall-back for fonts that lack a ToUnicode; it is unit-tested
separately in `src/read/pdf/font-decoder.test.js`).

## Refresh procedure

1. Re-copy from the facturx corpus if that pin ever changes, and re-verify
   the SHA-256 above equals the facturx README's MINIMUM row.
2. Re-run `bun test packages/front/office/oconv/` after any change here.
