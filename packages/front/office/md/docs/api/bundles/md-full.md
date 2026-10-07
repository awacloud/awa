---
module: mdFullBundle
category: md/bundles
dependencies: [md, mdFrontmatter, mdFootnotes, mdMath, mdSubsuper, mdHighlight, mdEmoji, mdToc, mdWikilinks, mdAdmonitions, mdMermaid]
returns: object
worker-safe: true
status: complete
---

# md-full

> Full bundle — core + all 10 pre-wired extras, as the `mdFullBundle` factory descriptor.

**Module** `mdFullBundle` | **Source** `packages/front/office/md/src/bundles/md-full.js` | **Deps** `md`, `mdFrontmatter`, `mdFootnotes`, `mdMath`, `mdSubsuper`, `mdHighlight`, `mdEmoji`, `mdToc`, `mdWikilinks`, `mdAdmonitions`, `mdMermaid` | **Worker-safe** yes

Use this bundle to cover the widest Markdown surface: frontmatter, math, footnotes, wikilinks, admonitions, highlight, sub/sup, TOC, emoji, mermaid. The `.use(...)` calls are chained in a deterministic, documented order.

There is no `mdFull` singleton or `createMdFull()` helper exported anywhere — `mdFullBundle` is a plain factory descriptor whose `factory(md, ...extras)` `.use()`-installs every extra onto the resolved `md` instance and returns it.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras, bundle } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.registerAll(bundle);

const mdFull = runtime.resolve('mdFullBundle');
```

## Includes

Everything in [`md`](../md.md) (core), plus in this order:

1. [`mdFrontmatter`](../extra/frontmatter.md) — pre-strip YAML/TOML/JSON
2. [`mdFootnotes`](../extra/footnotes.md) — pre-strip `[^id]: …` defs
3. [`mdMath`](../extra/math.md) — `$…$`, `$$…$$`, ` ```math `
4. [`mdSubsuper`](../extra/subsuper.md) — post-parse pass: single-tilde strikethrough → `~x~` subscript, `^x^` → superscript (after `mdMath` and `mdFootnotes`)
5. [`mdHighlight`](../extra/highlight.md) — `==marked==`
6. [`mdEmoji`](../extra/emoji.md) — `:smile:` → 😄
7. [`mdToc`](../extra/toc.md) — `[[TOC]]` + `generate()`
8. [`mdWikilinks`](../extra/wikilinks.md) — `[[Page]]` (after footnotes)
9. [`mdAdmonitions`](../extra/admonitions.md) — `[!NOTE]` + `!!! note`
10. [`mdMermaid`](../extra/mermaid.md) — post-render wrap (last)

## API

`mdFullBundle`'s factory returns the resolved `md` instance with the 10 extras installed — same shape as [`md`](../md.md)'s API (`parse`, `render`, `renderHtml`, `renderMarkdown`, `use`, `extensions`, `createMd`, `ContractError`). Once the extras are installed, `renderHtml` accepts an AST as well as text.

## Examples

### Case 1 — one-shot usage

```js
const mdFull = runtime.resolve('mdFullBundle');
mdFull.renderHtml('---\ntitle: x\n---\n\n:rocket: $e=mc^2$ ==go==');
```

### Case 2 — fresh isolated instance

```js
const m = mdFull.createMd();
const ast = m.parse('# Doc\n\n[^1]: note');
m.render(ast);   // a core instance: `renderHtml` takes text, `render` takes an AST
```

Note: `createMd()` on the resolved `mdFullBundle` instance produces a fresh **core** instance (per [`md`](../md.md)'s own `createMd`), without the extras re-applied — to get another fully-extra'd instance, `.use()` the same resolved extras again, or re-resolve `mdFullBundle` (the runtime caches the singleton by default).

### Case 3 — with an additional custom extra

```js
const myCustomExt = { name: 'my-ext', install(md) { /* patch md.parse / md.render … */ } };

const mdFull = runtime.resolve('mdFullBundle');
mdFull.use(myCustomExt);
```

## Notes

- `.use(...)` order matters — a later `.use()` wraps the earlier `md.parse`, so its pass runs later. `mdFrontmatter` strips first, `mdFootnotes` runs before `mdWikilinks` and `mdSubsuper`, `mdMath` runs before the inline text passes (`mdSubsuper`, `mdHighlight`) so `$x^{2}y^{3}$` stays math, and `mdMermaid` is last (post-render).
- Idempotence is guaranteed: re-`.use()`-ing an already-installed extra (same `name`) is a no-op.
- `mdFullBundle` resolves to the SAME instance as `runtime.resolve('md')` (it installs the extras on it and returns it), so resolving the bundle also changes what `'md'` does afterwards; for divergent configs, build a fresh instance via `.createMd(opts)` and `.use()` the needed extras onto it directly.

## See also

- [`md`](../md.md) — core-only API
- [Extras](../extra/README.md) — individual detail
- [Coverage](../../guide/coverage.md) — which cases `md-full` handles
