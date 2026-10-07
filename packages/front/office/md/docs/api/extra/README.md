# Extras `@awacloud/md`

10 opt-in modules for out-of-spec CommonMark / GFM extensions. Each extra is a factory descriptor whose `factory()` returns an object following the `{ name, install(md) }` contract, registered via `md.use(...)`.

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md          = runtime.resolve('md');
const mdHighlight = runtime.resolve('mdHighlight');   // resolves through its own dependencies
const m = md.createMd().use(mdHighlight);
```

Idempotent: registering the same `name` twice is a no-op.

Each extra depends on at least `mdAstWalker` + `mdAstTypes` (and often `mdNode` and/or `mdShared`) for its own AST-manipulation helpers — see each page's frontmatter for the exact list; resolving through the runtime (as above) satisfies them automatically.

## Catalog

| Module | Source | Syntax | Strategy |
|--------|--------|--------|----------|
| [`mdFrontmatter`](./frontmatter.md) | `src/extra/frontmatter.js` | `---\nyaml\n---` (+ TOML/JSON) | Pre-strip before the block parser |
| [`mdEmoji`](./emoji.md) | `src/extra/emoji.js` | `:smile:` | Post-walk text nodes |
| [`mdMath`](./math.md) | `src/extra/math.js` | `$x$`, `$$x$$`, ` ```math ` | Post-walk + render wrap |
| [`mdFootnotes`](./footnotes.md) | `src/extra/footnotes.js` | `[^1]` + `[^1]: body` | Pre-strip defs + AST replace |
| [`mdWikilinks`](./wikilinks.md) | `src/extra/wikilinks.js` | `[[Page]]`, `[[Page\|alias]]` | Post-walk text nodes |
| [`mdAdmonitions`](./admonitions.md) | `src/extra/admonitions.js` | `[!NOTE]`, `!!! note` | Pre-pass + AST lower |
| [`mdHighlight`](./highlight.md) | `src/extra/highlight.js` | `==marked==` | Post-walk text nodes |
| [`mdSubsuper`](./subsuper.md) | `src/extra/subsuper.js` | `H~2~O`, `E=mc^2^` | Post-parse AST pass + render lower |
| [`mdToc`](./toc.md) | `src/extra/toc.js` | `[[TOC]]` + heading scan | Post-walk |
| [`mdMermaid`](./mermaid.md) | `src/extra/mermaid.js` | ` ```mermaid ` | Post-render HTML rewrite |

## Registration pattern

```js
const md            = runtime.resolve('md');
const mdFrontmatter = runtime.resolve('mdFrontmatter');
const mdEmoji       = runtime.resolve('mdEmoji');
const m = md.createMd().use(mdFrontmatter).use(mdEmoji);
```

Or all at once with the bundle (installs every extra on the shared resolved `md` instance):

```js
import { bundle } from '@awacloud/md';

runtime.registerAll(bundle);   // the `bundle` array from `@awacloud/md`
const mdFull = runtime.resolve('mdFullBundle');
```

## See also

- [Bundles](../bundles/README.md) — pre-wired composition
- [Extending](../../guide/extending.md) — writing a new extra
- [Coverage](../../guide/coverage.md) — which cases are handled
