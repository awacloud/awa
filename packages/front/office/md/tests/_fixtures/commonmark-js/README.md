# commonmark.js test files fixture

Vendored copies of two test files of commonmark.js, the CommonMark
reference implementation in JavaScript, consumed by
`commonmark-js.integration.test.js`.

- **Upstream source**: `commonmark.js` (https://github.com/commonmark/commonmark.js)
  at tag `0.31.2` — the tag whose `test/spec.txt` is byte-identical to the
  CommonMark 0.31.2 spec vendored in `../commonmark/`.
- **Files**:

  | File | Upstream path | Bytes | Examples | SHA-256 |
  |---|---|---|---|---|
  | `regression.txt` | `test/regression.txt` | 7583 | 32 | `bc076c02a1f4a4e67c73a8ea46b40b9311c6da3e327a62a623e9ec0248b58941` |
  | `smart_punct.txt` | `test/smart_punct.txt` | 4002 | 15 | `5ba9c2a2c39d8ee3211bb3538e61bb6707554e0eb23ac86f2b5f5c243556da58` |

- **Licence**: BSD-2-Clause, the licence of the commonmark.js repository;
  its `LICENSE` names exceptions only for other files (`test/spec.txt`, a
  polyfill, benchmark samples). The notice and conditions are reproduced in
  `PROVENANCE.md`. The files are copied unchanged and are not part of the
  published package (`package.json` `files` does not list `tests/`).

The files are fetched with `bun cli.ts references fetch
office-commonmark-js-regression` and `… office-commonmark-js-smart-punct`
(the manifest pins the same SHA-256) and copied here byte for byte: tests
never read `references/`. Do not hand-edit them; replace them wholesale and
update the tag, sizes and SHA-256 above. `.gitattributes` keeps git from
converting their line ends.

## How the test runs them

Both files use the spec's example format (`→` stands for a tab). Each runs
with the parser configuration commonmark.js gives it: `regression.txt`
with the default parser, `smart_punct.txt` with `smart` on. An example
passes when `renderHtml(markdown, { safe: false })` equals the expected
HTML byte for byte.

Every example of `regression.txt` passes. The examples that differ are
pinned by number: `smart_punct.txt` 11, 12 and 14 — dashes (`--`, `---`)
and ellipses (`...`). The `smart` option of `@awacloud/md` is documented
as typographic quotes only; these cases are outside what it claims.
