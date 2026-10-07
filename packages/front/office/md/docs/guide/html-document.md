# Markdown → one self-contained HTML page

[`mdHtmlDocument`](../api/document/html-document.md) turns one or several
Markdown sources into **one** `.html` file with no external reference: the
embedded stylesheet ([`mdHtmlTheme`](../api/document/theme.md)), a sidebar
and hash router in multi-document mode, a per-document table of contents,
cross-document links, print CSS and a licence notice are all baked into the
single output string. This guide walks through the common shapes; the full
option reference and the pipeline's exact step order are in the
[API page](../api/document/html-document.md).

**Prerequisites**: `@awacloud/md` and `@awacloud/fw` as ES modules (a browser with an import map, Bun, or Node). The examples use [`bootstrapMd`](../api/bootstrap.md), which registers the package for you; with a hand-built `ModuleRuntime`, register `fw_require`, `modules` **and** `extras` (four of the module's dependencies live in `extras`).

Every fragment passes the fw sanitiser **last and unconditionally** — see
[What the notice covers](#what-the-notice-covers) below for the licence
block, and the API page's
[Sanitisation contract](../api/document/html-document.md#sanitisation-contract)
for the security boundary itself.

## Single document

The simplest call: one document in, one page out. `bootstrapMd` registers
the package on a fresh `@awacloud/fw` `ModuleRuntime` and hands back
`htmlDocument` already resolved.

```js
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const { htmlDocument } = bootstrapMd();

const { html, warnings } = htmlDocument.build({
    documents: [{ path: 'README.md', source: '# Guide\n\n## Install\n\n## Usage\n' }],
    theme: 'light',
    lang: 'en'
});

warnings;   // [] — no unresolved link, no fallback title
```

In single-document mode heading ids are bare (`id="install"`, `id="usage"`),
so a `[[TOC]]` placeholder inside the source resolves unchanged, and there is
no sidebar or router in the output.

## Several documents, with cross-links

Pass more than one document and `build` produces a sidebar, a per-document
id prefix (`<docId>--`), and a small hash router — all embedded, no bundler.
A relative `.md` link that names another document in the set resolves to
that document's in-page anchor automatically:

```js
const documents = [
    { path: 'docs/a.md', source: '# A\n\nSee [B](b.md#setup).\n' },
    { path: 'docs/b.md', source: '# B\n\n## Setup\n' }
];

const { html: handbookHtml, documents: built } = htmlDocument.build({ documents, title: 'Handbook' });

built.map((d) => d.id);   // ['docs-a', 'docs-b']
// the link inside a.md → <a href="#docs-b--setup">B</a>
// the heading inside b.md → <h2 id="docs-b--setup">Setup</h2>
```

The rest of this guide reuses this same `documents` array (the **input**
list) in later examples — not `built`, `mdHtmlDocument.build`'s **output**
`Fragment[]`, which the API carries under the same key name.

A link to a `.md` path outside the supplied set cannot resolve to an anchor;
it falls through to the `links.unresolved` policy (`'neutralise'` by
default — see the API page's [Links](../api/document/html-document.md#links)
table).

Heading ids are unique on the page. In single-document mode a heading that
would slug to the article's own id is renamed: `a.md` holding `## A` gets
`<article id="a">` and `<h2 id="a-1">`. In multi-document mode, the
`<docId>--<slug>` scheme is kept, and a collision (`a--b.md` with `## c`
against `a.md` with `## b--c`) renames the later heading `…-1`, `…-2`. The
renamed id is the one the headings list, the per-document table of contents
and the in-document `#slug` links all use; a cross-document link to a
contested id lands on its first owner. Footnote ids are not covered by
this guarantee. HTML comments in the source never survive rendering: the
sanitiser drops them, so they cannot be used to hide text in the output.

## Theme and classification

`theme` picks one of `mdHtmlTheme.THEMES` (`'light' | 'dark' | 'auto'`,
default `'auto'` — OS preference, no script). `classification` stamps a
label/version/date onto the header badge, each document's meta line and the
footer — useful for an internal-distribution watermark:

```js
htmlDocument.build({
    documents,
    theme: 'dark',
    classification: { label: 'Internal', version: '1.2', date: '2026-09-24' }
});
```

## Custom extras

By default `build`/`renderFragment` install the four extras that
`md-full` also wires (`frontmatter`, `footnotes`, `toc`, `admonitions`).
Pass `extras` to replace that set entirely — resolve whichever extras you
want through the runtime first, the same way any `.use(...)` consumer would
(see [Extending](./extending.md)):

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const emoji = runtime.resolve('mdEmoji');
const toc = runtime.resolve('mdToc');

htmlDocument.build({ documents, extras: [toc, emoji] });   // no frontmatter/footnotes/admonitions
```

`extras: []` disables every extra — admonition fences like `> [!NOTE]` then
render as plain blockquote text, since nothing installs the syntax.

## The `resolve` hook

`links.resolve(target, from)` intercepts every relative link before the
built-in document-set lookup runs: `.md` targets and every other relative
target (images, `dir/`, a `?query`). `target.markdown` tells the two apart.
Return a string to win outright, or `null`/nothing to fall through:

```js
htmlDocument.build({
    documents,
    links: {
        resolve(target, from) {
            // target = { path: 'guides/setup.md', fragment: 'linux' | null, markdown: true }
            if (!target.markdown) return 'https://cdn.example.org/' + target.path;   // e.g. img/p.png
            if (target.path.startsWith('guides/')) {
                return 'https://example.org/' + target.path.replace(/\.md$/, '.html');
            }
            return null;   // fall through to the document set, then `unresolved`
        },
        unresolved: 'keep'
    }
});
```

A `null` for a non-Markdown target leaves the link exactly as written, with
no warning; the `unresolved` policy and the `link/unresolved` warning
concern `.md` targets only. Links that are in-page (`#x`), external
(`https:`, `mailto:`), root-relative (`/x`) or empty never reach the hook.

The string a hook returns is **not** exempt from sanitisation: it goes
through the same fw pass as every other `href`, so a hostile
`javascript:` return is dropped like any other input.

## In a browser, via import map

`mdHtmlDocument` is reached the same way as every other `@awacloud/md`
module — through `bootstrapMd` or a manually registered `ModuleRuntime` —
and needs nothing beyond the package's own import map entries:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw/": "/node_modules/@awacloud/fw/src/",
    "@awacloud/md":  "/node_modules/@awacloud/md/src/main.js",
    "@awacloud/md/": "/node_modules/@awacloud/md/src/"
}}
</script>
<script type="module">
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const { htmlDocument } = bootstrapMd();
const { html } = htmlDocument.build({
    documents: [{ path: 'note.md', source: '# Note\n\nHello from the browser.\n' }]
});

document.title = 'built';
document.documentElement.outerHTML = html;   // or write it to a Blob / download
</script>
```

Because `bootstrap.js` is imported by its `.js`-suffixed sub-path
(`@awacloud/md/bootstrap.js`), the import resolves identically whether the
host is Bun/Node's `exports`-aware resolver or a browser import map that only
understands path prefixes — see the package [README](../../README.md#exposed-sub-paths)
on why the `.js` suffix is load-bearing there.

## What the notice covers

Every emitted page carries a short licence notice — as an HTML comment in
`<head>`, and again at byte 0 of the `<style>` body (and, in multi-document
mode, at byte 0 of the `<script>` body). It documents the **embedded
stylesheet and script only**, never the Markdown content you supplied:

```
@awacloud/md html-document — the stylesheet and script embedded in this file
Copyright (c) 2026 AwaCloud SAS
SPDX-License-Identifier: AGPL-3.0-only
Dual-licensed; see the NOTICE file of @awacloud/md for licensing and any additional terms.
This notice covers the embedded stylesheet and script only, not the document content.
```

`notice.source` and `notice.extra` append two optional lines — for example a
pointer back to the document's own origin:

```js
htmlDocument.build({
    documents,
    notice: { source: 'https://example.org/handbook', extra: 'Generated 2026-09-24' }
});
```

There is no default `notice.source` — a consumer that wants a source pointer
supplies its own. Both fields are **trusted** input: only the `-->` / `*/`
breakouts that would let them escape their comment are neutralised, unlike
`Document.source`/`path`/`title`, which are fully HTML-escaped as untrusted
content.

## See also

- [API reference: document/html-document](../api/document/html-document.md) — full option tables, the pipeline's exact step order, the sanitisation contract, the shell's class contract
- [API reference: document/theme](../api/document/theme.md) — the embedded stylesheet and its tokens
- [Bootstrap](../api/bootstrap.md) — `bootstrapMd(opts)`
- [Extending](./extending.md) — writing/resolving an extra to pass via `options.extras`
- [Read+write](./read-write.md) — sanitizing a plain `renderHtml` fragment, when a full document is more than you need
