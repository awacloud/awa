# Corpus — `assets/`

Image assets used by the `fromMd` **asset-manifest** legs (BL-980,
office/BATCH_35 task 02). They are the bytes a caller passes in
`fromMd({ …, assets: { 'diagram.png': <bytes> } })`.

## Origin

**First-party, hand-authored.** Every byte of both files is assembled from
the format specification by
[`../../gen-asset-fixtures.js`](../../gen-asset-fixtures.js) — no third-party
corpus, no download, no licence question (office memory 2026-07-21, corpus
licensing: run the licence gate *before* picking content; here there is no
third-party content to gate). Regenerate with, from the repo root:

```bash
bun packages/front/office/oconv/tests/_fixtures/gen-asset-fixtures.js
```

The generator is kept for provenance only; the suites read the **committed**
bytes and never re-run it.

| File | Bytes | SHA-256 |
|---|---|---|
| `px.png` | 70 | `686593006ba0db476865efa25ff90ccde940772284aa95d79ebef425e65394c7` |
| `px.jpg` | 141 | `3fce9107e83f35eda4b2568c57c033ef9943818c105d8d651305875377db63e5` |

## `px.png` — 1×1 greyscale PNG (colour type 0, 8-bit)

Signature + `IHDR` + `IDAT` + `IEND`. The `IDAT` payload is a zlib stream
wrapping ONE **stored** (uncompressed) deflate block, so the whole file is
derivable by hand; the CRC-32 and Adler-32 values are computed by the
generator, never transcribed.

Colour type **0** is deliberate. The usual "1×1 transparent PNG" is colour
type 6 (RGBA), which `src/write/image-header.js` refuses to name at all
(it needs an `sMask` this wave does not build). Colour type 0 is one of the
two types the header reader *can* name, so this fixture exercises the
documented `md → pdf` boundary — **geometry read, placement refused**,
`layout/image-dropped` with `reason: 'unsupported-encoding'` and
`format: 'png'` — instead of the weaker "format not recognised" branch.

## `px.jpg` — 1×1 greyscale baseline JPEG (ITU-T T.81)

Assembled segment by segment: `SOI`, `DQT` (one 8-bit luminance table),
`SOF0` (baseline DCT, 8-bit precision, 1×1, one component), two `DHT`
tables (the smallest legal pair — one code of length 1 for symbol `0x00`),
`SOS`, one byte of entropy-coded scan data (`0b00111111`: the DC
category-0 code, the AC End-Of-Block code, padded with 1 bits), `EOI`.

This is the format that **actually places** in `md → pdf`: JPEG bytes are
directly embeddable behind `/Filter /DCTDecode`, so `pdfBuilder.addImage`
takes them verbatim.

### Independent verification (measured, 2026-09-09)

The repository ships no JPEG decoder, so the scan was verified against an
**out-of-repo** decoder on the authoring station — GDI+ via PowerShell:

```powershell
Add-Type -AssemblyName System.Drawing
[System.Drawing.Image]::FromFile('…/px.jpg')   # 1x1, Format8bppIndexed
[System.Drawing.Image]::FromFile('…/px.png')   # 1x1, Format32bppArgb
```

Both files decoded, at the declared 1×1 geometry. That check is a
station-local measurement (it is not part of `bun test` and cannot be — no
in-repo decoder exists); the suites verify only what this repository can
verify itself: the header fields, the placement, and the resulting PDF
object graph.
