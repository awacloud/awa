---
module: renderMarkdownMod
category: md/render
dependencies: [mdErrors]
returns: object
worker-safe: true
status: complete
---

# render/markdown

> AST → Markdown — roundtrip-safe (re-parsing yields a structurally identical AST).

**Module** `renderMarkdownMod` | **Source** `packages/front/office/md/src/render/markdown.js` | **Deps** `mdErrors` | **Worker-safe** yes

Emits Markdown from an AST. Supports CommonMark + GFM (tables, task lists, strikethrough, extended autolinks emitted as bare URLs) and three extension inlines (`subscript`, `superscript`, `highlight`; see Notes). The result re-parses into a structurally equivalent AST (modulo insignificant whitespace).

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const r = runtime.resolve('renderMarkdownMod');
// { renderMarkdown }
```

Direct call, or via `md.renderMarkdown`:

```js
const md = runtime.resolve('md');
md.renderMarkdown('# Hi\n\ntext');          // text: parsed with md.parse
md.renderMarkdown(md.parse('# Hi\n\ntext')); // or an AST
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `renderMarkdown` | `(ast: Node, opts?) => string` | Markdown string |

### Options

`renderMarkdown(ast, opts?)` accepts an `opts` object but reads no option from it; the style is fixed:

| Element | Emitted as |
|---------|------------|
| Emphasis / strong | `*text*` / `**text**` |
| Fenced code | a run of three or more backticks, longer than any backtick run at a line start inside the code |
| Bullet list item | the bullet character the list was parsed with (`node.listBulletChar`), `-` when a hand-built list has none |

## Examples

### Case 1 — basic roundtrip

```js
const md = runtime.resolve('md');
const text = '# Title\n\n*emph* and **strong**.';
const ast = md.parse(text);
md.renderMarkdown(ast);
// '# Title\n\n*emph* and **strong**.\n'
```

### Case 2 — the style is fixed

```js
md.renderMarkdown(ast, { emphasis: '_', strong: '__' });
// '# Title\n\n*emph* and **strong**.\n'   (the options are not read)
```

### Case 3 — roundtrip preservation check

```js
const renderXml = runtime.resolve('renderXmlMod');
const xml1 = renderXml.renderXml(ast);
const xml2 = renderXml.renderXml(md.parse(md.renderMarkdown(ast)));
xml1 === xml2; // true (structurally identical)
```

### Case 4 — hand-built nodes: destinations and extension inlines

```js
const { makeNode } = runtime.resolve('mdNode');
const n = (type, props, ...kids) => {
  const node = Object.assign(makeNode(type), props);
  for (const k of kids) node.appendChild(k);
  return node;
};
const t = (literal) => n('text', { literal });
const doc = n('document', null, n('paragraph', null,
  n('image', { destination: 'Grafik 1' }, t('alt')), t(' H'),
  n('subscript', null, t('2')), t('O')));
md.renderMarkdown(doc);
// '![alt](<Grafik 1>) H~2~O\n'
```

## Notes

- Chosen style: ATX headings, fenced code, `*` for emphasis, `**` for strong, `` ` `` for code, `~~` for strikethrough (`~` when the parser read a single tilde — `delimiterCount: 1`). No reference-style links in the output (the refmap is dropped — links are emitted inline).
- Tight lists stay tight (no blank line between items); loose lists keep their separation.
- Inline text is re-escaped for characters that would re-parse as syntax (`` \`*_[]<>~ ``). A `!` preceding a `[` is also escaped (image syntax).
- A paragraph line that starts with a block marker is escaped, so it re-parses as the same paragraph rather than opening a list, a heading or a quote. This applies to the first line and to every line after a soft or hard break. An ordered-list marker (1–9 digits, then `.` or `)`, then whitespace or the end of the line) gets its delimiter escaped (`1\. Step One`). A bullet (`-`, `+`, `*`), an ATX heading (`#` to `######`) or a blockquote (`>`) followed by whitespace or the end of the line gets a leading backslash (`\- item`, `\# x`, `\> q`). Any other line is emitted unchanged (`1.5 million`, `#hashtag`). A line made only of `-` or `=` characters (a setext underline or thematic break) gets a leading backslash too (`\---`, `\===`), so `a` followed by a soft break and `---` does not re-parse as a heading. A marker preceded by one to three spaces keeps its indent and is escaped after it (`  \- x`); four or more leading spaces are out of scope, since a parsed paragraph never carries leading whitespace. A line whose `-` or `=` run is followed by other text (`-- b`, `---b`) is emitted unchanged.
- Link and image destinations are emitted bare (`logo.png`, with `(` and `)` backslash-escaped) unless they contain whitespace, `<` or a control character. Those are wrapped in `<…>`, with `<`, `>` and `\` escaped inside and any line ending written as `%0A`: `[a](<x y> "t")`. A parsed destination never carries whitespace (the inline parser percent-encodes it, `<Grafik 1>` is stored as `Grafik%201`), so the `<…>` form is reached by a hand-built or converter-built node.
- Extension nodes: `subscript`, `superscript` and `highlight` are serialised to their syntax (`~x~`, `^x^`, `==x==`) when they are present in the AST. Call `renderMarkdown` on the parsed AST: the extras lower their own nodes to HTML inside `render`. Every other extension node (`math_inline`, `math_block`, `footnote_ref`, `footnote_def`, `admonition`, extension-built `html_*`) is emitted as the empty string, content included. With extras installed, `renderMarkdown(text)` runs their parse passes (the string is parsed with `md.parse`), so those unsupported node types are dropped the same way. The round-trip guarantee covers CommonMark + GFM plus subscript, superscript and highlight.
- Tables: every `|` in a cell is escaped once (`\|`), including inside code spans; newlines are collapsed to a space.

## See also

- [`render/html`](./html.md) — HTML output
- [`render/xml`](./xml.md) — stable AST snapshot
- [Read+write](../../guide/read-write.md) — roundtrip pattern
