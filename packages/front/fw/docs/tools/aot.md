# `tools/rendering/aot/` — AOT template compiler

## Purpose

Walks one or more `.html` template files and emits a `.js` (or `.cjs`) module per template, exposing a factory function `tpl<Name>(data, slots?)` that returns the root `Element`. The generated function calls `document.createElement`/`createElementNS`/`createTextNode` directly — no fw runtime, no parser, no renderer.

## CLI usage

```sh
bun tools/rendering/aot/ <input> [--out <dir>] [--prefix <name>] [--esm|--cjs]
```

| Flag        | Default       | Description                                        |
| ----------- | ------------- | -------------------------------------------------- |
| `<input>`   | (required)    | `.html` file or directory (recursive walk).        |
| `--out`     | `dist/aot/`   | Output directory.                                  |
| `--prefix`  | `tpl`         | Factory name prefix. `nav.html` → `tplNav`.        |
| `--esm`     | (default)     | Emits `export default tpl…`.                       |
| `--cjs`     | —             | Emits `module.exports = tpl…` (filename → `.cjs`). |

Convenience npm script: `bun run build:aot <input>`.

## Feature support

| Feature                                  | AOT (`tools/rendering/aot/`) | ParseResult (`tools/rendering/precompilation/`) |
| ---------------------------------------- | :----------------: | :------------------------------------: |
| Static elements / attributes             | ✓                  | ✓                                      |
| `#{var}` text interpolation              | ✓                  | ✓                                      |
| `#{var}` attribute interpolation         | ✓                  | ✓                                      |
| `<!-- $name -->` iterate blocks          | ✓                  | ✓                                      |
| `${slot}` content slots                  | ✓                  | ✓                                      |
| SVG child elements (`svg_*`)             | ✓                  | ✓                                      |
| Synthetic mixed-content text nodes       | ✓                  | ✓                                      |
| Runtime `default` value on `map` entries | (always empty fallback) | ✓                               |
| Dynamic template registration            | ✗                  | ✓ (via `template.fromParseResult`)     |
| Dynamic class composition beyond `#{v}`  | ✗                  | ✓ (via render data)                    |
| Conditional render of arbitrary subtrees | iterate blocks only | iterate blocks only                   |

### When to use which

- **AOT (`tools/rendering/aot/`)** — maximum runtime performance and minimal payload. No fw parser/renderer at runtime. Ideal for hot-path views and static dashboards. Locked to template features declared at build time.
- **ParseResult (`tools/rendering/precompilation/`)** — retains the flexibility of the fw renderer (full `MapEntry` semantics including `default`, runtime data binding, attach/detach) while avoiding the per-template parsing cost. Ideal when templates change frequently or when you rely on advanced renderer features.

## Example

Input — `nav.html`:

```html
<nav class="main #{theme}">
    <h1>#{title}</h1>
    <ul>
        <!-- $items -->
        <li><a href="#{href}">#{label}</a></li>
        <!-- items$ -->
    </ul>
</nav>
```

Output — `dist/aot/nav.js`:

```js
function tplNav(data, slots) {
    data = data || {};
    const _frag = document.createDocumentFragment();
    const el0 = document.createElement("nav");
    el0.setAttribute("class", (data["theme"] !== undefined ? "main " + String(data["theme"]) : "main "));
    const el1 = document.createElement("h1");
    el1.textContent = (data["title"] !== undefined ? String(data["title"]) : "");
    el0.appendChild(el1);
    const el2 = document.createElement("ul");
    {
        const _arr = data["items"];
        if (_arr) for (const item3 of _arr) {
            const el4 = document.createElement("li");
            const el5 = document.createElement("a");
            el5.setAttribute("href", (item3["href"] !== undefined ? String(item3["href"]) : ""));
            el5.textContent = (item3["label"] !== undefined ? String(item3["label"]) : "");
            el4.appendChild(el5);
            el2.appendChild(el4);
        }
    }
    el0.appendChild(el2);
    _frag.appendChild(el0);
    return _frag.firstChild;
}
export default tplNav;
```

## Notes / limitations

- The generated code is **deterministic** (attributes sorted alphabetically; stable variable names `el<N>` / `item<N>`) for clean diffs.
- Runs anywhere `document` exists (browser, happy-dom, jsdom). Document this prerequisite for SSR consumers.
- Zero npm dependencies — only Bun built-ins and the fw parser itself.

## Tests

```sh
bun test tools/rendering/aot/index.test.js
```

Covers static elements, text/attribute interpolation, iterate blocks, slots, nesting, deterministic output, and ESM/CJS shape.

## See also

- [`precompilation.md`](./precompilation.md) — alternative that retains the fw runtime renderer.
- [`standalone.md`](./standalone.md) — self-contained ESM bundle for a single fw module.
- [`bundler.md`](./bundler.md) — main prebuild orchestrator.
- [`../README.md`](../README.md) — general fw doc index.
