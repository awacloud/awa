# pdf-differences test files — provenance and licence

| Field | Value |
|---|---|
| Work | pdf-differences — targeted test files for PDF features that widely used implementations interpret differently |
| Creator | the PDF Association, <https://github.com/pdf-association> |
| Source | <https://github.com/pdf-association/pdf-differences>, commit `907fe96e52b73e491489eee545c47b119bf9989b` (the repository has no tag) |
| Archive | `https://github.com/pdf-association/pdf-differences/archive/907fe96e52b73e491489eee545c47b119bf9989b.tar.gz`, SHA-256 `e6f5f16c45bed1920a47dac52572a9e4bfd3e5624286fc46e571c271c98382e6` |
| Licence | Creative Commons Attribution 4.0 International (CC BY 4.0), <https://creativecommons.org/licenses/by/4.0/> |
| Licence statement | the upstream `README.md`: "PDF files are copyright by the PDF Association and distributed under a Creative Common Attribution 4.0 International (CC BY 4.0) license" (the repository's `LICENSE`, Apache-2.0, covers its source code) |
| Fetched | 2026-10-13, with `bun cli.ts references fetch office-pdf-differences` |
| Selection | every `.pdf` of the commit but the two real-world files of `UnknownFilter/`: 35 of 37 files |
| Changes | none — every file is a byte-for-byte copy; per-file SHA-256 in `MANIFEST.json` |

Not included:

- `UnknownFilter/382252277877c00a92f3bb54daef1413bafe5557e2f5f7c32c23e800cd9bdcd4.pdf`
  and `UnknownFilter/4387ba480c6f935b8e97749d40b3c001ad584b7bda66ca2c040be67337669497.pdf`:
  the upstream case description calls them real-world, unmodified PDFs
  found during the SafeDocs program. They are not PDF Association works,
  so the CC BY 4.0 statement does not cover them.
- the case descriptions (`README.md` of each directory), screenshots,
  spreadsheets, word-processor sources and HTML pages: no licence statement
  of their own covers them. The expectations the test checks are written
  in `README.md` here, not copied.

Attribution, as asked by CC BY 4.0: *pdf-differences* by the PDF
Association, <https://github.com/pdf-association/pdf-differences>,
licensed under CC BY 4.0. The files were selected but not modified.
