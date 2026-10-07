---
module: renderXmlMod
category: md/render
dependencies: [mdErrors]
returns: object
worker-safe: true
status: complete
---

# render/xml

> AST → XML compatible with `cmark --to xml` — stable snapshot for diffing.

**Module** `renderXmlMod` | **Source** `packages/front/office/md/src/render/xml.js` | **Deps** `mdErrors` | **Worker-safe** yes

Serializes the AST to CommonMark XML — namespace `http://commonmark.org/xml/1.0`, each type emitted as an element of the same name with typed attributes (`level`, `info`, `destination`, `title`, `type` for `list`, …). Useful for cross-implementation diffing, golden tests, editor tooling.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const r = runtime.resolve('renderXmlMod');
// { renderXml }
```

Or calling the factory by hand:

```js
import { renderXmlMod, mdErrors } from '@awacloud/md';
const { renderXml } = renderXmlMod.factory(mdErrors.factory());
const xml = renderXml(runtime.resolve('md').parse('# Hi'));
```

`renderXmlMod` is **not** part of the `md` facade's own API — it must be resolved separately.

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `renderXml` | `(ast: Node, opts?) => string` | XML string |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `indent` | `2` | Indent step in spaces (an integer) |

There is no `sourcepos` option: a `sourcepos="l:c-l:c"` attribute is emitted on every node that carries one, which is every block node, and the inline nodes too when the parse ran with `createMd({ sourcepos: true })`.

## Examples

### Case 1 — basic

```js
const md = runtime.resolve('md');
const renderXml = runtime.resolve('renderXmlMod');
const xml = renderXml.renderXml(md.parse('# Hi'));
// <?xml version="1.0" encoding="UTF-8"?>
// <!DOCTYPE document SYSTEM "CommonMark.dtd">
// <document xmlns="http://commonmark.org/xml/1.0" sourcepos="1:1-1:4">
//   <heading level="1" sourcepos="1:1-1:4">
//     <text>Hi</text>
//   </heading>
// </document>
```

### Case 2 — AST diff

```js
const text = '# Title\n\n*emph* and **strong**.\n';
const strip = (xml) => xml.replace(/ sourcepos="[^"]*"/g, '');   // positions may legitimately move
const a1 = strip(renderXml.renderXml(md.parse(text)));
const a2 = strip(renderXml.renderXml(md.parse(md.renderMarkdown(md.parse(text)))));
a1 === a2; // true if the roundtrip is perfect
```

## Notes

- The output is modelled on `cmark --to xml` (same prolog, DTD line, element names and attributes), which makes it handy for cross-implementation diffs. The test suite checks the structure through the roundtrip tests, not a byte comparison against `cmark`; `sourcepos` attributes are always present for block nodes, so compare against `cmark --to xml --sourcepos`.
- Extra types (`math_inline`, `footnote_ref`, etc.) are emitted with their own name — the XML remains valid but out-of-spec CommonMark.
- Throws `RenderError` on a corrupted AST (missing slot, unknown type, etc.).
- `sourcepos` adds `[startLine, startCol]-[endLine, endCol]` attrs when enabled.

## See also

- [`render/html`](./html.md) — final HTML output
- [`render/markdown`](./markdown.md) — roundtrip
- [`ast/types`](../ast/types.md) — emitted element names
