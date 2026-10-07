---
module: mdFootnotes
category: md/extra
dependencies: [mdNode, mdAstWalker, mdAstTypes, mdShared]
returns: object
worker-safe: true
status: complete
---

# mdFootnotes

> Pandoc footnotes — `[^id]` + `[^id]: body`.

**Module** `mdFootnotes` | **Source** `packages/front/office/md/src/extra/footnotes.js` | **Deps** `mdNode`, `mdAstWalker`, `mdAstTypes`, `mdShared` | **Worker-safe** yes

Pre-scans the source to strip `[^id]: …` definitions (including indented continuations), then post-walks text nodes to replace `[^id]` with numbered `footnote_ref`s. At render time, appends an `<ol class="footnotes">` section at the end of the document. Numbering follows **first-reference order** (Pandoc-style).

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md          = runtime.resolve('md');
const mdFootnotes = runtime.resolve('mdFootnotes');
const m = md.createMd().use(mdFootnotes);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdFootnotes'`, the key `.use()` deduplicates on |
| `install` | `(md) => void` | Patches `md.parse`, `md.render` and `md.renderHtml` |
| `stripFootnoteDefs` | `(text: string) => { rest: string, defs: Map<string,string> }` | Source-level pre-scan: removes the `[^id]: body` definitions |
| `extractFootnoteDefs` | `(doc: Node) => Map<string,string>` | AST-level variant: removes definition paragraphs and returns the map |
| `expandFootnoteRefs` | `(root: Node, defs: Map<string,string>) => { order: string[], used: Map }` | Replaces `[^id]` text with numbered `footnote_ref` nodes |
| `renderFootnotesHtml` | `(html: string, order: string[], defs: Map<string,string>) => string` | Appends the `<section class="footnotes">` list |
| `lowerFootnoteRefs` | `(root: Node) => void` | Rewrites `footnote_ref` nodes into `<sup class="footnote-ref">` inline HTML |

## Examples

### Case 1 — basic

```js
const m = md.createMd().use(mdFootnotes);
m.renderHtml('Hello[^1].\n\n[^1]: The note body.');
// '<p>Hello<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup>.</p>\n
//  <section class="footnotes">\n<ol>\n<li id="fn-1"><p>The note body. <a href="#fnref-1" class="footnote-back">&#8617;</a></p></li>\n</ol>\n</section>\n'
```

### Case 2 — multi-paragraph note

```js
m.renderHtml(`
First[^big].

[^big]: Body line 1.
    Body line 2 indented.
`);
```

## Notes

- Definitions are stripped in a pre-pass — otherwise the block parser would interpret them as link reference definitions.
- Unreferenced defs are ignored (no orphan output).
- Generated HTML ids are `fn-<label>` / `fnref-<label>` (the label written in the source, e.g. `fn-big`); the visible number is 1-based, in order of first reference.
- The note body supports inlines but not blocks (single paragraph) — current limitation.

## See also

- [`mdWikilinks`](./wikilinks.md) — installed after footnotes in `md-full`
- [`md-full`](../bundles/md-full.md) — bundle that includes footnotes
- [Extending](../../guide/extending.md)
