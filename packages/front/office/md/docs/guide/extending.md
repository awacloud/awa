# Writing your own extra

The modules under `src/extra/` show how to extend `@awacloud/md`'s typed surface and rendering without touching the core. This guide explains how to write your own.

## When to write an extra

- You want to add non-CommonMark/GFM Markdown syntax (footnotes, math, wiki links, …).
- You want to post-process the AST (linking, slugifying, expanding).
- You want to wrap HTML rendering (post-rewrite, custom sanitize).

If your goal is broad, look at the [existing extras](../api/extra/README.md) first — there may already be what you need.

**Prerequisites**: `@awacloud/md` and `@awacloud/fw` as ES modules, and the `ModuleRuntime` registration of [Getting started](./getting-started.md) (`fw_require`, then `modules`); the examples below build on it.

## Extension contract

Different from ooxml's `.use()` hook. On the ooxml side, an extra implements `hydrate*` / `dehydrate*` hooks that the walker calls automatically on each visited node. On the `@awacloud/md` side, an extra implements:

```js
const myExtra = { name: 'myExtra', install(md) { /* patch md.parse, md.render, md.renderHtml, … */ } };
```

`install` receives the `md` instance and patches it directly. This style is **consistent with the markdown-it / remark ecosystem**: most Markdown extensions modify the **tokenizer or rendering**, more rarely the post-parse AST. The direct-patch pattern lets extras:

- Pre-process the source text (before the block parser — e.g. `frontmatter`, `footnotes` to strip defs).
- Post-process the AST (between parse and render — e.g. `emoji`, `math`, `highlight`, `subsuper`, `wikilinks`).
- Wrap HTML rendering (e.g. `mermaid`, math display).

## Skeleton of an extra

Every extra of the package is an `@awacloud/fw` factory descriptor whose `factory(...deps)` returns the installable `{ name, install }` object; the descriptor's `dependencies` name the md modules it needs (`mdNode` for the `Node` class, `mdAstWalker` for `walk`, …):

```js
const mdMyExtra = {
    name: 'mdMyExtra',
    dependencies: [],               // e.g. ['mdNode', 'mdAstWalker']
    factory() {
        return {
            name: 'mdMyExtra',
            install(md, opts) {
                const originalParse = md.parse;
                md.parse = function (text) {
                    const ast = originalParse.call(md, text);
                    // post-process `ast` here
                    return ast;
                };
                // Re-route renderHtml(string) so it goes through the patched parse.
                md.renderHtml = function (textOrAst, renderOpts) {
                    const ast = typeof textOrAst === 'string' ? md.parse(textOrAst) : textOrAst;
                    return md.render(ast, renderOpts);
                };
            }
        };
    }
};
```

Conventions:

1. **Pure** — no global side effect, no dynamic import.
2. **Idempotent** — `md.use(ext).use(ext)` must be a no-op (guaranteed by `md.js`, but avoid conditional mutation in `install` that depends on call count).
3. **Re-route `renderHtml`** — the core `md.renderHtml(text)` parses with the instance's own original `parse`, not with the patched `md.parse`; if you patch `md.parse`, re-wire `md.renderHtml` too (as above, which also lets it accept an AST). `md.renderMarkdown(text)` needs no re-wiring: it already parses a string through the patched `md.parse`.
4. **Prefix the `name`** with `md` (consistent with the core).

**Install order.** A later `.use()` wraps the earlier `parse`, so its pass runs later. A pass that claims text spans (math) must be installed before the passes that scan text for inline markers (`^x^`, `==x==`), otherwise those markers are split before the span is claimed.

## Full example: `==marked==` → `<mark>`

A shorter cousin of [`src/extra/highlight.js`](../../src/extra/highlight.js): it rewrites each `==text==` run of a text node into `<mark>` inline HTML, so the core renderer needs no new node type.

