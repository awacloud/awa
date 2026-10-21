# pdfium test files — provenance and licence

| Field | Value |
|---|---|
| Work | the test files of pdfium, the PDF library of the Chromium project (`testing/resources`) |
| Creator | The PDFium Authors, <https://pdfium.googlesource.com/pdfium/> |
| Source | <https://pdfium.googlesource.com/pdfium/+/7c55203ed66b0461378323e3fcf2efaf76755241/testing/resources/>, `main` commit `7c55203ed66b0461378323e3fcf2efaf76755241` (2026-10-15), tree `02e9045fced7bef51baffcfc3ee61242b40c5697` |
| Pinned listing | the gitiles JSON listing of that tree (`?format=JSON&recursive=1&long=1`: every file's git blob id and size), SHA-256 `72eb35d309a5c4ca411e3712ce891145361aecb8aa6f8cd251e05affc618efb0`. gitiles builds its archives at each request (two downloads of the same commit hash differently), so each file is pinned by its blob id instead of an archive hash |
| Licence | BSD 3-Clause, "Copyright 2014 The PDFium Authors", followed in the same file by the Apache License 2.0 text: the repository's `LICENSE`, copied byte for byte as [`UPSTREAM-LICENSE.txt`](UPSTREAM-LICENSE.txt) |
| Fetched | 2026-10-16: the listing with `bun cli.ts references fetch office-pdfium-testing-resources`, the files from one archive of the commit, each checked against its blob id |
| Selection | every `.pdf` of `testing/resources` that has a `.in` template of the same name in the same directory — the file the template generates, from text the PDFium Authors wrote: 239 of 343 files, 668,494 bytes (234 at the top level, 5 in `xfa/`) |
| Changes | none — every file is a byte-for-byte copy; per-file byte count, SHA-256 and git blob id in `MANIFEST.json` |

Not included:

- the 104 `.pdf` files with no `.in` template (`MANIFEST.json`
  `excluded`): no statement says where they come from, so the repository
  licence alone is not taken to cover them;
- the `.in` templates themselves, the expected renderings (`.png`), the
  JavaScript and event files, the fonts of `testing/resources/fonts/`
  (each face has its own licence) and every other file of the tree.

Attribution: test files of *pdfium* by The PDFium Authors,
<https://pdfium.googlesource.com/pdfium/>, under the BSD 3-Clause licence
of the repository. The files were selected but not modified.
