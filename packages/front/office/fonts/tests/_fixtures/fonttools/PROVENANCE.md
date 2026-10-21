# fonttools test fonts — provenance and licences

| Field | Value |
|---|---|
| Work | the binary test fonts of fontTools, a Python library to manipulate font files |
| Source | <https://github.com/fonttools/fonttools>, tag `4.66.1` (2026-09-29), commit `9e95795b745a10a1462d56339e70189480f6545a` |
| Archive | `https://github.com/fonttools/fonttools/archive/refs/tags/4.66.1.tar.gz`, SHA-256 `dcb2ff59d87e63a9c0f0d618210cbac976540b348c04fbcf5b45497561fa8015` |
| Fetched | 2026-10-13, with `bun cli.ts references fetch office-fonttools` |
| Selection | the binary files of `Tests/` with a clear provenance (below): 212 fonts and one README; the other 36 binary files are listed in `MANIFEST.json` `excluded`, with the reason |
| Changes | none — every file is a byte-for-byte copy; per-file SHA-256 in `MANIFEST.json` |

## AOTS fonts — Apache License 2.0

`vendor/Tests/ttLib/tables/data/aots/` — 206 `.otf` files and the
directory's `README`, which states that they were built from
<https://github.com/adobe-type-tools/aots> at revision
`1c41fd20d2b020177625541a228c4c7c934879ef` ("Fonts were built by running
"make" and copying tests/*.otf over"). That repository's `LICENSE.md` at
that revision, copied byte for byte as
[`UPSTREAM-AOTS-LICENSE.md`](UPSTREAM-AOTS-LICENSE.md), reads "Copyright
2000-2016 Adobe Systems Incorporated. All Rights Reserved. Licensed under
the Apache License, Version 2.0"; the licence text it points to is
[`UPSTREAM-APACHE-2.0.txt`](UPSTREAM-APACHE-2.0.txt) (from
<https://www.apache.org/licenses/LICENSE-2.0.txt>). The repository has
no `NOTICE` file.

Attribution: *Annotated OpenType Specification test fonts* by Adobe
Systems Incorporated, <https://github.com/adobe-type-tools/aots>, built
and distributed by the fontTools project, licensed under the Apache
License 2.0. The files were selected but not modified.

## fontTools-made fonts — MIT

`vendor/Tests/ttx/data/` — `TestOTF.otf`, `TestTTF.ttf`, `TestTTC.ttc`,
`TestTTCv2.ttc`, `TestWOFF.woff`, `TestWOFF2.woff2`. Each one's `name`
table states "Copyright (c) 2015 by FontTools. No rights reserved." and
points to the fontTools licence. That licence, the repository's `LICENSE`
(MIT, "Copyright (c) 2017 Just van Rossum"), is copied byte for byte as
[`UPSTREAM-LICENSE.txt`](UPSTREAM-LICENSE.txt).

## Not included

- Fonts that carry, or derive from, a third-party family (their own
  copyright in the `name` table, or a family the fontTools
  `LICENSE.external` lists under the SIL Open Font License): 11 files.
- Files with no copyright or licence record and no stated origin: 19
  files, the raw table blobs among them.
- Type 1 and Mac resource-fork fonts, a format the package does not
  claim: 6 files.
- Every TTX (XML) source, Python test and other file of the repository.

The `tools/office-scorecard` suites still measure the excluded fonts,
from the fetched archive; only their scores are published, never the
files.
