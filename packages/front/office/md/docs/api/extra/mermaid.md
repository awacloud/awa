---
module: mdMermaid
category: md/extra
dependencies: [mdShared]
returns: object
worker-safe: true
status: complete
---

# mdMermaid

> Fenced ` ```mermaid ` → `<div class="mermaid">…</div>` container, body kept HTML-escaped.

**Module** `mdMermaid` | **Source** `packages/front/office/md/src/extra/mermaid.js` | **Deps** `mdShared` | **Worker-safe** yes

Post-render regex replacement over the `<pre><code class="language-mermaid">` produced by the standard code-block rendering. The diagram source stays HTML-escaped inside the container: Mermaid's client-side runtime entity-decodes the element's content, so the diagram it reads equals the fence source, while the browser never parses that source as markup. The AST is not modified — the wrapper only operates on the HTML string.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md         = runtime.resolve('md');
const mdMermaid = runtime.resolve('mdMermaid');
const m = md.createMd().use(mdMermaid);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdMermaid'`, the key `.use()` deduplicates on |
| `install` | `(md) => void` | Patches `md.render` and `md.renderHtml` |
| `rewriteMermaidHtml` | `(html: string) => string` | Standalone helper |

## Examples

### Case 1 — usage

```js
const m = md.createMd().use(mdMermaid);
m.renderHtml('```mermaid\ngraph TD; A-->B;\n```');
// '<div class="mermaid">graph TD; A--&gt;B;\n</div>\n'
```

### Case 2 — pairing with mermaid.js client-side

```html
<div class="mermaid">graph TD; A--&gt;B;</div>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true });
</script>
```

## Notes

- Only affects HTML rendering — `renderMarkdown` / `renderXml` produce a standard `code_block`.
- `<` `>` `&` `"` in the source stay escaped (`&lt;`, `&gt;`, `&amp;`, `&quot;`). The rewrite runs AFTER `render` — after the `safe` and `sanitize` passes — so the body is never unescaped: a fence holding `<img src=x onerror=…>` or `</div><script>…` stays inert text under every option set. The element's `textContent` (and Mermaid's own entity decoding) gives back the exact source.
- The `<div class="mermaid">` wrapper is added after a `sanitize: true` pass ran, so the sanitiser's allowlist never sees it.
- Always install **last** in a `.use()` chain (it operates post-render).

## See also

- [`mdMath`](./math.md) — another render-wrapper
- [`md-full`](../bundles/md-full.md) — installs mermaid last
- [Extending](../../guide/extending.md)
