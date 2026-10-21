# pdf-differences test files

Third-party PDF test files read by
`tests/pdf-differences.integration.test.js`: the PDF Association's
*pdf-differences* repository at commit `907fe96e5`, **35 of its 37 PDFs**
(220,147 bytes), copied byte for byte. Each of its 18 directories shows one
PDF feature that widely used implementations interpret differently.
Licence and attribution: [`PROVENANCE.md`](PROVENANCE.md). These files are
test fixtures only and are not part of the published package
(`package.json` `files` does not list `tests/`).

## Layout

- `files/<upstream path>` — each file keeps its path in the upstream
  repository (`UnknownFilter/UnknownFilter-Font.pdf`).
- `MANIFEST.json` — the commit, the SHA-256 of the upstream archive, the
  selection rule, the two excluded files with their reason and, per file,
  its path, byte count and SHA-256. The test checks every file against it
  and refuses unlisted files.
- `.gitattributes` — `* -text`: git never converts these bytes (a rewritten
  line end would shift every cross-reference offset of these mostly-text
  files).

## What the test claims

`@awacloud/pdf` parses content streams to operators and does not render
them, so a difference in painting is not something it can get right or
wrong. Each file is either run, with the return the reader must give, or
skipped, with the reason:

| Files | Expected return |
|---|---|
| `PDF-version/` (3) | `doc.version` is the header's `1.4`, `doc.catalog.version` the newest catalog's `1.6`. ISO 32000-2 § 7.5.2 makes the file's version the greater of the two; the reader exposes both and computes no effective version. |
| `UnknownFilter/UnknownFilter-xrefstm.pdf` | `read` throws `pdf/filter/unsupported`: the only cross-reference stream uses an unknown filter. |
| `UnknownFilter/` `objstm`, `PageContentStream`, `Font`, `ImageXObject`, `FormXObject`, `ICC` (6) | `read` returns the page; every in-use object either resolves and decodes or throws a typed `pdf/…` error, and at least one throws. |
| `UnknownFilter/` `Linearized`, `OutlineObjStm` (2) | upstream expects a readable document; the reader throws, pinned as known misses (below). |
| `Inline-Image-Abbreviations/InlineAbbreviations.pdf` | the page content parses to 8 inline images; each keeps its keys as written (full and abbreviated side by side); decoded with the abbreviated keys first (ISO 32000-2 § 8.9.7 as corrected), each gives the same 600 bytes (20 × 10 pixels, RGB, 8 bits). |
| 14 painting directories (21 files) | skipped — fill and stroke, blend modes, dashes, line caps, mitre limits, default and indexed colour spaces, negative font size, Type 3 word spacing, text clipping, vertical text. The test still reads each file and parses its page content. |
| `PageLabels-UX/` (1) | skipped — page labels are carried raw (`doc.catalog.pageLabels`), never computed. |

Known misses, both outside what the reader claims:

- `UnknownFilter-Linearized.pdf`: the unknown filter sits on the first-page
  cross-reference stream, which is the only section that locates the
  catalog and the page. Reaching them needs cross-reference
  reconstruction, which the reader does not do: `read` throws
  `pdf/filter/unsupported`.
- `UnknownFilter-OutlineObjStm.pdf`: in this file, the incremental update's
  `startxref`, `/XRefStm` and cross-reference entry 16 point 20 bytes
  before their targets. The reader does not search around a wrong offset:
  `read` throws `pdf/parser/indirect-bad-num`.

One upstream detail the test pins: in `UnknownFilter-PageContentStream.pdf`
the content stream dictionary closes with a single `>`
(`<< /Length 108 /Filter /XXXDecode >` then `stream`), so that object fails
as malformed (`pdf/tokenizer/unexpected-rangle`) before its filter is
reached; the rest of the file reads.

Not vendored: the two real-world files of `UnknownFilter/` (64-hex-digit
names), which are not PDF Association works (see `PROVENANCE.md`); their
issue is left undisclosed upstream.

## Re-deriving the files

From the monorepo root:

```bash
bun cli.ts references fetch office-pdf-differences
```

The command downloads the pinned archive (3.3 MB, SHA-256 checked) into
the git-ignored `references/OFFICE-CORPUS/pdf-differences/`. Extracting it
gives the 37 PDFs; the 35 vendored files are byte-identical to their
counterparts (`MANIFEST.json` lists their SHA-256). The scorecard suite
`pdf-differences` of `tools/office-scorecard` reads the vendored files and
checks them against this manifest.
