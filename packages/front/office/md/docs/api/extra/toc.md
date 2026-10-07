---
module: mdToc
category: md/extra
dependencies: [mdAstWalker, mdAstTypes]
returns: object
worker-safe: true
status: complete
---

# mdToc

> Table of contents — `[[TOC]]` placeholder + standalone `generate(ast)`.

**Module** `mdToc` | **Source** `packages/front/office/md/src/extra/toc.js` | **Deps** `mdAstWalker`, `mdAstTypes` | **Worker-safe** yes

Walks the AST, collects headings and emits a nested Markdown list. Hook mode: replaces `[[TOC]]` paragraphs with the generated list. Standalone mode: returns the list without patching.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md    = runtime.resolve('md');
const mdToc = runtime.resolve('mdToc');
const m = md.createMd().use(mdToc);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdToc'`, the key `.use()` deduplicates on |
| `install` | `(md, opts?) => void` | Patches `md.parse` (replaces `[[TOC]]` paragraphs; `opts` is forwarded to `generate`) and `md.renderHtml` |
| `generate` | `(ast, opts?) => string` | Generates the Markdown list (`''` when there is no heading) |
| `collectHeadings` | `(ast, opts?) => Array<{level,text,slug}>` | Raw collection |
| `slugify` | `(s: string) => string` | GitHub-style slugifier |
| `replaceTocPlaceholders` | `(doc: Node, parser: (text: string) => Node, opts?) => void` | Replaces each `[[TOC]]` paragraph with the parsed list, or removes it when there is no heading |

### `generate` / `collectHeadings` options

| Option | Default | Description |
|--------|---------|-------------|
| `maxLevel` | `6` | Deepest heading level included (H1–H6) |
| `minLevel` | `1` | Shallowest heading level included |

The slugifier is not an option: every slug comes from `slugify`; a repeated slug gets a `-1`, `-2`, … suffix.

## Examples

### Case 1 — placeholder

```js
const m = md.createMd().use(mdToc);
m.renderHtml('# A\n\n## B\n\n[[TOC]]\n\n## C');
// [[TOC]] is replaced by the list of headings
```

### Case 2 — standalone

```js
const md = runtime.resolve('md');
const mdToc = runtime.resolve('mdToc');
const ast = md.parse('# A\n## B\n## C');
mdToc.generate(ast);
// '- [A](#a)\n  - [B](#b)\n  - [C](#c)'
```

## Notes

- The slugifier is GitHub-anchor-style: lowercase, strip punctuation, replace spaces with `-`; a repeated slug gets a `-1`, `-2`, … suffix.
- Headings at the same depth become items at the same level; an H3 under an H1 produces two indentation levels to respect the hierarchy.
- The `[[TOC]]` placeholder must be a top-level paragraph (not inside a block_quote / list).
- `collectHeadings` returns `{level, text, slug}` — useful to generate an HTML sidebar directly. `text` is the plain text of the heading, **unescaped**: a consumer that renders it as HTML or Markdown does its own escaping.
- `generate` escapes the heading text it puts between the `[` `]` of each item, with a backslash before each of `` \ ` * _ [ ] < > ~ & ! ``, so a heading such as `# a](javascript:alert(1)) [b` stays plain text in the list instead of becoming a live link. The slug is not escaped (it contains only word characters and hyphens).
- The `text` of a heading can differ from the rendered heading, and the slug follows it:
  - a soft or hard line break (a setext heading over two lines) is joined with **one space**: `Foo` / `bar` gives text `Foo bar` and slug `foo-bar`, as on GitHub;
  - an image contributes its **alt text** (`## ![alt](https://example.org/p.png)` gives `alt`);
  - a footnote reference marker is **omitted** when `mdFootnotes` is installed (`## Note[^1]` gives `Note`, slug `note`).

```js
const m = md.createMd().use(mdToc);
mdToc.collectHeadings(m.parse('Foo\nbar\n===\n'));
// [{ level: 1, text: 'Foo bar', slug: 'foo-bar' }]
mdToc.generate(m.parse('# a](javascript:alert(1)) [b\n'));
// '- [a\\](javascript:alert(1)) \\[b](#ajavascriptalert1-b)'
```

## See also

- [`mdWikilinks`](./wikilinks.md) — uses a similar slugifier
- [Extending](../../guide/extending.md)
