---
tool: jsx
category: tools/rendering
status: complete
---

# `tools/rendering/jsx/` — JSX → ParseResult precompiler

> Compile `.jsx` template files to `ParseResult` JSON at build time, zero runtime overhead.

**Tool** `tools/rendering/jsx/` | **Source** `packages/front/fw/tools/rendering/jsx/index.js` | **Worker-safe** N/A (offline build tool)

## Purpose

The JSX precompiler lowers `.jsx` template files to the same `ParseResult` that
`parser.fromHTML()` produces at runtime, then emits the result as JSON (and
optionally as an ESM module). The **runtime is untouched** — JSX is purely an
input syntax lowered offline, exactly like the AOT and precompilation tools.

This is the **blessed path**: JSX for ergonomics, ParseResult for compatibility.
The existing `render` / `template` / hydration pipeline consumes the output
unchanged.

## CLI usage

```sh
bun run tools/rendering/jsx/ <input> [options]
```

| Argument / flag    | Description                                                              |
| ------------------ | ------------------------------------------------------------------------ |
| `<input>`          | A `.jsx` file OR a directory (walked recursively).                       |
| `--out <dir>`      | Output directory. Default: next to each input file.                      |
| `--ext <ext>`      | Output extension. Default: `.parseresult.json`.                          |
| `--glob <pat>`     | Glob filter for directory walks. Default: `**/*.jsx`.                    |
| `--minify`         | Emit compact JSON (no indentation).                                      |
| `--verify`         | Re-parse via `template.fromParseResult` and deep-compare.                |
| `--esm`            | Also emit a sibling `.js` file: `export default {...}`.                  |
| `--help, -h`       | Print this help.                                                         |

Examples:

```sh
# Compile a single file
bun run tools/rendering/jsx/ src/components/card.jsx --out dist/tpl --minify

# Compile a directory, emit ESM siblings, verify in CI
bun run tools/rendering/jsx/ src/components --out dist/tpl --esm --verify
```

## Programmatic API

`compileJsx(source, opts?) → ParseResult` is **self-contained**: it
instantiates its own `secPolicy` + `parser` internally (matching how the CLI
obtains its parser), so no pre-built parser is required. Pass nothing for the
common case; the `opts` bag is the same CLI options object (`minify`,
`verify`, `esm`) and additionally accepts `opts.parser` to reuse an existing
parser instance.

```js
import { compileJsx, jsxToHTML } from './tools/rendering/jsx/index.js';

// Compile JSX source to ParseResult — no parser to build.
const result = compileJsx('<div id="card">{title}</div>');
// → { template: [{ id: 'card', tag: 'div', text: '', map: [...] }] }

// Reuse a parser instance across many compiles (optional):
import { parser }    from './src/dom/rendering/parser.js';
import { secPolicy } from './src/dom/rendering/secPolicy.js';
const p = parser.factory(secPolicy.factory());
const r2 = compileJsx('<div id="card">{title}</div>', { parser: p });

// Low-level: JSX → HTML string (for inspection / testing)
const html = jsxToHTML('<div id="r" class={cls}></div>');
// → '<div id="r" class="#{cls}"></div>'
```

## Mapping rules

The table below shows how each JSX construct maps to the framework's
`#{}` / `${}` HTML template notation and the resulting `ParseResult` shape.
The output is **byte-for-equivalent** (deep-equal) to what `parser.fromHTML()`
returns for the corresponding `#{}/${} ` template.

| JSX source | HTML equivalent | ParseResult effect |
|---|---|---|
| `<div>static text</div>` | `<div>static text</div>` | `elm.text = "static text"` |
| `<div>{name}</div>` | `<div>#{name}</div>` | `elm.text = "", elm.map = [{name:"name",prop:"text"}]` |
| `<div class={cls}>` | `<div class="#{cls}">` | `elm.data.class = "", elm.map = [{…data:true}]` |
| `<div class="a {cls} b">` | `<div class="a #{cls} b">` | `elm.data.class = "a ", elm.map = [{…append:true}]` |
| `<Slot name="content"/>` | `${content}` | `elm.content = "content"` |
| `<Each name="items"><li>…</li></Each>` | `<!-- $items --><li>…</li><!-- items$ -->` | `elm.content = "items"`, `result.iterates.items = […]` |

### The `{name}`-is-a-binding rule

Inside JSX template files `{…}` must contain **only a plain identifier**
(e.g. `{myVar}`), not an arbitrary JavaScript expression. This constraint is
what keeps the output compatible with the no-vdom / AOT / hydration pipeline:
the compiler never needs to evaluate JavaScript; it only needs to record a
binding name that `render.js` resolves at runtime against the data object.

Attempting to write `{a + b}` or `{obj.prop}` will throw at compile time with
a clear error message.

### Slot syntax: `<Slot name="…"/>`

