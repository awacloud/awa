---
module: mdHtmlDocument
category: md/document
dependencies: [mdErrors, md, sanitize, mdToc, mdFrontmatter, mdFootnotes, mdAdmonitions, mdHtmlTheme]
returns: object
worker-safe: true
status: complete
---

# document/html-document

> Markdown (one or several documents) → ONE self-contained, sanitised HTML document: all-level heading anchors, sidebar, per-document TOC, cross-links, print CSS and a licence notice.

**Module** `mdHtmlDocument` | **Source** `packages/front/office/md/src/document/html-document.js` | **Deps** `mdErrors`, `md`, `sanitize`, `mdToc`, `mdFrontmatter`, `mdFootnotes`, `mdAdmonitions`, `mdHtmlTheme` | **Worker-safe** yes

Pure string factory: no DOM, no network, no clock, no randomness. `build(x)` called twice returns the same string, byte for byte. The output is one `.html` file with no external reference. The stylesheet ([`mdHtmlTheme`](./theme.md)) and, in multi-document mode, a small hash router are embedded in it.

## Resolve

`mdHtmlDocument` is registered in `modules`. Four of its dependencies (`mdToc`, `mdFrontmatter`, `mdFootnotes`, `mdAdmonitions`) live in `extras`, so register both arrays:

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const { renderFragment, build } = runtime.resolve('mdHtmlDocument');
```

Or in one call, through [`bootstrapMd`](../bootstrap.md), which registers all four manifest arrays:

```js
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const { htmlDocument } = bootstrapMd();
const { html } = htmlDocument.build({ documents: [{ path: 'README.md', source: '# Hello\n' }] });
```

## Types

```
Document  = { path: string, source: string, title?: string }
Extension = { name: string, install(md) }          // a RESOLVED extra, e.g. runtime.resolve('mdEmoji')
Warning   = { code: 'link/unresolved' | 'title/fallback' | 'heading/unanchored', document: string, detail: string }
Heading   = { level: 1|2|3|4|5|6, text: string, id: string }
Fragment  = { id: string, path: string, title: string, html: string, headings: Heading[], warnings: Warning[] }

LinkOptions = {
  external?:   'new-tab' | 'same-tab',      // default 'new-tab'
  unresolved?: 'neutralise' | 'keep',       // default 'neutralise'
  resolve?:    (target: { path: string, fragment: string|null, markdown: boolean }, from: Document) => string | null
}
TocOptions  = false | { minLevel?: number, maxLevel?: number, minHeadings?: number }   // default { 2, 3, 2 }

FragmentOptions = {
  extras?: Extension[], links?: LinkOptions, toc?: TocOptions, id?: string, idPrefix?: string,
  reservedIds?: Iterable<string>      // ids already used on the page; a colliding heading id is renamed (see Anchors)
}

