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
| `parse` | `(block: Node, refmap: Object, flags?) => void` | Mutates `block.children`. `flags.math` (set by `md.parse` when an installed extension declares `inlineSyntax: ['math']`) claims `$…$` / `$$…$$` spans as `math_inline` / `math_block` nodes before any other inline construct |

### `mdInlineHelpers`

The small helpers the inline sub-modules share, resolved by name (`runtime.resolve('mdInlineHelpers')`; dependencies `mdNode`, `mdAstTypes`). It has no page of its own; its members are:

| Member | Signature | Returns |
|--------|-----------|---------|
| `makeText` | `(s: string) => Node` | A `text` node whose `literal` is `s` |
| `makeMath` | `(s: string, display?: boolean) => Node` | A `math_inline` node (a `math_block` node when `display` is truthy) whose `literal` is the LaTeX source `s` |
| `mathSpanEnd` | `(s: string, p: number) => number` | The index after the closing run of the math span that opens at `p` (the position of a `$`) in `s`, or `-1`. `$$` closes at the next `$$`; a single `$` at the next `$` not escaped by a backslash, with at least one character between. Neither crosses a line end |
| `fromCodePoint` | `(cp: number) => string` | `String.fromCodePoint(cp)`; U+FFFD (the replacement character) for an invalid code point |
| `normalizeReference` | `(label: string) => string` | A bracketed label (`'[Foo  Bar]'`) without its brackets, trimmed, whitespace-collapsed and case-folded (`'FOO BAR'`) |
| `trim` | `(s: string) => string` | `s` without leading and trailing ASCII space, tab, LF and CR |
| `isSpace` | `(c: number) => boolean` | Whether the code unit is ASCII space, tab, LF or CR |

```js
const h = runtime.resolve('mdInlineHelpers');
h.mathSpanEnd('a $x$ b', 2);          // 5
h.mathSpanEnd('$$x$$', 0);            // 5
h.mathSpanEnd('$x', 0);               // -1
h.makeMath('x^2', false).type;        // 'math_inline'
h.makeMath('x^2', true).type;         // 'math_block'
```

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
- The delimiter stack handles emphasis (`*`, `_`), strong (`**`, `__`), strikethrough (`~~`) — each character can be left/right flanking depending on the Unicode context (`P`/`S`/`Z` punctuation classes). Each delimiter character keeps its own search bounds, split by run length and by whether the closer can open: an unmatched `**` or a tilde run of another length inside `~~…~~` does not cancel the strikethrough (`~~x a**b y~~` and `~~a~b~~` both render `<del>`), and an unmatched `~~` does not cancel a strong emphasis around it. The bounds are positions in the stack, so they stay valid when a matched pair removes an opener.
- A link destination written between `(` and `)` may nest parentheses at most 32 levels deep (the cap `cmark` uses); a deeper one is not read as a destination and the text stays text. Repeated unclosed link destinations, `![[]()` and unclosed `<!--`, `<?`, `<![CDATA[` or `<!X` openers parse in time linear in their length.
- An extended email autolink may not end with `-` or `_`: `a.b-c_d@a.b-` and `a.b-c_d@a.b_` are no autolink at all (GFM allows only `.` at the end of an address, and a trailing `.` is excluded from the address and stays text).
- There is no `disallowedRawHtml` / `safe` construction option on this module — raw-HTML filtering and `javascript:` neutralization happen at render time (`renderHtml`'s `safe` option), not during inline parsing. For a complete sanitizer, see [`@awacloud/fw/dom/rendering/sanitize.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.1.0/packages/front/fw/docs/api/dom/rendering/sanitize.md) consumed via `md.createMd({ sanitize: true })`.

## See also

- [`block/parser`](../block/parser.md) — produces the input containers
- [`refs/link-refs`](../refs/link-refs.md) — refmap used for resolution
- [`common`](../common.md) — char codes, ENTITY, ESCAPABLE
- [`@awacloud/fw/dom/rendering/sanitize`](https://github.com/awacloud/awa/blob/@awacloud/md@1.1.0/packages/front/fw/docs/api/dom/rendering/sanitize.md) — advanced XSS protection (consumed via `md.createMd({ sanitize: true })`)
