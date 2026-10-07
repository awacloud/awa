# Coverage

`@awacloud/md` implements CommonMark 0.31 and the GitHub Flavored Markdown extensions in the core, plus 10 opt-in `extra/*` modules for out-of-spec extensions. This page states what the test suites cover, with their limits, and how to add a case.

**Prerequisites**: none to read it; to run the suites, Bun and a checkout of the repository (the suites live under the package's `tests/` directory, which the published package does not ship).

## Official suites

| Suite | Cases | Pass | Ref. |
|-------|------:|-----:|------|
| CommonMark 0.31 | 652 | **100 %** | [`tests/commonmark-suite.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/office/md/tests/commonmark-suite.test.js) |
| GFM (curated cases) | 52 | **100 %** | [`tests/gfm-suite.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/office/md/tests/gfm-suite.test.js) |
| **Total** | **704** | **100 %** | — |

How to read the 100 %: the CommonMark row runs every example of the vendored CommonMark 0.31.2 `spec.txt` through `parse` + `renderHtml`, and a lockfile test pins the version and the example count. The GFM row is **not** the full GFM spec example list: it is 52 hand-curated cases transcribed from the GFM spec sections on tables, task list items, strikethrough, extended autolinks and the disallowed raw HTML filter, so "100 %" means those 52 cases pass. The extras have no conformance suite: each one is covered by its own sibling tests only.

## Core coverage (CommonMark + GFM)

| Category | Notes |
|----------|-------|
| Blocks: ATX/Setext headings, thematic breaks, fenced/indented code blocks, HTML blocks (types 1-7), block quotes, tight/loose lists, paragraphs, lazy continuation, link reference defs | CommonMark §4 — 100 % |
| Inlines: code spans, emphasis/strong (with delimiter stack), links (inline/reference/shortcut/collapsed/autolink), images, raw HTML inline, hard/soft breaks, character/numeric entities, backslash escapes | CommonMark §6 — 100 % |
| GFM: tables (with alignment), task list items, strikethrough `~~x~~`, extended autolinks (`https://…`, `www.…`, `email@`), disallowed raw HTML filter | 100 % |

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
| Core only (CommonMark + GFM 100 %) | Resolve `'md'` directly (default `@awacloud/md` core, see [Getting started](./getting-started.md)) |
| Core + 10 extras | [`md-full`](../api/bundles/md-full.md) |
| Custom selection | `md.createMd().use(...)` chaining |

## Adding a test case

1. **Spec coverage** — the CommonMark suite reads the vendored fixture [`tests/_fixtures/commonmark/spec.txt`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/office/md/tests/_fixtures/commonmark/spec.txt), not a `references/SPEC/*.json` file (per the repo-wide rule that `references/` is never a code dependency — anything a test needs is vendored into the package); [`tests/spec-version.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/office/md/tests/spec-version.test.js) locks its version (`0.31.2`) and example count (652). No manual edits to `spec.txt`. The GFM suite is **not** auto-drawn from a spec file — [`tests/gfm-suite.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/office/md/tests/gfm-suite.test.js) is a hand-curated set of cases transcribed from `references/SPEC/Markdown/GitHub Flavored Markdown Spec.htm` (cited in the file's own header comment only; extraction from the structured HTML was impractical). Extend it by hand-writing a new case, not by regenerating from a spec source.
2. **Core behavior (out-of-spec)** — add to the sibling `*.test.js` of the relevant module (`src/block/parser.test.js`, `src/inline/parser.test.js`, `src/render/html.test.js`).
3. **Extra** — add to the sibling `src/extra/<name>.test.js`. Format: `describe('<extra> module', () => { ... })` with a factory-metadata test plus per-case tests.
4. **Integration** — add to `tests/<scenario>.test.js`. See [`tests/manipulation.test.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/office/md/tests/manipulation.test.js) as an example.

Re-run `bun test packages/front/office/md/`; everything must stay green.

## See also

- [Bundles](../api/bundles/README.md) — the core surface vs `md-full`
- [Extras](../api/extra/README.md) — detail of each module
- [Extending](./extending.md) — writing a new extra
- [CHANGELOG](../../CHANGELOG.md) — what changed, per release