```js
const mdMark = {
    name: 'mdMark',
    dependencies: ['mdNode', 'mdAstWalker'],
    factory(mdNode, mdAstWalker) {
        const { Node, trustedHtmlInline } = mdNode;
        const { walk } = mdAstWalker;
        const RE = /==([^=\n]+?)==/g;

        function expand(root) {
            const texts = [];
            for (const { node, entering } of walk(root)) {
                if (entering && node.type === 'text' && node.literal.includes('==')) texts.push(node);
            }
            for (const t of texts) {
                const parts = [];
                let i = 0, m;
                RE.lastIndex = 0;
                while ((m = RE.exec(t.literal)) !== null) {
                    if (m.index > i) parts.push(['text', t.literal.slice(i, m.index)]);
                    parts.push(['html_inline', '<mark>'], ['text', m[1]], ['html_inline', '</mark>']);
                    i = m.index + m[0].length;
                }
                if (!parts.length) continue;
                if (i < t.literal.length) parts.push(['text', t.literal.slice(i)]);
                for (const [type, literal] of parts) {
                    // HTML is built with the factory, never from source text.
                    let n;
                    if (type === 'html_inline') n = trustedHtmlInline(literal);
                    else { n = new Node(type); n.literal = literal; }
                    t.insertBefore(n);
                }
                t.unlink();
            }
        }

        return {
            name: 'mdMark',
            install(md) {
                const originalParse = md.parse;
                md.parse = function (text) {
                    const ast = originalParse.call(md, text);
                    expand(ast);
                    return ast;
                };
                md.renderHtml = function (textOrAst, renderOpts) {
                    const ast = typeof textOrAst === 'string' ? md.parse(textOrAst) : textOrAst;
                    return md.render(ast, renderOpts);
                };
            }
        };
    }
};
```

Raw HTML and the `safe` default: the renderer strips the `html_block` / `html_inline` nodes that came from the Markdown source unless the call passes `safe: false`. HTML an extension emits is built with the `mdNode` factories `trustedHtmlInline(literal)` and `trustedHtmlBlock(literal)`, never from source text: a node they return carries the internal trust marker the renderer honours under `safe`, and the parser never sets it, so Markdown text cannot forge it. The marker is not a public option; the factories are the supported way to emit HTML the default render keeps. The factory trusts its argument, so escape every author-supplied string you put into it (the `mark` above embeds only constants). An extra that prefers to leave the default can still render with `safe: false` (add `sanitize: true` for an allowlist pass), or emit its HTML with the post-rewrite pattern below.

Limit: the pattern runs inside one text node, so a marker whose content holds other inline syntax (`==a *b* c==`) is not matched; `highlight.js` joins adjacent text siblings first to cover that.

## Pattern: source-level pre-pass

For syntax that CommonMark/GFM would otherwise consume before you get a chance to see it (footnote defs, admonition fences), pre-process the text before the block parser. Prefer a post-parse pass when the parser leaves enough information in the AST: `subsuper` reads single-tilde subscript from the `strikethrough` node's `delimiterCount` instead of rewriting the source, so code spans and URLs keep their bytes.

```js
const preProcess = (text) => {
    const m = /^%%(.*)\n/.exec(text);
    return m ? { rest: text.slice(m[0].length), meta: m[1] } : { rest: text, meta: null };
};

const mdMeta = {
    name: 'mdMeta',
    install(md) {
        const orig = md.parse;
        md.parse = function (text) {
            const { rest, meta } = preProcess(text);
            const ast = orig.call(md, rest);
            ast.data = Object.assign(ast.data || {}, { meta });
            return ast;
        };
        md.renderHtml = function (x, o) {
            const a = typeof x === 'string' ? md.parse(x) : x;
            return md.render(a, o);
        };
    }
};
```

Concrete examples: [`src/extra/frontmatter.js`](../../src/extra/frontmatter.js), [`src/extra/footnotes.js`](../../src/extra/footnotes.js).

## Pattern: post-rewrite of the HTML

