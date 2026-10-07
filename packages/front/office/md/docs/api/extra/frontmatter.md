---
module: mdFrontmatter
category: md/extra
dependencies: [mdShared]
returns: object
worker-safe: true
status: complete
---

# mdFrontmatter

> YAML / TOML / JSON frontmatter extraction at the top of a document.

**Module** `mdFrontmatter` | **Source** `packages/front/office/md/src/extra/frontmatter.js` | **Deps** `mdShared` | **Worker-safe** yes

Detects a fenced block at the very start of the document and strips it before the block parser sees it. The raw content is attached to `document.data.frontmatter` along with its detected language. **The content is NOT parsed** (stays zero-dep) — the consumer decodes it with their own YAML/TOML/JSON parser.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md            = runtime.resolve('md');
const mdFrontmatter = runtime.resolve('mdFrontmatter');
const m = md.createMd().use(mdFrontmatter);
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `name` | `string` | `'mdFrontmatter'`, the key `.use()` deduplicates on |
| `install(md)` | `(md) => void` | Patches `md.parse` (sets `ast.data.frontmatter`) and `md.renderHtml` |
| `stripFrontmatter` | `(text: string) => { rest: string, frontmatter: { lang: string, content: string } \| null }` | Standalone helper |

### Supported fences

| Fence | Lang tag |
|-------|----------|
| `---` | `yaml` |
| `+++` | `toml` |
| `;;;` | `json` |

## Examples

### Case 1 — standard usage

```js
const m = md.createMd().use(mdFrontmatter);
const ast = m.parse('---\ntitle: Hello\n---\n\nbody.');
ast.data.frontmatter;
// { lang: 'yaml', content: 'title: Hello' }
```

### Case 2 — decoding the content

The extra only extracts the raw block: `lang` says which format it is and `content` is the text between the fences. A `;;;` block holds JSON, which `JSON.parse` decodes; for `yaml` or `toml` bring your own parser (the package bundles none).

```js
const j = md.createMd().use(mdFrontmatter).parse(';;;\n{"title":"Hello"}\n;;;\n\nbody.');
j.data.frontmatter.lang;                          // 'json'
JSON.parse(j.data.frontmatter.content).title;     // 'Hello'
```

## Notes

- The frontmatter must start on the very first line (BOM tolerated). Mid-document fences are ignored.
- If the block isn't properly closed, the text is left intact (no extraction).
- `data.frontmatter` is `null` when no frontmatter is detected.
- `install` also re-wires `md.renderHtml` so that it accepts an AST as well as text; the frontmatter itself has no rendering impact.

## See also

- [`md`](../md.md) — patched facade
- [`extra/toc`](./toc.md) — another pre-parse extra
- [Extending](../../guide/extending.md)