A self-closing `<Slot name="content"/>` element lowers to `${content}` in the
HTML notation, producing `elm.content = "content"` in the `ParseResult`.
The slot is then filled by `render.toHTML(result, data, { slots: { content: '…' } })`
or by `template.elm(ctx, elm)` at runtime.

### Iteration: `<Each name="…">…</Each>`

An `<Each name="items">` block lowers to the `<!-- $items -->…<!-- items$ -->`
comment-delimiter notation the parser recognises. The elements inside become
`result.iterates.items`. At runtime, `render.toHTML(result, data, { iterates: { items: rows } })`
renders each row against the sub-template.

## Consumer toolchain (editor support)

The precompiler requires no fw-specific build plugin. Standard
`jsxImportSource` / `jsxFactory` config (esbuild / tsc) is used **for the
editor and type-checker only** — the compiled output never reaches a browser.

### `tsconfig.json` snippet

```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "h",
    "jsxFragmentFactory": "Fragment",
    "jsxImportSource": "@awacloud/fw/tools/rendering/jsx/types"
  }
}
```

### esbuild snippet

```js
esbuild.build({
  jsx: 'transform',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
});
```

### JSX type stub (`types/jsx.d.ts`)

Place a `jsx.d.ts` next to your templates for `<Slot>` / `<Each>` autocomplete:

```ts
// @awacloud/fw JSX intrinsic elements stub
declare namespace JSX {
  interface IntrinsicElements {
    [tag: string]: Record<string, unknown>;
    Slot: { name: string };
    Each: { name: string; children?: unknown };
  }
}
```

No fw-specific build plugin is required; the precompiler is invoked as a
pre-build step, before esbuild / tsc.

## Runtime integration

```js
import { template } from '@awacloud/fw/dom/rendering/template.js';
import { secPolicy } from '@awacloud/fw/dom/rendering/secPolicy.js';
import precompiled from './card.jsx.parseresult.json' assert { type: 'json' };

const tpl = template.factory(secPolicy.factory());
const pr  = tpl.fromParseResult(precompiled);
// pr has the same shape as parser.fromHTML(html) — pass to cmd.elms, render.toHTML, etc.
```

With `--esm` (portable, no JSON import assertions needed):

```js
import precompiled from './card.jsx.parseresult.js';
const pr = tpl.fromParseResult(precompiled);
```

## Security policy parity

The JSX precompiler enforces the same `secPolicy` rules as `parser.fromHTML()`:

- `<script>`, `<object>`, `<embed>`, `<iframe>` tags are silently dropped.
- `on*` event-handler attributes (e.g. `onclick={handler}`) are silently dropped.
- URL-bearing attributes (`href`, `src`, …) carrying `javascript:` / `vbscript:`
  values are stored as-is at parse time and rejected by `render.js` / `template.js`
  at render time — identical behaviour to the HTML parse path.

## Tests

```sh
bun test packages/front/fw/tools/rendering/jsx/
```

Covers: all mapping rules (deep-equal to `parser.fromHTML()`), secPolicy
parity, `--verify` round-trip, fixtures, `--esm`, directory walk, error cases,
and SSR `render.toHTML()` integration.

## Non-goals

### Runtime `parser.fromJSX()` — not shipped

Rationale: a runtime JSX parser would require shipping a JSX tokenizer to the
browser, breaking the zero-runtime-deps constraint. The precompiler produces
the same `ParseResult` offline; use `template.fromParseResult()` to load it.
Substitute: run `bun run tools/rendering/jsx/` as a pre-build step.

### Arbitrary `{expr}` expressions — not supported

Rationale: arbitrary JS expressions (`{a + b}`, `{obj.prop}`) would require
a full JS evaluator at compile time and a corresponding vdom at runtime,
undermining the no-vdom / AOT / hydration invariants. Only plain identifier
bindings (`{myVar}`) are accepted — they map directly to the `#{}` template
notation. Substitute: compute derived values in your data layer before passing
to `render` / `template`.

### Virtual DOM — not included

Rationale: the framework's rendering model is `ParseResult` → flat elm-array →
`render.js` data-binding → `template.js` DOM patching. A vdom layer would
duplicate this mechanism and introduce reconciliation overhead. The JSX
precompiler is a one-way lowering, not a vdom implementation. Substitute: use
the existing `render` + `template` + `uiSession` modules for reactive updates.

## See also

- [`aot.md`](./aot.md) — compiles templates to imperative factory JS for maximum startup performance.
- [`precompilation.md`](./precompilation.md) — compiles `.html` templates (with `#{}/${} ` notation) to `ParseResult` JSON.
- [`../api/dom/rendering/parser.md`](../api/dom/rendering/parser.md) — `ParseResult` shape and `parser.fromHTML()` reference.
- [`../api/dom/rendering/render.md`](../api/dom/rendering/render.md) — `render.toHTML()` SSR and `render.elms()` binding reference.
