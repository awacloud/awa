# Coverage

`@awacloud/md` implements CommonMark 0.31 and the GitHub Flavored Markdown extensions in the core, plus 10 opt-in `extra/*` modules for out-of-spec extensions. This page states what the test suites cover, with their limits, and how to add a case.

**Prerequisites**: none to read it; to run the suites, Bun and a checkout of the repository (the suites live under the package's `tests/` directory, which the published package does not ship).

## Official suites

| Suite | Cases | Pass | Ref. |
|-------|------:|-----:|------|
| CommonMark 0.31.2 spec examples | 652 | 652 | [`tests/commonmark-suite.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.1.0/packages/front/office/md/tests/commonmark-suite.test.js) |
| GFM 0.29 spec examples (cmark-gfm `0.29.0.gfm.13`) | 670 | 661 | `tests/gfm-spec.integration.test.js` |
| GFM, hand-curated cases | 52 | 52 | [`tests/gfm-suite.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.1.0/packages/front/office/md/tests/gfm-suite.test.js) |

How to read these figures: the CommonMark row runs every example of the vendored CommonMark 0.31.2 `spec.txt` through `parse` + `renderHtml`, and a lockfile test pins the version and the example count. The GFM spec row runs every example of the vendored GFM 0.29 `spec.txt` with exactly the extensions its fence names, as cmark-gfm does; the 9 examples that do not pass (398, 426, 434, 435, 436, 473, 474, 475, 477) are nested strong emphasis such as `****foo****`, where GFM 0.29 and CommonMark 0.31.2 disagree: md follows CommonMark 0.31.2. The hand-curated GFM cases predate that row and are kept as a second check. The extras have no conformance suite: each one is covered by its own sibling tests only. The measured figures, with their dates and the commands that replay them, are in [Measured coverage](#measured-coverage) below.

## Core coverage (CommonMark + GFM)

| Category | Notes |
|----------|-------|
| Blocks: ATX/Setext headings, thematic breaks, fenced/indented code blocks, HTML blocks (types 1-7), block quotes, tight/loose lists, paragraphs, lazy continuation, link reference defs | CommonMark 0.31.2 §4 — every spec example passes |
| Inlines: code spans, emphasis/strong (with delimiter stack), links (inline/reference/shortcut/collapsed/autolink), images, raw HTML inline, hard/soft breaks, character/numeric entities, backslash escapes | CommonMark 0.31.2 §6 — every spec example passes |
| GFM: tables (with alignment), task list items, strikethrough `~~x~~`, extended autolinks (`https://…`, `www.…`, `email@`), disallowed raw HTML filter | GFM 0.29 spec — 661 of 670 examples; the 9 others are nested strong emphasis, where md follows CommonMark 0.31.2 |
| Smart punctuation (`smart: true`) | curly quotes only; dashes and ellipses are not produced (commonmark.js `smart_punct.txt`: 12 of 15 examples) |

## Opt-in extras (10)

For out-of-spec extensions, each extra is isolated under `@awacloud/md/extra/<name>`:

| Extra | Syntax | Strategy |
|-------|--------|----------|
| [`frontmatter`](../api/extra/frontmatter.md) | `---\nyaml\n---` (+ TOML / JSON) | Pre-strip before the block parser |
| [`emoji`](../api/extra/emoji.md) | `:smile:` | Post-walk text nodes |
| [`math`](../api/extra/math.md) | `$x$`, `$$x$$`, ` ```math ` | Post-walk + render wrap |
| [`footnotes`](../api/extra/footnotes.md) | `[^1]` + `[^1]: body` | Pre-strip defs + AST replace |
| [`wikilinks`](../api/extra/wikilinks.md) | `[[Page]]`, `[[Page\|alias]]` | Post-walk text nodes |
| [`admonitions`](../api/extra/admonitions.md) | GitHub `[!NOTE]` + MkDocs `!!! note` | Pre-pass + AST lower |
| [`highlight`](../api/extra/highlight.md) | `==marked==` | Post-walk text nodes |
| [`subsuper`](../api/extra/subsuper.md) | `H~2~O`, `E=mc^2^` | Post-parse AST pass (single-tilde strikethrough → subscript) + render lower to `<sub>` / `<sup>` |
| [`toc`](../api/extra/toc.md) | `[[TOC]]` placeholder + heading scan | Post-walk |
| [`mermaid`](../api/extra/mermaid.md) | ` ```mermaid ` | Post-render HTML rewrite |

Pre-wired composition: [`md-full`](../api/bundles/md-full.md) (deterministic order).

## Choosing a tier

| Need | Import |
|------|--------|
| Core only (CommonMark + GFM) | Resolve `'md'` directly (default `@awacloud/md` core, see [Getting started](./getting-started.md)) |
| Core + 10 extras | [`md-full`](../api/bundles/md-full.md) |
| Custom selection | `md.createMd().use(...)` chaining |

## Adding a test case

1. **Spec coverage** — the CommonMark suite reads the vendored fixture [`tests/_fixtures/commonmark/spec.txt`](https://github.com/awacloud/awa/blob/@awacloud/md@1.1.0/packages/front/office/md/tests/_fixtures/commonmark/spec.txt), not a `references/SPEC/*.json` file (per the repo-wide rule that `references/` is never a code dependency — anything a test needs is vendored into the package); [`tests/spec-version.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.1.0/packages/front/office/md/tests/spec-version.test.js) locks its version (`0.31.2`) and example count (652). No manual edits to `spec.txt`. The GFM suite is **not** auto-drawn from a spec file — [`tests/gfm-suite.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.1.0/packages/front/office/md/tests/gfm-suite.test.js) is a hand-curated set of cases transcribed from `references/SPEC/Markdown/GitHub Flavored Markdown Spec.htm` (cited in the file's own header comment only; extraction from the structured HTML was impractical). Extend it by hand-writing a new case, not by regenerating from a spec source.
2. **Core behavior (out-of-spec)** — add to the sibling `*.test.js` of the relevant module (`src/block/parser.test.js`, `src/inline/parser.test.js`, `src/render/html.test.js`).
3. **Extra** — add to the sibling `src/extra/<name>.test.js`. Format: `describe('<extra> module', () => { ... })` with a factory-metadata test plus per-case tests.
4. **Integration** — add to `tests/<scenario>.test.js`. See [`tests/manipulation.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.1.0/packages/front/office/md/tests/manipulation.test.js) as an example.

Re-run `bun test packages/front/office/md/`; everything must stay green.

## See also

- [Bundles](../api/bundles/README.md) — the core surface vs `md-full`
- [Extras](../api/extra/README.md) — detail of each module
- [Extending](./extending.md) — writing a new extra
- [CHANGELOG](../../CHANGELOG.md) — what changed, per release

<!-- office-scorecard:begin (generated by `bun cli.ts office-scorecard render`; do not edit by hand) -->

## Measured coverage

Generated from `coverage/scorecard.json` (format `office-scorecard/v1`) in the repository, written by the unpublished tool `tools/office-scorecard`. Each figure names its suite and version, the UTC day and the commit measured, and the command that replays it; a figure is what was measured on that suite, not a claim of conformance to a standard. Low results are published as measured.

### Code coverage

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| `bun-coverage-src` bun 1.3.13 | lines 96.88 %, functions 94.72 % (mean of 50 source files) | the coverage gate's model over the declared basis (src/**) | 2026-10-17, `cf58af11f` | `bun cli.ts office-scorecard axis-a --pkg md` |

### Conformance suites

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| [`commonmark-spec`](https://spec.commonmark.org/0.31.2/) 0.31.2 | 652 / 652 | renderHtml(example, { safe: false }) of createMd({ extendedAutolinks: false, disallowedRawHtml: false }) equals the expected HTML byte for byte | 2026-10-13, `e93e57e5d` | `bun cli.ts office-scorecard axis-b --suite commonmark-spec` |
| [`gfm-spec`](https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/test/spec.txt) 0.29-gfm@0.29.0.gfm.13 | 661 / 670 | each example runs with exactly the GFM extensions its fence names, as cmark-gfm runs them: createMd({ extendedAutolinks: names autolink, disallowedRawHtml: names tagfilter }) (tables, strikethrough and task lists are always on in md); renderHtml(example, { safe: false }) equals the expected HTML byte for byte; examples marked disabled are skipped; 2 cases not run, each with its reason in the scorecard | 2026-10-13, `e93e57e5d` | `bun cli.ts office-scorecard axis-b --suite gfm-spec` |
| [`commonmark-regressions`](https://github.com/commonmark/commonmark.js/blob/0.31.2/test/regression.txt) commonmark.js@0.31.2 | 32 / 32 | renderHtml(example, { safe: false }) of createMd({ extendedAutolinks: false, disallowedRawHtml: false }) equals the expected HTML byte for byte (commonmark.js runs this file with its default parser) | 2026-10-13, `e93e57e5d` | `bun cli.ts office-scorecard axis-b --suite commonmark-regressions` |
| [`commonmark-smart`](https://github.com/commonmark/commonmark.js/blob/0.31.2/test/smart_punct.txt) commonmark.js@0.31.2 | 12 / 15 | renderHtml(example, { safe: false }) of createMd({ extendedAutolinks: false, disallowedRawHtml: false, smart: true }) equals the expected HTML byte for byte (commonmark.js runs this file with new Parser({ smart: true })) | 2026-10-13, `e93e57e5d` | `bun cli.ts office-scorecard axis-b --suite commonmark-smart` |

### Robustness on wild and pathological inputs

| Suite | Result | What is measured | Measured | Replay |
|---|---|---|---|---|
| [`cmark-pathological`](https://github.com/commonmark/cmark/blob/0.31.2/test/pathological_tests.py) cmark@0.31.2 | 25 / 25 ok | with the default options, renderHtml (renderMarkdown for nested inlines) returns output matching cmark's regex for the case, or refuses with the typed md/limit-exceeded; within the budget; budget: 5000 ms per case at the upstream size (cmark's own timeout); a case taking 200 ms or more must take at most 3x its time at half the input length (best of 2 runs at each size) | 2026-10-13, `d8ed3fc63` | `bun cli.ts office-scorecard axis-d --suite cmark-pathological` |
| [`cmark-pathological-unlimited`](https://github.com/commonmark/cmark/blob/0.31.2/test/pathological_tests.py) cmark@0.31.2 | 25 / 25 ok | with maxDepth and maxNodes set to Infinity, renderHtml (renderMarkdown for nested inlines) returns output matching cmark's regex for the case; within the budget; budget: 5000 ms per case at the upstream size (cmark's own timeout); a case taking 200 ms or more must take at most 3x its time at half the input length (best of 2 runs at each size) | 2026-10-13, `d8ed3fc63` | `bun cli.ts office-scorecard axis-d --suite cmark-pathological-unlimited` |

### Other projects on the same suites

Figures other projects publish (or that their own test data fixes, marked derived), on the same suite and version as an entry above, with where and when they were read.

| Suite | Project | Result | Source | Read on |
|---|---|---|---|---|
| [`commonmark-spec`](https://spec.commonmark.org/0.31.2/) 0.31.2 | markdown-it 15.0.3 (its spec fixtures: 652 passing examples, none in the failing list) | 652 / 652 | [source](https://github.com/markdown-it/markdown-it/tree/15.0.3/test/fixtures/commonmark) | 2026-10-16 |
| [`commonmark-spec`](https://spec.commonmark.org/0.31.2/) 0.31.2 | marked 18.1.1 (derived: its own spec run marks examples 32, 33 and 503 as expected failures) | 649 / 652 | [source](https://github.com/markedjs/marked/blob/v18.1.1/test/specs/commonmark/commonmark.0.31.2.json) | 2026-10-16 |
| [`commonmark-spec`](https://spec.commonmark.org/0.31.2/) 0.31.2 | micromark 4.0.3 (self-published: "100% CommonMark compliance", tested against commonmark.json ^0.31) | 652 / 652 | [source](https://github.com/micromark/micromark#readme) | 2026-10-16 |

<!-- office-scorecard:end -->