BuildOptions = {
  documents: Document[],                                     // length ≥ 1
  title?: string,                                            // <title> + brand; default: 1 doc → its title, N docs → 'Documents'
  lang?: string,                                             // default 'en'; must match /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/
  theme?: 'light' | 'dark' | 'auto',                         // default 'auto' (mdHtmlTheme.THEMES)
  classification?: { label?: string, version?: string, date?: string },
  extras?: Extension[],                                      // default DEFAULT_EXTRAS
  links?: LinkOptions,
  toc?: TocOptions,
  css?: string,                                              // TRUSTED caller CSS appended inside <style>
  notice?: { source?: string, extra?: string }               // appended lines of the notice block
}
BuildResult = { html: string, documents: Fragment[], warnings: Warning[] }   // warnings = flattened documents[].warnings, document order
```

`DEFAULT_EXTRAS = [frontmatter, footnotes, toc, admonitions]`. These are the four resolved instances the factory receives, installed in that order (the canonical `md-full` relative order: frontmatter first, toc before admonitions).

`FragmentOptions.toc` is accepted but `renderFragment` does not use it. `FragmentOptions.reservedIds` is validated by `renderFragment` itself: anything but an iterable of strings (or absent) throws `md/document-bad-option` with `context.option === 'reservedIds'`; a bare string is rejected, as it would iterate as characters. `build` renders the per-document TOC itself (see [Pipeline](#pipeline)).

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `renderFragment` | `(document: Document, options?: FragmentOptions) => Fragment` | One Markdown source as a sanitised body fragment, with heading ids, the heading list and warnings |
| `build` | `(options: BuildOptions) => BuildResult` | One complete HTML page for N ≥ 1 documents |

### Errors

| Code | Class | Thrown by | When |
|------|-------|-----------|------|
| `md/document-bad-input` | `ContractError` | `renderFragment`, `build` | `documents` not an array or empty; an entry not an object; `path` not a non-empty string; `source` not a string; `title` present but not a string. `context: { index, field }`. `index` is `null` for `renderFragment` and for the `documents` array itself; `field` is `null` when the entry is not an object. |
| `md/document-bad-option` | `ContractError` | `build`, `renderFragment` (`reservedIds` only) | `theme` not in `THEMES`; `lang` fails the regex; `links.external` / `links.unresolved` outside their enums; `links.resolve` present but not a function; `toc` neither `false` nor an object with integer levels in 1..6, `minLevel ≤ maxLevel` and an integer `minHeadings ≥ 0`; `extras` not an array of `{ name, install }`; `title` / `css` / `notice.source` / `notice.extra` / `classification.*` present but not strings (or `links` / `notice` / `classification` not objects). `context: { option, got }`. `renderFragment` throws it only for `reservedIds` not being an iterable of strings. |

`build` validates everything before it does any work. `renderFragment` validates only its `document`.

## Pipeline

`renderFragment(document, options)` runs these steps in this exact order:

1. `const m = md.createMd(); for (const e of extras) m.use(e);`, where `extras` = `options.extras ?? DEFAULT_EXTRAS`.
2. `const ast = m.parse(document.source)`.
3. `headings = toc.collectHeadings(ast, { minLevel: 1, maxLevel: 6 })` → `[{level,text,slug}]`. `mdToc` is the package's single slug owner, and the `-1`, `-2` dedupe comes from it. Then **reserved ids**: a heading whose final id (`idPrefix + slug`) is in `options.reservedIds` is renamed `slug-1`, `slug-2`, … (the first id that is neither reserved nor the final id of another heading of the fragment). With no collision the headings are untouched and the output is byte-identical to a call without `reservedIds`.
4. **Title**:
   - `document.title`, if present.
   - Otherwise, when `ast.data.frontmatter && ast.data.frontmatter.lang === 'yaml'`, the first line of `ast.data.frontmatter.content` matching `/^title:\s*(.+?)\s*$/m`, with one pair of surrounding `"`/`'` removed.
   - Otherwise the text of the first level-1 heading.
   - Otherwise the basename of `path` without its extension, plus a `title/fallback` warning whose detail is that basename.
