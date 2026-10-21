# pdfium test files

Third-party PDF test files read by
`tests/pdfium-resources.integration.test.js`: the PDFs of pdfium's
`testing/resources` at commit `7c55203ed` that are generated from a `.in`
template, **239 files** (668,494 bytes), copied byte for byte. Many are
deliberately damaged: reproducers of pdfium bugs (cross-reference tables
that point nowhere, page trees that loop, streams without `endstream`,
unknown filters, unknown content operators). Licence and attribution:
[`PROVENANCE.md`](PROVENANCE.md). These files are test fixtures only and
are not part of the published package (`package.json` `files` does not
list `tests/`).

## Layout

- `files/<upstream path>` — each file keeps its path under
  `testing/resources` (`bug_113.pdf`, `xfa/...`).
- `MANIFEST.json` — the commit, the tree listing that pins it (URL and
  SHA-256), the upstream licence file with its SHA-256, the selection
  rule, the 104 excluded files with their reason and, per file, its path,
  byte count, SHA-256 and git blob id. The test checks every file against
  it and refuses unlisted files.
- `UPSTREAM-LICENSE.txt` — the repository's `LICENSE`, byte for byte.
- `.gitattributes` — `* -text`: git never converts these bytes (a
  rewritten line end would shift every cross-reference offset).

## What the test claims

Per file, `read` and then every content stream of every page resolved,
decoded through its filter chain and parsed to operators — what a
consumer of the read model does next — either **returns** or throws a
**typed** `pdf/…` error. Nothing else is accepted: an untyped
`TypeError` or `RangeError` fails the test. The files the reader refuses
are pinned with the code it throws (55 at this selection, 184 return), so
a change of behaviour on any of them shows.

The test asserts no time and no memory: the robustness lane of
`tools/office-scorecard` (`axis-d --suite pdfium-resources`) runs each
file in a process of its own within a time and memory budget.
