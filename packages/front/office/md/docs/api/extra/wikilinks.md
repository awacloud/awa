---
module: mdWikilinks
category: md/extra
dependencies: [mdNode, mdAstWalker, mdAstTypes]
returns: object
worker-safe: true
status: complete
---

# mdWikilinks

> `[[Page Name]]`, `[[Page|alias]]`, `[[Page#anchor|alias]]` → `<a href="page-name">…</a>`.

**Module** `mdWikilinks` | **Source** `packages/front/office/md/src/extra/wikilinks.js` | **Deps** `mdNode`, `mdAstWalker`, `mdAstTypes` | **Worker-safe** yes

Post-parse AST pass — concatenates adjacent text nodes and scans for `[[…]]`. Replaces matches with native `link` nodes (lowered, so they're rendered by the core renderer with no extra wiring).

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md          = runtime.resolve('md');
const mdWikilinks = runtime.resolve('mdWikilinks');
const m = md.createMd().use(mdWikilinks);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdWikilinks'`, the key `.use()` deduplicates on |
| `install` | `(md, opts?) => void` | Patches `md.parse` and `md.renderHtml`; `opts.slugify` overrides the slugifier |
| `defaultSlugify` | `(s) => string` | Default slugifier (lower-case, runs of non-alphanumerics become `-`) |
| `expandWikilinksInAst` | `(root: Node, slugify) => Node` | Standalone helper; returns `root` |

### Custom slugifier

```js
const mySlugifier = (s) => s.trim().toLowerCase().replace(/\s+/g, '_');
const m = md.createMd().use({ name: 'wikilinks-custom', install(md) {
    mdWikilinks.install(md, { slugify: mySlugifier });
}});
```

## Examples

### Case 1 — basic

```js
const m = md.createMd().use(mdWikilinks);
m.renderHtml('See [[Other Page]] and [[Page#anchor|alias]].');
// '<p>See <a href="other-page" title="Other Page">Other Page</a> and <a href="page#anchor" title="Page">alias</a>.</p>\n'
```

### Case 2 — custom slugifier

```js
const m = md.createMd().use({ name: 'wiki', install(md) {
    mdWikilinks.install(md, { slugify: s => '/wiki/' + s.toLowerCase().replace(/\s+/g, '_') });
}});
m.renderHtml('[[My Page]]');
// '<p><a href="/wiki/my_page" title="My Page">My Page</a></p>\n'
```

## Notes

- Default slugifier: lowercase + replace `[^a-z0-9]+` with `-`, trim border `-`.
- The `#anchor` goes through the same slugifier: `[[Page#Foo Bar|x]]` → `href="page#foo-bar" title="Page"`. The link text is the alias when there is one, else the page name.
- An empty wikilink `[[]]` is ignored.
- Lowered to a native `T_LINK` → re-rendered by the core with no render patch.

## See also

- [`mdToc`](./toc.md) — uses a compatible slugifier
- [`mdFootnotes`](./footnotes.md) — installed before wikilinks in `md-full` to avoid a `[^x]` conflict
- [Extending](../../guide/extending.md)
