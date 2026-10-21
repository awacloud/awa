# A few OFL faces

Third-party font files read by `tests/ofl-faces.integration.test.js`
through the shared helper `tests/_helpers/ofl-faces.js`: one face per
font technology the package claims, under the SIL Open Font License 1.1.
Licences and attribution: [`PROVENANCE.md`](PROVENANCE.md). These files
are test fixtures only and are not part of the published package
(`package.json` `files` does not list `tests/`).

| Face | Technology | File |
|---|---|---|
| Liberation Sans Regular | static TrueType, hinted | reused from `oconv-fonts/vendor/liberation/` — not copied here |
| Source Sans 3 Regular | static CFF | `vendor/source-sans/SourceSans3-Regular.otf` |
| Source Sans 3 VF Upright | variable CFF2 | `vendor/source-sans/SourceSans3VF-Upright.otf` |
| Kalnia Glaze | COLR v1 colour, variable TrueType | `vendor/kalnia-glaze/KalniaGlaze[wdth,wght].ttf` |

## Layout

- `vendor/<family>/` — each face byte for byte, with its upstream licence
  file (`LICENSE.md`, `OFL.txt`) beside it, as the OFL requires. Under a
  `vendor/` segment, as third-party bytes, which the repository's
  licence-header stamping never touches.
- `MANIFEST.json` — per face: its id, technology, path (the Liberation
  face by its path in `oconv-fonts`), byte count, SHA-256, licence,
  source URL and the OFFICE-CORPUS entry that pins it; the licence files
  the same way. The test checks every file against it and refuses
  unlisted files.
- `.gitattributes` — `* -text`: git never converts these bytes.

## What the test measures

Per face (the rules live in `tests/_helpers/ofl-faces.js`):

- **parse** — the container decodes, `fonts.read` returns, every table
  the package has a parser for returns, every `glyf` glyph resolves and
  every CharString of a name-keyed CFF font decodes (the fonttools
  helper's per-file check); for a CFF or CFF2 face the CharStrings count
  equals `maxp.numGlyphs`.
- **COLR v1 paints** — every paint graph of a COLR version 1 face, from
  the BaseGlyphList and the LayerList, decodes without an error, a cycle
  or a depth truncation.
- **subset round-trip** — for a `glyf` face, `subsetForPdf` over every
  code point the face maps, then `fonts.read` of the subset: every code
  point still maps, with the same advance width and the same outline.
  The CFF and CFF2 faces are skipped: `subsetForPdf` subsets `glyf`
  outlines only, and the test checks it refuses them with the typed
  `fonts/subset-bad-font`.

The same helper gives the `ofl-faces` suite of `tools/office-scorecard`.
