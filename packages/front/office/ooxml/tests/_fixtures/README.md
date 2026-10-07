# `@awacloud/ooxml` test fixtures

> Provenance — the test packages of `@awacloud/ooxml` are **generated
> in-test** by the package's own code (see
> `tests/roundtrip.integration.test.js`), then compared with themselves after
> a read/write round trip. Hand-written markup reconstructed from a
> specification is built in-test the same way (see
> `src/docx/docx.repeating-section.test.js`).
>
> Exception: one vendored binary produced by Microsoft Word,
> `word-repeating-section.docx` (see § Vendored files). Reading other files
> produced by the reference applications (Word / Excel / PowerPoint) is
> validated only once such files are added here.

## Adding a vendored fixture

To add a fixture produced by Word / Excel / PowerPoint:

1. Create the smallest file that shows the feature, in the reference
   application.
2. Place it here under an explicit name (`word-empty.docx`,
   `excel-2cells.xlsx`, `pptx-1slide.pptx`).
3. Record its provenance in this file: application name and version,
   expected content, and anything particular about the file.
4. Add an integration test that reads it through `docx.read()` /
   `xlsx.read()` / `pptx.read()` and checks that the modelled content
   matches what is expected.

Until such files exist, coverage of **reading** files produced by
Word / Excel / PowerPoint stays informal. Writing is validated by a
self-consistent round trip.

## Vendored files

### `word-repeating-section.docx`

A document saved by Microsoft Word that contains one repeating-section
content control (`w15:repeatingSection`) with one item
(`w15:repeatingSectionItem`), plus other block and inline content controls.

| Field | Value |
|---|---|
| Saved by | Microsoft Office Word, `AppVersion` 16.0000 (`docProps/app.xml`) |
| Source | [aspose-words/Aspose.Words-for-Java](https://github.com/aspose-words/Aspose.Words-for-Java), `Examples/Data/Structured document tags.docx` |
| Pinned commit | `2d85861729034f4ca420b7b9d8a7b753136c151f` (2023-01-17) |
| sha256 | `1533d704384011939dc138f590e8ac2ef568d86a2e6866526ded52db9a255045` |
| Size | 31 501 bytes, byte-identical to the file at the pinned commit |
| Licence | MIT, Copyright (c) 2001-2016 Aspose Pty Ltd — full text in `word-repeating-section.LICENSE.txt` (the upstream `LICENSE` at the pinned commit, verbatim) |

The file is kept byte-for-byte as published upstream (its `docProps/core.xml`
carries the original author metadata); it is not shipped in the npm package
(`tests/` is outside the `files` allowlist).

The test `Word-authored repeating-section template` in
`src/docx/docx.repeating-section.test.js` reads it, checks that at least one
repeating section with at least one item is modelled, writes it back and
checks that a second read gives the same content-control kinds, section
titles and item counts, with the `w15` namespace declared and listed in
`mc:Ignorable` on the written document.
