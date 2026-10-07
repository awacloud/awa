# Read + Write

Full workflow: `text` → AST → HTML / Markdown / XML render, and back (roundtrip).

**Prerequisites**: `@awacloud/md` and `@awacloud/fw` in the browser (or Bun / Node) as ES modules, and the `ModuleRuntime` registration shown below; the guide stays on the `md` facade and the modules resolved next to it.

## Overview

```
text  ──parse──>  AST (Node tree)
                   │
                   ├──render─────────>  HTML string
                   ├──renderMarkdown─>  Markdown string (roundtrip)
                   └──renderXml─────>  XML string (cmark-style)
```

The renderers take an AST as input. `md.renderHtml(text)` is the HTML wrapper that parses a string on the fly (`md.render(ast)` takes the AST), and `md.renderMarkdown(textOrAst)` accepts either.

Every example below assumes `md` was resolved as shown in [Getting started](./getting-started.md):

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const md = runtime.resolve('md');
```

## Parse

```js
const ast = md.parse('# Title\n\n[link](https://example.com)');
ast.type;                  // 'document'
ast.firstChild.type;       // 'heading'
ast.firstChild.level;      // 1
ast.data.refmap;           // {} — no link reference in this input
```

The block parser tokenizes the text line by line (CommonMark §4), then the inline parser walks each paragraph / heading / cell (§6 + GFM).

## Render HTML

```js
md.render(ast);
// '<h1>Title</h1>\n<p><a href="https://example.com">link</a></p>\n'
md.renderHtml('# Title');   // text in, HTML out
// '<h1>Title</h1>\n'
```

Options (the same for `render` and `renderHtml`):

| Option | Default | Description |
|--------|---------|-------------|
| `safe` | `true` | Strips raw HTML blocks/inlines from the source (the built-in extras' own HTML is kept), neutralizes `javascript:` / `vbscript:` / `file:` / `data:` URLs; `false` restores the spec-exact CommonMark passthrough |
| `allowDataImage` | `false` | While `safe` is on, re-allows `data:image/(png\|jpeg\|gif\|webp\|svg+xml\|bmp\|ico\|avif\|apng)` |
| `softbreak` | `'\n'` | Replacement for soft line breaks (`'\n'`, `' '`, `'<br />\n'`) |
| `disallowedRawHtml` | `true` | Filters the GFM disallowed raw HTML tags (`<script>`, `<title>`, …) |
| `sanitize` | `false` | Pipes the result through `@awacloud/fw/dom/rendering/sanitize.js` |
| `sanitizeOpts` | `{}` | Options of the fw `sanitizeHtml` (`allowedTags`, `allowedAttributes`, `urlSchemes`, `dropDangerousContent`) |

```js
md.renderHtml('<script>alert(1)</script>\n\n**bold**');                    // safe by default
// '<p><strong>bold</strong></p>\n'
md.renderHtml('<b>raw</b> [x](javascript:alert(1))', { safe: false });   // spec passthrough
// '<p><b>raw</b> <a href="javascript:alert(1)">x</a></p>\n'
```

## Render Markdown (roundtrip)

```js
const ast = md.parse('# Title\n\n*emph* and **strong**.');
const out = md.renderMarkdown(ast);
// '# Title\n\n*emph* and **strong**.\n'

md.parse(out);  // re-parse → structurally identical AST
```

The guarantee covers CommonMark + GFM (plus subscript, superscript and highlight); other extension nodes are not serialised — see the [render/markdown notes](../api/render/markdown.md#notes).

`renderMarkdown` reads no option: the style is fixed (ATX headings, `*` emphasis, `**` strong, backtick fences, and each list keeps the bullet character it was parsed with). See [`render/markdown`](../api/render/markdown.md).

## Render XML

`renderXmlMod` is not part of the `md` instance — resolve it separately (it needs `mdErrors`):

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const renderXml = runtime.resolve('renderXmlMod');
const xml = renderXml.renderXml(md.parse('# Title'));
// <?xml version="1.0" encoding="UTF-8"?>
// <!DOCTYPE document SYSTEM "CommonMark.dtd">
// <document xmlns="http://commonmark.org/xml/1.0" sourcepos="1:1-1:7">
//   <heading level="1" sourcepos="1:1-1:7">
//     <text>Title</text>
//   </heading>
// </document>
```