For cases where patching the AST is too invasive, wrap `md.render` (the method that produces HTML from an AST) and do a regex replace, then re-route `renderHtml` so text input goes through the wrapped `render`:

```js
const mdBox = {
    name: 'mdBox',
    install(md) {
        const originalRender = md.render;
        md.render = function (ast, renderOpts) {
            return originalRender.call(md, ast, renderOpts).replace(
                /<pre><code class="language-box">([\s\S]*?)<\/code><\/pre>/g,
                (_, body) => `<div class="box">${body}</div>`);
        };
        md.renderHtml = function (x, o) {
            const a = typeof x === 'string' ? md.parse(x) : x;
            return md.render(a, o);
        };
    }
};
```

Example: [`src/extra/mermaid.js`](../../src/extra/mermaid.js).

## Trying it out

Resolve `md` as in [Getting started](./getting-started.md), register your descriptor on the same runtime, resolve it to get the installable object, and `.use()` it on an isolated instance. An extra that needs no module (like `mdMeta` or `mdBox` above) is a plain `{ name, install(md) }` object and can be passed to `.use()` directly:

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.register(mdMark);                       // the descriptor of the full example above

const md = runtime.resolve('md');
const m = md.createMd().use(runtime.resolve('mdMark'));
m.renderHtml('hi ==there== you');               // '<p>hi <mark>there</mark> you</p>\n' (kept under the safe default)
m.renderHtml('hi ==there== you', { safe: false }); // identical: the factory node needs no opt-out

md.createMd().use(mdMeta).parse('%%draft\n# T').data.meta;   // 'draft'
md.createMd().use(mdBox).renderHtml('```box\nhi\n```');      // '<div class="box">hi\n</div>\n'
```

`md.createMd()` (attached by `md.js` to the resolved `md` instance) gives a fresh, isolated instance so `.use(...)` doesn't mutate the shared runtime singleton.

## Tests

A minimum test (`bun:test` style):

```js
import { test, expect } from 'bun:test';
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
import { mdMark } from './my-mark.js';   // where you exported the descriptor above

runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.register(mdMark);
const md = runtime.resolve('md');

test('marks ==x== as <mark>', () => {
    const m = md.createMd().use(runtime.resolve('mdMark'));
    expect(m.renderHtml('hi ==there== you'))
        .toBe('<p>hi <mark>there</mark> you</p>\n');
});
```

## `Walker` (md) vs `treeWalker` (fw) — which to use

The md package exposes two AST-traversal helpers that look redundant. They are not:

| Use case | Use | Why |
|----------|-----|-----|
| Emit HTML / Markdown / XML from the AST (renderer) | `Walker` (md) | CommonMark semantics: a `leaving` event fires even on an empty container (needed to close `<ul></ul>` properly). |
| Find all `link` nodes to rewrite them | `findAll` (md) | Wraps `Walker` (md), so it stays consistent with the event order other md helpers expect. |
| Replace one node with another in the AST | `replaceNode` (md) | Throws a coded `ContractError` (`md/replace-node-no-parent`) — easier to debug. |
| Extend the AST with a custom node and have it visited | `Walker` (md) | The walker knows `isContainer(type)`; otherwise the node would be treated as a leaf. |
| Traverse an `@awacloud/ooxml` AST or a generic linked-tree structure | `treeWalker` (`@awacloud/fw/io/structures/tree-walker.js`) | DOM-agnostic helpers, no dependency on md types. |

In short: **inside the md package → `Walker`**; **in multi-AST code → `treeWalker` (fw)**. Both operate on the same `parent / firstChild / lastChild / prev / next + insertBefore / appendChild / unlink` shape, so a later migration is trivial.

## See also

- [Existing extras](../api/extra/README.md) — copy the closest one as a base
- [`api/md`](../api/md.md) — API surface to patch
- [Coverage](./coverage.md) — what is already handled
- [fw module pattern](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/guide/module-pattern.md)
- [fw treeWalker](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/io/structures/tree-walker.md) — generic alternative
