# veraPDF corpus subset

Third-party PDF test files read by
`tests/verapdf-subset.integration.test.js`: every PDF of the veraPDF
corpus tag `v1.28.1` of at most 32 KiB, **671 of its 906 files**
(6,021,779 bytes), copied byte for byte. Licence and attribution:
[`PROVENANCE.md`](PROVENANCE.md). These files are test fixtures only and are
not part of the published package (`package.json` `files` does not list
`tests/`).

## Layout

- `files/<upstream path>` — each file keeps its path in the upstream
  repository, spaces included (`PDF_UA-1/7.2 Text/7.2-t02-fail-a.pdf`), so
  it can be traced to the section of ISO 19005 (PDF/A), ISO 14289 (PDF/UA)
  or ISO 32000 it tests.
- `MANIFEST.json` — the tag, the SHA-256 of the upstream archive, the
  selection rule and, per file, its path, byte count and SHA-256. The test
  checks every file against it and refuses unlisted files.
- `.gitattributes` — `* -text`: git never converts these bytes, whatever
  its text detection or a host's line-end settings decide (every file has
  binary bytes today, but a rewritten line end would shift every
  cross-reference offset of a future one that does not).

Every section of the tag is represented: PDF_A-1b 415, PDF_UA-1 107, TWG
test files 63, PDF_A-4 24, PDF_UA-2 15, PDF_A-2b 14, Undefined 8, files at
the root of the tag 7 (of 18), PDF_A-3b 7, ISO 32000-1 4, PDF_A-4f 4,
PDF_A-4e 2, ISO 32000-2 1.

## What the test claims

The `-pass-` / `-fail-` part of a file name is the file's verdict against
a PDF/A or PDF/UA requirement. `@awacloud/pdf` does not validate PDF/A or
PDF/UA, so the test does not use those verdicts: every file must be read by
the base reader (at least one page) and must survive `write` with its page
count. One file is refused, on purpose:
`PDF_UA-1/7.16 Security/7.16-t01-fail-a.pdf` is encrypted, and `read`
throws `pdf/document/encrypted` because it composes no decrypt path (see
the package README). With `{ allowEncrypted: true }` it throws
`pdf/document/objstm-encrypted`, because its page tree is held in an object
stream.

## Re-deriving the subset

From the monorepo root:

```bash
bun cli.ts references fetch office-verapdf-corpus
bun cli.ts office-scorecard verapdf-subset --check
```

The first command fetches the whole tag (906 files, about 40 MB) into the
git-ignored `references/OFFICE-CORPUS/`; its archive hash is pinned. The
second re-applies the rule and reports any difference with `MANIFEST.json`
or the committed files. `bun cli.ts office-scorecard verapdf-subset`
rewrites the subset.