Modelled on the `cmark --to xml` output (prolog, DTD line, element names), which eases cross-implementation diffing; block nodes always carry a `sourcepos` attribute.

## Pattern: extract + transform + re-emit

`findAll` / `replaceNode` and the `Node` constructor come from `mdAstManipulation` and `mdNode` — resolve them alongside `md`:

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const md      = runtime.resolve('md');
const { findAll, replaceNode } = runtime.resolve('mdAstManipulation');
const { Node } = runtime.resolve('mdNode');

const ast = md.parse('# h1\n\n[old](http://a) and [keep](http://b)');

// Upgrade all http:// URLs to https://
for (const link of findAll(ast, n => n.type === 'link')) {
    if (link.destination.startsWith('http://')) {
        link.destination = 'https://' + link.destination.slice(7);
    }
}

md.renderMarkdown(ast);
// '# h1\n\n[old](https://a) and [keep](https://b)\n'
```

## Pattern: sanitize HTML output

```js
const userMarkdown = 'hi <img src=x onerror=alert(1)> [x](javascript:alert(1))';
const dirty = md.renderHtml(userMarkdown);
const safe  = md.renderHtml(userMarkdown, { sanitize: true });
// Or in two steps, calling fw directly:
const { sanitizeHtml } = runtime.resolve('sanitize');   // the fw module registered through `fw_require`
const safe2 = sanitizeHtml(dirty);
```

The default fw allowlist is strict: common formatting tags + `<a>`, `<img>`, `<code>`, `<pre>`; `<input>` is **out** of the allowlist (override via `sanitizeOpts.allowedTags`); `data:` URLs are always removed from `href` / `src` (the fw sanitizer has no opt-in; `allowDataImage` only applies to `safe: true`). See the fw doc: [`fw/docs/api/dom/rendering/sanitize.md`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/dom/rendering/sanitize.md).

For a complete, sanitised HTML *document* rather than a fragment — one or several Markdown sources assembled into a single self-contained `.html` file with a theme, sidebar and cross-links — see [`mdHtmlDocument`](../api/document/html-document.md) instead: it runs the same fw sanitiser unconditionally, as its only security boundary.

## Pattern: walk + observe

The iterable `walk(root)` generator comes from `mdAstWalker` (resolve it too):

```js
const { walk } = runtime.resolve('mdAstWalker');

const text = '# One\n\ntext\n\n## Two';
const headings = [];
for (const { node, entering } of walk(md.parse(text))) {
    if (entering && node.type === 'heading') {
        let s = '';
        for (const { node: c, entering: e } of walk(node))
            if (e && c.literal) s += c.literal;
        headings.push({ level: node.level, text: s });
    }
}
```

For per-type hooks, use the visitor walker instead:

```js
const mdWalker = runtime.resolve('mdWalker');
const w = mdWalker.createWalker();
w.walk(md.parse(text), {
    heading:    { enter(n, ctx) { /* … */ } },
    code_block: { enter(n)      { /* … */ } }
});
```

## Pattern: roundtrip integration

```js
const renderXml = runtime.resolve('renderXmlMod');

const strip = (xml) => xml.replace(/ sourcepos="[^"]*"/g, '');   // positions may legitimately move

function roundtripOk(text) {
    const a1 = md.parse(text);
    const md2 = md.renderMarkdown(a1);
    const a2 = md.parse(md2);
    // Compare structures via XML render (stable AST snapshot).
    return strip(renderXml.renderXml(a1)) === strip(renderXml.renderXml(a2));
}
roundtripOk('# a\n\n* x\n* y\n\n1. one');   // true
```

## Reference-style links

Definitions collected by the block parser, exposed on `ast.data.refmap`:

```js
const ast = md.parse('[foo]: /url "title"\n\nsee [foo].');
ast.data.refmap;
// { FOO: { destination: '/url', title: 'title' } }
```

Labels are normalized (Unicode case-fold + collapsed whitespace).

## See also

- [Extending](./extending.md) — patch parse / render via an extra
- [Coverage](./coverage.md) — which Markdown cases are handled
- [`api/md`](../api/md.md) — full API surface of the instance
- [`api/render/`](../api/render/) — details of each renderer
- [`@awacloud/fw/dom/rendering/sanitize`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/dom/rendering/sanitize.md) — XSS hardening (consumed through the facade's `sanitize: true` option)
