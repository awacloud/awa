# `src/prepress/` — generated asset provenance

## `srgb-icc.js` — the sRGB ICC profile of a PDF/A output intent

**Status: first-party, generated in code; no third-party bytes.**

`buildSrgbIcc()` assembles an ICC **v2 display profile** (`mntr` / `RGB ` /
`XYZ `). It is not a copy of any ICC file: every byte is written by the
function from the public **IEC 61966-2.1 sRGB colorimetry**, whose
constants are facts.

- **Header (128 bytes)**: profile size; version `2.1.0`; device class
  `mntr`; colour space `RGB `; connection space `XYZ `; the `acsp`
  signature at offset 36; perceptual rendering intent; the profile connection space illuminant
  (`0.9642, 1.0000, 0.8249`).
- **Tags**: `desc` (the profile name), `wtpt` (that illuminant as white point),
  `rXYZ` / `gXYZ` / `bXYZ` (the sRGB colorants adapted to it: r `0.43607,
  0.22249, 0.01392`, g `0.38515, 0.71687, 0.09708`, b `0.14307, 0.06061,
  0.71410`), one `curv` (a gamma of about 2.2) shared by `rTRC` / `gTRC` /
  `bTRC`, and `cprt` (a first-party statement naming `@awacloud/pdf`).

The generator is the one `@awacloud/facturx` ships for its PDF/A-3 output
intent (`facturx/src/assets/srgb-icc.js`, validated there by veraPDF for
PDF/A-3b), written again here because pdf cannot import facturx; only the
`desc` / `cprt` texts differ.

**Validation**: `pdfBuilder` writes it as the default destination profile
under `pdfA`; veraPDF 1.30.3 judges the builder's PDF/A-4 and PDF/A-2b
documents conforming with it (the `verapdf-pdfa` suite of
`tools/office-scorecard`, recorded in `coverage/evidence/verapdf-pdfa.json`).
A caller who needs another output condition passes its own profile
(`builder({ pdfA, outputIntent })`).
