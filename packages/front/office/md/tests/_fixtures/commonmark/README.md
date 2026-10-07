# CommonMark spec fixture

Vendored copy of the official CommonMark spec test suite, consumed by
`commonmark-suite.test.js` and `spec-version.test.js`.

- **Upstream source**: `commonmark.js` (https://github.com/commonmark/commonmark.js),
  `test/spec.txt`.
- **CommonMark version**: 0.31.2.
- **File**: `spec.txt`, 205025 bytes.
- **SHA-256**: `257c41ad946f7a1414a499aca402a1aa8fdac3678532266611348c1cf54f4b80`.

Vendored per the repository rule that `references/` is documentation/design input only — no direct
runtime relation is permitted between code/tests and `references/`.
Anything a test needs must be vendored into the package, precedent
`@awacloud/facturx`'s `tests/_fixtures/` corpus (2026-07-07). This file is a
byte-identical copy of `references/SPEC/Markdown-sample/
commonmark.js-master/test/spec.txt` on the main tree; do not hand-edit —
replace wholesale and bump the SHA-256/version above if CommonMark
upgrades.
