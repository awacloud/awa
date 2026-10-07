---
module: mdHtmlTheme
category: md/document
dependencies: [mdErrors]
returns: object
worker-safe: true
status: complete
---

# document/theme

> Embedded stylesheet of the single-HTML document — light / dark / auto, layout, print.

**Module** `mdHtmlTheme` | **Source** `packages/front/office/md/src/document/theme.js` | **Deps** `mdErrors` | **Worker-safe** yes

Pure string factory — no DOM, no network resource (no `url(`, no `@import`, no `expression(`, no `javascript:` anywhere in the returned text). Returns the full CSS text embedded by the `md → HTML document` builder: three themes sharing ONE rules body over a fixed set of `--md-*` custom properties — only the token block differs between `light`, `dark` and `auto`.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const { THEMES, css } = runtime.resolve('mdHtmlTheme');
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `THEMES` | `readonly ['light', 'dark', 'auto']` | Frozen array of the accepted theme names |
| `css` | `(theme?: 'light' \| 'dark' \| 'auto') => string` | Full stylesheet text; `theme` defaults to `'auto'` |

`css` throws `ContractError` (`md/document-bad-option`) when `theme` is not one of `THEMES`.

## Tokens

Every colour is a custom property on `:root` (`.md-document` may re-declare them). Non-colour tokens (`--md-mono`, `--md-sans`, `--md-measure`) are constant across palettes.

| Token | light | dark |
|-------|-------|------|
| `--md-bg` | `#f3f5f2` | `#121618` |
| `--md-paper` | `#fbfcfa` | `#1b2123` |
| `--md-ink` | `#1f2420` | `#e4e9e5` |
| `--md-muted` | `#64706a` | `#9fb0a7` |
| `--md-accent` | `#1f6b4a` | `#7fcfa5` |
| `--md-accent-soft` | `#e1efe7` | `#243430` |
| `--md-line` | `#d9e0dc` | `#33403b` |
| `--md-code-bg` | `#e8ede9` | `#26302c` |
| `--md-pre-bg` | `#22292a` | `#0f1315` |
| `--md-pre-ink` | `#e6ebe7` | `#d8dedb` |
| `--md-mono` | `ui-monospace, 'Cascadia Code', Consolas, monospace` | (same) |
| `--md-sans` | `'Segoe UI', system-ui, -apple-system, sans-serif` | (same) |
| `--md-measure` | `72ch` | (same) |

`css('light')` = tokens(light) + rules; `css('dark')` = tokens(dark) + rules; `css('auto')` = tokens(light) + `@media (prefers-color-scheme: dark) { :root { …dark tokens… } }` + rules. The rules text is byte-identical across the three themes — only the token blocks differ.

## Class contract

The document builder (`document/html-document`) emits exactly these classes/attributes; this stylesheet styles exactly these selectors.

| Selector | Role |
|---|---|
| `body.md-document`, `.md-theme-light\|dark\|auto`, `.md-single`, `.md-multi` | root classes |
| `header.md-top` > `button#md-nav-toggle` (multi only), `span.md-brand`, `span.md-classification` | fixed 52 px top bar; classification badge (uppercase, accent background) |
| `aside.md-nav` > `a.md-nav-item[data-doc]` (`.active`) > `span.md-nav-title`, `span.md-nav-path` | fixed 320 px left sidebar (multi only) |
| `main.md-main` > `article.md-doc[id]` | `.md-single` → `main` has no left margin and `article` is always visible; `.md-multi` → left margin 320 px, `article[hidden]{display:none}` |
| `article` > `div.md-doc-meta` > `span.md-doc-path`, `span.md-doc-version`, `span.md-doc-date` | meta line under the article top |
| `nav.md-toc` > `span.md-toc-label`, `a[data-level]` | per-document TOC; `a[data-level="3"]` indented / smaller |
| `div.md-body` | reading styles: `h1…h6`, `p`, `a`, `blockquote`, `table` (block, overflow-x auto), `th`, `td`, `code`, `pre`, `pre code`, `ul`, `ol`, `li`, `input[type=checkbox]`, `hr`, `img` (`max-width:100%`), `.admonition`, `.admonition-title`, `.footnotes`, `.footnote-ref`, `mark`, `.math`, `.mermaid` (rendered like `pre`) |
| `div.md-pager` > `a.md-pager-prev`, `a.md-pager-next` | prev/next (multi only) |
| `a.md-dead-link` | neutralised link: muted, dashed underline, `cursor: help` |
| `footer.md-footer` | small centred line |
| `@media (max-width: 920px)` | `#md-nav-toggle` shown, sidebar off-canvas, `body.md-nav-open aside.md-nav` slid in, `main` full width |
| `@media print` | `header.md-top`, `aside.md-nav`, `.md-pager`, `footer.md-footer` hidden; `main` margin 0; `article` unboxed; `article[hidden]` stays hidden |

## Examples

```js
const { css } = runtime.resolve('mdHtmlTheme');

css('light');   // ':root { --md-bg: #f3f5f2; ... }\n* { box-sizing: ... } ...'
css('dark');    // same rules body, dark token block
css();          // === css('auto') — light tokens + a prefers-color-scheme media query
```

```js
try {
    css('sepia');
} catch (e) {
    e.code; // 'md/document-bad-option'
}
```

## Notes

- `auto` (the default) is `light` tokens on `:root` plus a `@media (prefers-color-scheme: dark)` block re-declaring the dark tokens — the reader's OS preference is honoured with no script.
- The returned text is network-free by construction: no `url(`, `@import`, `expression(` or `javascript:` — verified by a regex test on every theme's output, not by review.
- The document builder (`document/html-document`) embeds this text verbatim inside a `<style>` element of the single emitted HTML file; nothing here touches the DOM.
- All four foreground/background pairs (`ink`/`paper`, `muted`/`paper`, `accent`/`paper`, `pre-ink`/`pre-bg`) clear WCAG AA (≥ 4.5:1) in both palettes.

## See also

- [`document/html-document`](./html-document.md) — embeds this stylesheet in the emitted document
- [`errors`](../errors.md) — `ContractError` / `md/document-bad-option`
