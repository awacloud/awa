# AWA Markdown

> **Render Markdown you did not write, sanitized by default**

AI answers and your users' content are untrusted input. AWA Markdown renders and transforms them; scripts and dangerous links are blocked by default. Markdown is the text format AI models read and write natively.

- [Features](#features)
- [Strengths](#strengths)
- [In your code](#in-your-code)
- [Licence and pricing](#licence-and-pricing)

## Features

- **Render** — Turns Markdown into display-ready HTML: headings, lists, links, images, code, plus the GitHub additions (tables, task lists, strikethrough, autolinks).
- **Rewrite** — Gives access to the document's full tree, to rewrite links, shift headings or redact a passage before display or indexing.
- **Re-emit** — After editing, writes CommonMark and GFM Markdown back without breaking its structure.
- **Extend** — Front matter, math, footnotes, admonitions, table of contents, Mermaid: ten extensions to switch on as you need them.

## Strengths

| Strengths | |
|---|---|
| **Tested against the standards** | AWA Markdown passes all 652 official CommonMark 0.31 examples; the GitHub additions are covered by a suite of cases drawn from their specification. |
| **Safe by default** | The HTML output is sanitized: scripts, frames and dangerous links are blocked with no configuration. |
| **No third-party dependency** | The library relies on no external package at runtime. |

## In your code

A few lines in the browser, no server and no upload: this page is rendered the same way.

```js
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const { md } = bootstrapMd();
md.renderHtml('# Hello\n\n*world*');
// → '<h1>Hello</h1>\n<p><em>world</em></p>\n'
```

## Licence and pricing

> **€490 excl. VAT** per application per year, unlimited users and servers.

Unlimited developers, servers and users. Commercial licence or AGPL-3.0-only. Shipping AWA Markdown to your users' browsers or inside software you distribute? The AGPL then puts source-code obligations on you; the commercial licence exempts you from them.

---

*Made with AWA Markdown by AwaCloud. Opened here by AWA Viewer, on your device: nothing was uploaded. Offers and pricing: [awacloud.com/offers](https://awacloud.com/offers)*