5. `let html = m.render(ast, { safe: false })`. An explicit `safe: false` (the renderer hardens by default) and no `sanitize` here: both would run before steps 6 to 8 and strip author raw HTML the step-9 allowlist keeps; step 9 is the single boundary.
6. **Heading anchors**: collect the renderer's bare tags `/<h([1-6])>([\s\S]*?)<\/h\1>/g` in order.
   - **Positional pairing**: when there are exactly as many bare tags as `headings`, with the same level at each position, tag *i* is paired with `headings[i]`. This means no raw-HTML heading is interleaved.
   - **Text walk**: otherwise, keep a cursor into `headings`. A tag is anchored when its `level` equals `headings[cursor].level` AND `norm(innerHtml)` equals `norm(headings[cursor].text)`. `norm` strips tags, decodes `&amp; &lt; &gt; &quot;`, collapses whitespace and trims. A tag that does not match is left untouched: it came from raw HTML.
   - An anchored tag becomes `<hN id="${idPrefix}${slug}">…`.
   - Any heading still unpaired at the end gets a `heading/unanchored` warning, with its text as the detail. See [Anchors](#anchors) for when this can happen.
7. **Id prefix (multi-document)**: when `idPrefix !== ''`, every remaining `id="X"` attribute becomes `id="${idPrefix}X"`, and every `href="#X"` becomes `href="#${idPrefix}X"` (when step 3 renamed the heading `X`, the link follows it to the new slug first). This covers footnote `fn-`/`fnref-` pairs and `[[TOC]]` links. The heading tags anchored in step 6 are not prefixed a second time. In single mode (`idPrefix === ''`) nothing changes, so `[[TOC]]` output resolves as it does today.
8. **Links**: each `<a href="…"( [^>]*)>` open tag is rewritten. See [Links](#links).
9. **Sanitise, always, last, unconditionally**: `html = sanitize.sanitizeHtml(html, ALLOWLIST)`, where `ALLOWLIST = { allowedTags: new Set([...sanitize.defaultAllowlist.tags, 'input']), allowedAttributes: { ...sanitize.defaultAllowlist.attributes, input: new Set(['type', 'checked', 'disabled']) } }`. GFM task-list checkboxes survive. `input` never keeps `name`/`value`/`form*`, and `formaction`/`action` are blocked by fw. There is no `urlSchemes` override.
10. Return `{ id, path, title, html, headings: headings.map(h => ({ level, text, id: idPrefix + slug })), warnings }`, where `id` = `options.id ?? docIdOf(path)`.

`docIdOf(path)` = `toc.slugify(path.replace(/\.[^./\\]+$/, '').replace(/[\\/]+/g, '-'))`, or `'doc'` when that is empty.

`build(options)` runs these steps:

1. Validate. `multi = documents.length > 1`.
2. Compute doc ids: `docIdOf` per document, deduped in order with `-1`, `-2` (the `collectHeadings` scheme). Build `byPath: Map<normalisedPath, id>`.
3. Reserve the ids that must stay unique: `used` = the article ids, plus `md-nav-toggle` in multi mode. Then, **in document order**, call `renderFragment(doc, { extras, links: { ...links, resolve: setResolver }, toc, id, idPrefix: multi ? id + '--' : '', reservedIds: used })` and add every `headings[].id` of the fragment to `used` before the next document. `setResolver(target, from)` first calls the caller's `links.resolve` if there is one (for every relative target, see [Links](#links)); a string return wins. Otherwise it looks `target.path` up in `byPath`:
   - multi mode: `'#' + id + (target.fragment ? '--' + target.fragment : '')`;
   - single mode: `'#' + target.fragment`, or `'#' + id` when there is no fragment;
   - not found: `null`.
4. Per-document TOC (when `toc !== false`): take the headings with `minLevel ≤ level ≤ maxLevel`. Render them only when there are at least `minHeadings`: `<nav class="md-toc"><span class="md-toc-label">On this page</span> <a href="#id" data-level="N">text</a> · … </nav>`, with the text escaped.
5. Assemble the shell (see [Shell structure](#shell-structure-and-class-contract)).

## Anchors

- **Scheme**: heading ids are the `mdToc.collectHeadings` slugs on **every** level 1..6. Duplicates are suffixed `-1`, `-2`, … `mdToc.slugify` is ASCII-only (`\w`), for consistency with `[[TOC]]`.
- **Single document**: ids are bare (`#section`), so the links `[[TOC]]` emits resolve unchanged.
- **Uniqueness**: an id is never emitted twice in one page. `build` reserves the article ids, the shell's `md-nav-toggle` (multi mode) and the ids of the documents already rendered, so a heading that would collide is renamed `slug-1`, `slug-2`, … (first free). `renderFragment` does the same for the ids in `options.reservedIds`.
  - Single mode: `a.md` holding `## A` yields `<article id="a">` and `<h2 id="a-1">`; the headings list and the per-document TOC carry `a-1`, and so do the in-document `#a` links (`[[TOC]]` entries included). With `## A` and `## A 1` the second keeps `a-1` and the first becomes `a-2`.
  - Multi mode: `a--b.md` (`## c`) and `a.md` (`## b--c`) both slug to `a--b--c`; the first document keeps it, the second gets `a--b--c-1`. Document order decides, so output stays deterministic. A cross link to the contested id (`a.md#b--c`) resolves to `#a--b--c`, the first owner.
  - The `<docId>--<slug>` scheme, `docIdOf` and `slugify` are unchanged: anchors of documents without a collision do not move.
  - Not reserved: footnote ids (`fn-…`/`fnref-…`), which can still collide with a heading of the same name.
- **Multi-document**: every id inside document `<docId>` is prefixed `<docId>--`. This covers heading ids, footnote `fn-`/`fnref-` ids and every in-document `href="#…"`. A heading `Intro` in `guide.md` is therefore `#guide--intro`.
- **Raw-HTML headings are not anchored**: a `<h2>…</h2>` typed as raw HTML never receives an id, and a heading tag that already carries attributes is never a bare renderer tag.
- **`heading/unanchored`**: with positional pairing (no raw-HTML heading in the source), every heading is anchored. The warning is only reachable in text-walk mode, when a raw-HTML heading is present AND a Markdown heading's rendered text differs from its AST text. Examples of such headings are an image-only heading, a setext heading with a soft break, a code span that contains tag-like text, or a footnote reference.

## Links

Rewriting applies to each `<a href="…">` open tag the renderer (or raw HTML) produced:

| `href` | Result |
|---|---|
| `#…` | handled by the id prefix (step 7), never touched here |
| `/^(https?:|mailto:)/i` | `external: 'new-tab'` (default) appends ` target="_blank" rel="noopener noreferrer"`. Idempotent: an attribute already present is not repeated. `'same-tab'` leaves the tag as is. |
| relative, path part ending in `.md` (case-insensitive) | `target = { path: normalise(dirname(document.path) + '/' + decodeURIComponent(pathPart)), fragment, markdown: true }`. `normalise` is a pure POSIX normaliser: `.`/`..` segments are resolved and `\` is treated as `/`. `links.resolve(target, document)` is called when given; a string return wins verbatim (attribute-escaped). A `null` or absent return applies the `unresolved` policy: `'neutralise'` (default) → `<a class="md-dead-link" title="…original href…">`, href removed, plus a `link/unresolved` warning whose detail is the original href; `'keep'` → untouched, plus the same warning. |
| relative, any other path part (`img/p.png`, `dir/`, `?q=1`) | same `target`, with `markdown: false`. `links.resolve` is consulted; a string return rewrites the href (attribute-escaped, sanitised after). A `null` or absent return leaves the tag untouched: no `unresolved` policy, no `link/unresolved` warning. |
| anything else | untouched. This includes an empty `href=""`, root-relative (`/x.md`) and protocol-relative (`//host/x.md`) targets, and other schemes (which the sanitiser then filters). `links.resolve` is not called for them. |

Inside `build`, `resolve` is wrapped so that a link to another document of the set resolves to its in-page anchor. A link to a document outside the set stays unresolved.

## Sanitisation contract

- Every byte of `Fragment.html` has passed `@awacloud/fw` `sanitizeHtml` with the module allowlist; the shell around it is module-authored and every consumer-supplied string in the shell is escaped. There is no option that skips the sanitiser.
- Survives: the fw default allowlist (`sanitize.defaultAllowlist`) + `input[type|checked|disabled]`; `id`/`class`/`title` on any element; `href` only with `http`, `https`, `mailto`, `tel`, `ftp`, relative, `#`, `/`, `?`, `.` targets.
- Never survives: `script`, `style`, `iframe`, `object`, `embed`, `svg`, `math`, `template`, `link`, `meta`, HTML comments, every `on*` attribute, `style=`, `srcdoc`, `formaction`, `javascript:`/`vbscript:`/`data:` in `href`/`src` (so **no `data:` image ever renders**), `<`/`>`/`"` inside attribute values.
- `options.css` and `options.notice.*` are **trusted** caller input (only the `</style` / `*/` / `-->` breakouts are neutralised); `Document.source`, `Document.path`, `Document.title`, `classification.*`, `title` are **untrusted** and fully escaped.
- Remote images (`<img src="https://…">`) are kept; the shell's `referrer: no-referrer` meta is the only mitigation.

The sanitiser runs after the link pass. A string returned by a `resolve` hook therefore goes through it too: a `javascript:` target returned by a hook is dropped.

## Notice

A licence notice covering the embedded stylesheet and script (not the document content) is emitted three times:

- as an HTML comment in `<head>`;
- as a `/*! … */` comment at byte 0 of the `<style>` body;
- in multi mode, as a `/*! … */` comment at byte 0 of the `<script>` body.

Its lines, in order:

```
@awacloud/md html-document — the stylesheet and script embedded in this file
Copyright (c) 2026 AwaCloud SAS
SPDX-License-Identifier: AGPL-3.0-only
Dual-licensed; see the NOTICE file of @awacloud/md for licensing and any additional terms.
This notice covers the embedded stylesheet and script only, not the document content.
[Source: <notice.source>]
[<notice.extra>]
```

In `notice.source` and `notice.extra`, `-->` becomes `--\u003e` and `*/` becomes `* /`. There is no default source pointer; the `Source:` line appears only when `notice.source` is given. In addition, `</style` is neutralised (`<\/style`) across the whole `<style>` body, and `</script` (`<\/script`) across the whole `<script>` body.

## Shell structure and class contract

```
<!DOCTYPE html>
<html lang="…">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>…</title>
<!-- NOTICE -->
<style>/*! NOTICE */ …mdHtmlTheme.css(theme)… …options.css (every `</style` → `<\/style`)… </style>
</head>
<body class="md-document md-theme-<theme> md-single|md-multi">
<header class="md-top">[<button id="md-nav-toggle" aria-label="Menu">&#9776;</button>]<span class="md-brand">title</span>[<span class="md-classification">label</span>]</header>
[<aside class="md-nav"> one <a class="md-nav-item" href="#id" data-doc="id"><span class="md-nav-title">…</span><span class="md-nav-path">path</span></a> per document </aside>]   (multi only)
<main class="md-main">
  one <article class="md-doc" id="id"[ hidden — multi only, every article but the first]>
      <div class="md-doc-meta"><span class="md-doc-path">path</span>[<span class="md-doc-version">version</span>][<span class="md-doc-date">date</span>]</div>
      [nav.md-toc]
      <div class="md-body"> fragment.html </div>
      [<div class="md-pager"><a class="md-pager-prev" href="#prev">&larr; title</a><a class="md-pager-next" href="#next">title &rarr;</a></div>]   (multi only; a missing side is an empty <span>)
  </article>
</main>
<footer class="md-footer">[label · version · date]</footer>
[<script>/*! NOTICE */ router </script>]   (multi only)
</body>
</html>
```

The toggle button is emitted in multi mode only. Every class and attribute above is styled by [`mdHtmlTheme`](./theme.md#class-contract); the selector table there is the shared contract.

**Router** (multi only). The router is a plain ES2015 IIFE with no external reference. The document ids are emitted via `JSON.stringify(ids).replace(/</g, '\\u003c')`. On load and on `hashchange`:

1. The current document is the hash when it is a known id. Otherwise it is the hash's part before the first `--`, when that part is a known id. Otherwise it is `ids[0]`.
2. Each `article` gets `hidden = (id !== current)`.
3. `.md-nav-item.active` is toggled according to `data-doc`.
4. When the hash names a fragment inside the current document, that element is `scrollIntoView()`'d. Otherwise the page scrolls to `(0, 0)`.

`#md-nav-toggle` toggles `body.md-nav-open`.

## Examples

### Single document

```js
const { build } = runtime.resolve('mdHtmlDocument');

const { html, warnings } = build({
    documents: [{ path: 'README.md', source: '# Guide\n\n## Install\n\n## Usage\n' }],
    theme: 'light',
    lang: 'en'
});
// html: '<!DOCTYPE html>…<h2 id="install">Install</h2>…' (bare ids, no sidebar, no script)
// warnings: []
```

### Several documents with cross-links

```js
const { html, documents } = build({
    documents: [
        { path: 'docs/a.md', source: '# A\n\nSee [B](b.md#setup).\n' },
        { path: 'docs/b.md', source: '# B\n\n## Setup\n' }
    ],
    title: 'Handbook',
    classification: { label: 'Internal', version: '1.2', date: '2026-09-24' },
    notice: { source: 'https://example.org/source' }
});
// documents.map(d => d.id)   → ['docs-a', 'docs-b']
// the link in a.md           → <a href="#docs-b--setup">B</a>
// the heading in b.md        → <h2 id="docs-b--setup">Setup</h2>
```

### Custom extras

```js
const emoji = runtime.resolve('mdEmoji');
const toc   = runtime.resolve('mdToc');
const documents = [{ path: 'a.md', source: '# A\n\n[[TOC]]\n\n## B :rocket:\n' }];

build({ documents, extras: [toc, emoji] });   // replaces DEFAULT_EXTRAS entirely
renderFragment({ path: 'x.md', source: '> [!NOTE]\n> hi\n' }, { extras: [] }).html;
// '<blockquote>\n<p>[!NOTE]\nhi</p>\n</blockquote>\n'   (no admonition extra)
```

### `resolve` hook

```js
const documents = [{ path: 'a.md', source: '# A\n\nSee [setup](guides/setup.md#linux).\n' }];

build({
    documents,
    links: {
        resolve(target, from) {
            // target = { path: 'guides/setup.md', fragment: 'linux' | null, markdown: true }
            // (also called for non-.md relative links, e.g. images, with markdown: false)
            if (!target.markdown) return 'https://cdn.example.org/' + target.path;
            if (target.path.startsWith('guides/')) return 'https://example.org/' + target.path.replace(/\.md$/, '.html');
            return null;   // fall through to the document set, then to the `unresolved` policy (.md only)
        },
        unresolved: 'keep'
    }
});
```

## Notes

- **Surface choice**: the module is part of the package's source graph (`src/main.js` `modules`, re-exported by name) and is reached through a `ModuleRuntime` or [`bootstrapMd`](../bootstrap.md). There is no dedicated `dist/standalone` root for it.
- `mdToc.slugify` is ASCII-only (`\w`), so non-ASCII letters are dropped from the slug (`## Été` → `#t`). A heading with no ASCII word character at all slugs to `section`, then `section-1`, …
- No image embedding. The fw sanitiser drops every `data:` URL, so a `data:` image never renders; this is documented, not worked around. Remote images are kept as-is.
- `options.css` is appended after the theme inside the same `<style>` element, so it can override any rule.
- Output is deterministic: no date, no random id, and no dependency on the environment.

## See also

- [`document/theme`](./theme.md): the embedded stylesheet and the class contract
- [`bootstrap`](../bootstrap.md): `bootstrapMd().htmlDocument`
- [`extra/toc`](../extra/toc.md): the slug scheme and `[[TOC]]`
- [`md`](../md.md): the `md` facade (`createMd`, `use`, `parse`, `render`)
- [`errors`](../errors.md): `md/document-bad-input`, `md/document-bad-option`
