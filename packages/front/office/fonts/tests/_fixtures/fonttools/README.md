# fonttools test fonts

Third-party test fonts read by `tests/fonttools.integration.test.js`
through the shared helper `tests/_helpers/fonttools.js`: the binary test
files of fonttools 4.66.1 `Tests/` whose provenance is clear — **212
fonts** (1,144,112 bytes) and the README of the AOTS directory. Copied
byte for byte. Licences and attribution: [`PROVENANCE.md`](PROVENANCE.md).
These files are test fixtures only and are not part of the published
package (`package.json` `files` does not list `tests/`).

## Layout

- `vendor/Tests/<upstream path>` — each file keeps its path in the
  fonttools tree: the 206 AOTS fonts of `Tests/ttLib/tables/data/aots/`
  (with that directory's `README`) and the six fontTools-made fonts of
  `Tests/ttx/data/` (`TestOTF.otf`, `TestTTF.ttf`, `TestTTC.ttc`,
  `TestTTCv2.ttc`, `TestWOFF.woff`, `TestWOFF2.woff2`). Under a `vendor/`
  segment, as third-party bytes, which the repository's licence-header
  stamping never touches.
- `MANIFEST.json` — the tag, its commit, the SHA-256 of the upstream
  archive, the selection rule and, per file, its path, byte count,
  SHA-256 and licence; `upstreamNotices` lists the three licence files
  the same way; `excluded` names every other binary file of `Tests/`
  (36) with the reason it is not here. The test checks every file
  against the manifest and refuses unlisted files.
- `UPSTREAM-LICENSE.txt` — fonttools' `LICENSE` (MIT), byte for byte.
- `UPSTREAM-AOTS-LICENSE.md` — the `LICENSE.md` of `adobe-type-tools/aots`
  at the revision the AOTS fonts were built from, byte for byte.
- `UPSTREAM-APACHE-2.0.txt` — the Apache License 2.0 text that file
  points to, as served by apache.org.
- `.gitattributes` — `* -text`: git never converts these bytes.

## What the test measures

Whether the package parses each file, per file and per table. The rules
live in `tests/_helpers/fonttools.js`; in short:

- **Wiring** — `fw_require`, `modules` and `extras` registered in one
  `ModuleRuntime`, with the Brotli static dictionary loaded
  (`brotliDictWords.setBlob`), as fw documents it for Bun and Node.
- **Containers** — told by their first bytes: SFNT, TTC (each font
  extracted), WOFF, WOFF2, a raw CFF table.
- **Per file** — the container decodes, `fonts.read` returns on every
  font it holds, every table the package has a parser for (core and
  extras) returns, every `glyf` glyph resolves and every CharString of a
  name-keyed `CFF ` font decodes. A WOFF2 whose `glyf` is transformed is
  judged on its untransformed tables (the package does not reverse the
  transform), without `fonts.read`.
- **Per table** — every table instance the package has a parser for
  returns from that parser. Tables no parser reads are listed as skipped,
  with their count.

The test pins every file's outcome (the two AOTS `cmap` format 4 fonts
that map code points past the glyph count are refused by the documented
cross-table check), the per-table counts and the skipped cases. The same
helper gives the `fonttools-fonts` and `fonttools-tables` suites of
`tools/office-scorecard`, which also measure the excluded files from the
fetched archive.
