# @awacloud/md

Pure-JavaScript Markdown parser and serializer for the browser, built on CommonMark 0.31 and the GitHub Flavored Markdown extensions (tables, task lists, strikethrough, extended autolinks, the disallowed raw HTML filter). It parses to a CommonMark-compatible AST, renders HTML, Markdown (CommonMark + GFM roundtrip) and XML, offers opt-in extras (frontmatter, math, footnotes, wikilinks, admonitions, highlight, sub/superscript, table of contents, emoji, mermaid) and can assemble Markdown documents into one self-contained HTML page. The only dependency is [`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/md@1.0.0/packages/front/fw); no Node API is used.

Coverage claim, with its limit: every example of the vendored CommonMark 0.31.2 specification passes, while the GFM extensions are covered by a hand-curated set of cases, not by the full GFM example list; the extras are covered by their own tests only. See the [coverage guide](./docs/guide/coverage.md).

## Installation

```bash
npm install @awacloud/md
```

In the browser, resolve the packages through an import map (adjust the paths to where your server exposes them):

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw":  "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/": "/node_modules/@awacloud/fw/src/",
    "@awacloud/md":  "/node_modules/@awacloud/md/src/main.js",
    "@awacloud/md/": "/node_modules/@awacloud/md/src/"
}}
</script>
```

## Quick Start

`@awacloud/md` is factory-only: its entry point exports `@awacloud/fw` module descriptors in four arrays (`fw_require`, `modules`, `extras`, `bundle`), never a resolved `md` instance. Register the arrays you need on a `ModuleRuntime`, then resolve by name. `fw_require` holds the `@awacloud/fw` modules the package consumes and goes first.

### Parse and render

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';

fw.runtime.registerAll(fw_require);   // the @awacloud/fw modules md consumes
fw.runtime.registerAll(modules);      // the md modules, dependencies first
const md = fw.runtime.resolve('md');

md.renderHtml('# Hello\n\n*world*');  // '<h1>Hello</h1>\n<p><em>world</em></p>\n'

const ast = md.parse('# Title\n\nbody');   // a CommonMark-compatible AST
md.render(ast);                            // HTML from an AST ('renderHtml' takes text)
md.renderMarkdown(ast);                    // '# Title\n\nbody\n' (accepts an AST or text)
```

### Isolated instance (worker-safe)

The resolved `md` carries `.createMd(opts)`, which spawns an independent instance with its own options and its own `.use()` list:

```js
const m = md.createMd({ sourcepos: true });
m.parse('# Title\n\nbody').firstChild.sourcepos;   // [[1, 1], [1, 7]]
```

### Bootstrap helper

[`bootstrapMd`](./docs/api/bootstrap.md) registers all four manifest arrays on a `ModuleRuntime` (a fresh one, or a host-supplied one) and returns lazy accessors (`md`, `mdFull`, `htmlDocument`, `resolve`):

```js
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const { md: booted } = bootstrapMd();
booted.renderHtml('# Hi\n');   // '<h1>Hi</h1>\n'
```

### With the full bundle (all extras)

```js
import { extras, bundle } from '@awacloud/md';

fw.runtime.registerAll(extras);   // the opt-in extras
fw.runtime.registerAll(bundle);   // the pre-wired composition
const mdFull = fw.runtime.resolve('mdFullBundle');
mdFull.renderHtml('---\ntitle: x\n---\n\n:rocket: $e=mc^2$ ==go==');
```

`mdFullBundle` installs the extras on the `md` instance the runtime already holds, so after this call `fw.runtime.resolve('md')` is the same extended instance. Take a core-only `md.createMd()` first when you need one.

### One self-contained HTML page

`mdHtmlDocument` (in `modules`) depends on four extras (`mdToc`, `mdFrontmatter`, `mdFootnotes`, `mdAdmonitions`), so `extras` must be registered too:

```js
const { build } = fw.runtime.resolve('mdHtmlDocument');
const { html } = build({ documents: [{ path: 'a.md', source: '# A\n\nhello\n' }] });
html.startsWith('<!DOCTYPE html>');   // true: one file, no external reference
```

## The `.use(...)` hook

Each `md` instance exposes `.use(ext)` to plug in an extra. The contract is `{ name, install(md) }`: `install` receives the `md` API and patches `parse` / `render` / `renderHtml` according to its needs. Idempotent: registering an extra with the same name is a no-op.

```js
const md2           = fw.runtime.resolve('md').createMd();
const mdFrontmatter = fw.runtime.resolve('mdFrontmatter');
const mdEmoji       = fw.runtime.resolve('mdEmoji');

const m2 = md2.use(mdFrontmatter).use(mdEmoji);
m2.parse('---\ntitle: x\n---\n\n:rocket: launch').data.frontmatter;   // { lang: 'yaml', content: 'title: x' }
m2.renderHtml('---\ntitle: x\n---\n\n:rocket: launch');               // '<p>🚀 launch</p>\n'
```

The shape differs from ooxml's `.use()` hook (which relies on `hydrate*` / `dehydrate*` hooks on the AST nodes) and matches the markdown-it / remark ecosystem, where extensions modify the tokenizer or the rendering. See [`docs/guide/extending.md`](./docs/guide/extending.md).

## Pre-built bundles (`dist/`)

Each of the two assembly roots (`md`, `md-full`) ships as a **two-surface build**, generated by `tools/generate-bundles.mjs` (repository only, not part of the published package; a driver over `@awacloud/tool-prebuild-generator`) and regenerated with:

```sh
bun run gen:bundles
```

| Surface | Path | `dependencies` |
|---------|------|-----------------|
| fw-mode: `dist/build/<root>.{js,min.js,meta.json}` (`@awacloud/md/build/<root>.js`) | fw-mode | the `@awacloud/fw` modules the roots consume (`secPolicy`, `sanitize`, `htmlEntities`, `url`), injected by a `ModuleRuntime` |
| framework-free: `dist/standalone/<root>.{js,min.js,meta.json}` (`@awacloud/md/standalone/<root>.js`) | framework-free | none: every fw and md-local factory is inlined |

`dist/build/index.js` (`@awacloud/md/build/index.js`) is an fw-mode barrel re-exporting the whole `@awacloud/md` namespace (the four registration arrays and every named descriptor) for bulk registration.

```js
import { mdBundled } from '@awacloud/md/standalone/md.js';

const standalone = mdBundled.factory();   // no registration, no @awacloud/fw
standalone.renderHtml('# Hi\n');          // '<h1>Hi</h1>\n'
```

## Source structure

```
src/
├── main.js                entry point: the four descriptor arrays + named re-exports
├── bootstrap.js           bootstrapMd(opts), the runtime-bootstrap primitive
├── md.js                  the md facade descriptor (mdMod)
├── md-walker.js           visitor walker (enter/exit hooks)
├── common.js              char codes + HTML/url helpers
├── errors.js              MdError / ParseError / RenderError / ContractError
├── ast/                   Node, Walker, manipulation, types
├── block/                 block-phase CommonMark parser and its sub-modules
├── inline/                inline-phase CommonMark + GFM parser and its sub-modules
├── refs/                  link reference map
├── render/                html, markdown (CommonMark + GFM roundtrip), xml
├── extra/                 the opt-in extras (frontmatter, math, …)
├── document/              mdHtmlTheme + mdHtmlDocument: md(s) → one self-contained HTML page
└── bundles/               md-full (core with the extras pre-wired)
```

## Documentation

- [`docs/README.md`](./docs/README.md): full index
- [`docs/guide/getting-started.md`](./docs/guide/getting-started.md): first steps
- [`docs/guide/read-write.md`](./docs/guide/read-write.md): parse + render HTML/MD/XML, CommonMark + GFM roundtrip
- [`docs/guide/extending.md`](./docs/guide/extending.md): writing an extra `{ name, install(md) }`
- [`docs/guide/coverage.md`](./docs/guide/coverage.md): CommonMark + GFM coverage and its limits
- [`docs/guide/html-document.md`](./docs/guide/html-document.md): md(s) → one self-contained HTML page (single/multi, theme, custom extras, the `resolve` hook, in a browser)
- [`docs/api/`](./docs/api/): API reference by module (core, extras, bundles)

## Tests

Unit tests are co-located (`src/**/*.test.js`) and integration tests live in `tests/`; both stay in the repository (the published package ships neither). From the monorepo root:

```sh
bun test packages/front/office/md/
```

The suite includes the CommonMark spec examples (`tests/commonmark-suite.test.js`), the curated GFM cases (`tests/gfm-suite.test.js`) and a lockfile pinning the CommonMark spec version.

## Design choices

- **CommonMark-compatible AST**: `Node` with unprefixed public slots, XML format modelled on `cmark --to xml`.
- **Markdown roundtrip**: `renderMarkdown(ast)` re-emits CommonMark + GFM that re-parses to a structurally identical AST. Of the extras' node types only `subscript`, `superscript` and `highlight` are serialised; `math_*`, `footnote_*`, `admonition` and the `html_*` nodes an extension builds are emitted as the empty string (see [`docs/api/render/markdown.md`](./docs/api/render/markdown.md)).
- **Output hardening is the default**: `renderHtml` / `render` run with `safe` on, so raw HTML written in the Markdown source is stripped and `javascript:` / `vbscript:` / `file:` / `data:` URLs are neutralized (`data:image/*` re-allowed with `allowDataImage: true`). The HTML the built-in extras generate themselves (admonitions, footnotes, highlight, math, Mermaid containers) is kept, and so is the HTML a third-party extension builds with `mdNode.trustedHtmlInline` / `mdNode.trustedHtmlBlock`; any other `html_inline` / `html_block` node an extension creates is stripped. Pass `safe: false` for spec-exact CommonMark output (raw HTML passes through, only the GFM disallowed tags such as `<script>` are escaped), and `sanitize: true` to pipe the output through `@awacloud/fw/dom/rendering/sanitize.js`. See [`docs/api/md.md`](./docs/api/md.md).
- **Single self-contained HTML document builder**: [`mdHtmlDocument`](./docs/api/document/html-document.md) turns one or several Markdown sources into ONE `.html` file with no external reference (embedded theme, sidebar, per-document TOC, cross-links, print CSS, licence notice). It renders with an explicit `safe: false` and passes every fragment through the fw sanitiser last and unconditionally; that pass is the single security boundary, never the renderer's own `safe` / `sanitize` options, which would run before the heading anchors and link rewrites and strip author raw HTML the sanitiser's allowlist keeps.
- **Zero external npm dependency**: `htmlEntities` (HTML5 table) and `url.encodeSafe` (CommonMark percent-encode) come from `@awacloud/fw`.
- **Worker-safe**: each factory is self-sufficient; `createMd()` produces isolated state.
- **Browser-oriented**: no Node API (`fs`, `Buffer`, `node:*`) is used.

## See also

- [`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/md@1.0.0/packages/front/fw): `ModuleRuntime` + shared helpers
- [CommonMark 0.31](https://spec.commonmark.org/0.31.2/): implemented spec
- [GitHub Flavored Markdown](https://github.github.com/gfm/): GFM extensions

## Exposed sub-paths

| Sub-path | Target | Usage |
|----------|--------|-------|
| `@awacloud/md` | `src/main.js` | Index: the four descriptor arrays (`fw_require`, `modules`, `extras`, `bundle`) and every module descriptor by binding name |
| `@awacloud/md/modules` | `src/main.js` | Same file as the root, for consumers that import the manifest through an explicit sub-path |
| `@awacloud/md/md` | `src/md.js` | The `md` facade descriptor (`mdMod`), not a ready instance |
| `@awacloud/md/md-full` | `src/bundles/md-full.js` | The `mdFullBundle` descriptor: the core with every extra pre-wired |
| `@awacloud/md/bootstrap.js` | `src/bootstrap.js` | [`bootstrapMd(opts)`](./docs/api/bootstrap.md): registers all four manifest arrays on a `ModuleRuntime` and returns lazy accessors (`md`, `mdFull`, `htmlDocument`) in one call |
| `@awacloud/md/extra/*.js` | `src/extra/*.js` | One extra by file name with the `.js` suffix, e.g. `@awacloud/md/extra/frontmatter.js`: the form to import from browser code (see below) |
| `@awacloud/md/extra/*` | `src/extra/*.js` | The same extras without the suffix (`frontmatter`, `math`, `footnotes`, `wikilinks`, `admonitions`, `highlight`, `subsuper`, `toc`, `emoji`, `mermaid`); resolved by Bun/Node through the exports map |
| `@awacloud/md/bundles/*` | `src/bundles/*.js` | One bundle by file name, e.g. `@awacloud/md/bundles/md-full` |
| `@awacloud/md/build/*` | `dist/build/*` | Pre-built fw-mode bundles (`dependencies` declared) and the `index.js` barrel |
| `@awacloud/md/standalone/*` | `dist/standalone/*` | Pre-built framework-free bundles (every fw factory inlined) |

See [`docs/api/bundles/README.md`](./docs/api/bundles/README.md).

**Import extras with the `.js` suffix** (`@awacloud/md/extra/frontmatter.js`). Both key forms resolve under Bun/Node through the `exports` map, but a browser import map that maps `@awacloud/md/` to a path prefix (`…/md/src/`) has no exports-map awareness: the extension-less form requests `…/src/extra/frontmatter` and 404s, and one failed import unlinks the whole module graph. The `.js`-suffixed form resolves identically in both regimes.

## Maturity

`L4`, the highest level of the monorepo's maturity scale (`awa.maturity` in `package.json`): code, tests and documentation are publication-ready. Release history: [`CHANGELOG.md`](./CHANGELOG.md).

## Licence

[AGPL-3.0-only](./LICENSE). Copyright (c) 2026 AwaCloud SAS. A commercial licence is also available; see [`NOTICE`](./NOTICE). The commonmark.js attribution (BSD-2-Clause) travels in [`third-party/NOTICE-commonmark`](./third-party/NOTICE-commonmark).

## Project

- Website: https://awaforge.eu
- Source: [`packages/front/office/md`](https://github.com/awacloud/awa/tree/@awacloud/md@1.0.0/packages/front/office/md)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: [`SECURITY.md`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/SECURITY.md)
