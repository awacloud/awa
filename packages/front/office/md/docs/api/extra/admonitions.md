---
module: mdAdmonitions
category: md/extra
dependencies: [mdNode, mdAstWalker, mdAstTypes, mdShared]
returns: object
worker-safe: true
status: complete
---

# mdAdmonitions

> Callouts — GitHub `[!NOTE]` + MkDocs Material `!!! note`.

**Module** `mdAdmonitions` | **Source** `packages/front/office/md/src/extra/admonitions.js` | **Deps** `mdNode`, `mdAstWalker`, `mdAstTypes`, `mdShared` | **Worker-safe** yes

Both syntaxes are supported simultaneously, lowered to a uniform `admonition` AST type carrying `data.kind` (`note`, `tip`, `warning`, `caution`, `important`, `danger`, `info`) and `data.title`.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md            = runtime.resolve('md');
const mdAdmonitions = runtime.resolve('mdAdmonitions');
const m = md.createMd().use(mdAdmonitions);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdAdmonitions'`, the key `.use()` deduplicates on |
| `install` | `(md) => void` | Patches `md.parse`, `md.render` and `md.renderHtml` |
| `preprocessMkdocsAdmonitions` | `(text: string) => string` | MkDocs-syntax pre-pass |
| `expandAdmonitionsInAst` | `(root: Node) => Node` | GitHub-style `block_quote` post-walk, builds `admonition` nodes |
| `lowerAdmonitionsToHtml` | `(root: Node) => Node` | Render-time rewrite of each `admonition` node into `html_block` wrappers |

## Examples

### Case 1 — GitHub callouts

```js
const m = md.createMd().use(mdAdmonitions);
m.renderHtml('> [!WARNING]\n> Watch out.');
// '<div class="admonition admonition-warning"><p class="admonition-title">Warning</p>
//  <p>Watch out.</p></div>'
```

### Case 2 — MkDocs Material

```js
m.renderHtml('!!! note "Heads up"\n    Body paragraph.\n\n    Second paragraph.');
// '<div class="admonition admonition-note">
//   <p class="admonition-title">Heads up</p>
//   <p>Body paragraph.</p>
//   <p>Second paragraph.</p>
// </div>'
```

## Notes

- Valid kinds: `note`, `warning`, `tip`, `caution`, `important`, `danger`, `info`. Syntax with an unknown kind is left intact (block_quote or paragraph).
- MkDocs syntax pre-pass runs in `install` (source-level) — detects `!!! kind "title"` + 4-space-indented lines.
- GitHub callouts are detected post-walk — matches `> [!KIND]` at the head of a block_quote.
- Default title = capitalize(kind).

## See also

- [`mdHighlight`](./highlight.md) — another simple inline extra
- [`md-full`](../bundles/md-full.md) — installed in the full bundle
- [Extending](../../guide/extending.md)
