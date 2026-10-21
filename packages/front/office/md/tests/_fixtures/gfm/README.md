# GFM spec fixture

Vendored copy of the GitHub Flavored Markdown spec test file, consumed by
`gfm-spec.integration.test.js`.

- **Upstream source**: `cmark-gfm` (https://github.com/github/cmark-gfm),
  `test/spec.txt` at tag `0.29.0.gfm.13`.
- **Spec version**: 0.29-gfm (front matter `version: 0.29`, dated
  2019-04-06).
- **File**: `spec.txt`, 216680 bytes.
- **SHA-256**: `7d8e5814befec287ac116786d81ff14e0adc9b13295b4494649e995408fd871c`.
- **Licence**: CC BY-SA 4.0, as stated in the file's own front matter
  (`license: '[CC-BY-SA 4.0](http://creativecommons.org/licenses/by-sa/4.0/)'`).
  The file is copied unchanged and is not part of the published package
  (`package.json` `files` does not list `tests/`).

The file is fetched with `bun cli.ts references fetch office-gfm-spec`
(the manifest pins the same SHA-256) and copied here byte for byte: tests
never read `references/`. Do not hand-edit it; replace it wholesale and
update the tag, size and SHA-256 above. `.gitattributes` keeps git from
converting its line ends.

## How the test runs it

The spec appends extension names to some example fences (`example table`,
`example autolink`, `example tagfilter`, …) and marks two examples
`disabled`. Each example runs with exactly the extensions its fence
names, as cmark-gfm's own runner does: `extendedAutolinks` for
`autolink`, `disallowedRawHtml` for `tagfilter`; tables, strikethrough and
task lists are always on in `@awacloud/md`. The disabled examples (279 and
280, the two task-list examples) are not run, so this file tests no task
list; `gfm-suite.test.js` covers them.

Nine examples are expected to differ, and the test pins them: 398, 426,
434, 435, 436, 473, 474, 475, 477. GFM 0.29 collapses nested strong
emphasis (`****foo****` gives one `<strong>`), while CommonMark 0.31.2,
which `@awacloud/md` implements, nests it — the same inputs pass in
`commonmark-suite.test.js`.
