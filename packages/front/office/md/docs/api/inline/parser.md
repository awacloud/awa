---
module: inlineParser
category: md/inline
dependencies: [mdErrors, mdCommon, mdInlineRegex, mdInlineHelpers, mdInlineEscapes, mdInlineCodeSpan, mdInlineAutolink, mdInlineAutolinkExt, mdInlineDelimiterStack, mdInlineLink, mdInlineLineBreak, mdInlineSourcepos]
returns: object
worker-safe: true
status: complete
---

# inline/parser

> CommonMark 0.31 inline phase + GFM parser — emphasis, links, autolinks, strikethrough.

**Module** `inlineParser` | **Source** `packages/front/office/md/src/inline/parser.js` | **Deps** `mdErrors`, `mdCommon`, `mdInlineRegex`, `mdInlineHelpers`, `mdInlineEscapes`, `mdInlineCodeSpan`, `mdInlineAutolink`, `mdInlineAutolinkExt`, `mdInlineDelimiterStack`, `mdInlineLink`, `mdInlineLineBreak`, `mdInlineSourcepos` | **Worker-safe** yes

The inline phase of parsing (CommonMark appendix "A parsing strategy"): for each container produced by the block parser (paragraphs, headings, table-cells), tokenizes `stringContent` and produces the final inline tree — emphasis/strong via the delimiter stack (CommonMark §6.5), links (inline / reference / autolink), images, code spans, raw HTML inline, hard/soft line breaks, GFM strikethrough and extended autolinks.

`inlineParser` is a light orchestrator over the sibling `mdInline*` sub-modules, each promoted to its own factory descriptor and listed above as a dependency. The delimiter-stack algorithm (CommonMark §6.5) lives in `src/inline/delimiter-stack.js`.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const ip = runtime.resolve('inlineParser');
// { parse }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parse` | `(block: Node, refmap: Object) => void` | Mutates `block.children` |

### Construction-time `options`

The factory takes a 13th, **undeclared** `options` parameter (not part of `dependencies`, so a plain `runtime.resolve('inlineParser')` gets the defaults below). To bind custom options, use `md.createMd(opts)` (which internally uses the `inlineParserBuilder` descriptor to construct a fresh, options-bound parser), rather than re-resolving `inlineParser` directly.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extendedAutolinks` | `boolean` | `true` | GFM `https://…`, `www.…`, `email@` auto-detection |
| `sourcepos` | `boolean` | `false` | Attaches `sourcepos` to produced nodes |
| `smart` | `boolean` | `false` | Enables smart-punctuation delimiter handling |

## Examples

### Standalone

```js
const ip = runtime.resolve('inlineParser');
const { Node } = runtime.resolve('mdNode');

const block = new Node('paragraph');
block.stringContent = 'Hi **world** [link](http://x).';
ip.parse(block, {});
// block.firstChild.type === 'text' literal='Hi '
// ... 'strong' ... 'text' literal=' ' ... 'link' ...
```

### With a refmap

```js
const refmap = { FOO: { destination: '/url', title: 't' } };
ip.parse(block, refmap);
// resolves the [foo] and [foo][] shortcuts, etc.
```

## Notes

- The extended GFM autolinks (`https://`, `www.`, `xxx@`) are applied as a post-pass on text nodes, not during the main tokenization.
- The delimiter stack handles emphasis (`*`, `_`), strong (`**`, `__`), strikethrough (`~~`) — each character can be left/right flanking depending on the Unicode context (`P`/`S`/`Z` punctuation classes).
- There is no `disallowedRawHtml` / `safe` construction option on this module — raw-HTML filtering and `javascript:` neutralization happen at render time (`renderHtml`'s `safe` option), not during inline parsing. For a complete sanitizer, see [`@awacloud/fw/dom/rendering/sanitize.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/dom/rendering/sanitize.md) consumed via `md.createMd({ sanitize: true })`.

## See also

- [`block/parser`](../block/parser.md) — produces the input containers
- [`refs/link-refs`](../refs/link-refs.md) — refmap used for resolution
- [`common`](../common.md) — char codes, ENTITY, ESCAPABLE
- [`@awacloud/fw/dom/rendering/sanitize`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/dom/rendering/sanitize.md) — advanced XSS protection (consumed via `md.createMd({ sanitize: true })`)
