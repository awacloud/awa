---
module: textHeading
category: odf/text
dependencies: [xml, textParagraph]
returns: object
worker-safe: true
status: complete
---

# textHeading

> Parse/render `<text:h>` — paragraph with `text:outline-level`.

**Module** `textHeading` | **Source** `packages/front/office/odf/src/text/heading.js` | **Deps** `xml, textParagraph` | **Worker-safe** yes

Model:

```js
{ type: 'heading', outlineLevel: 1..10, styleName?, runs: [<run>...], _extras? }
```

Runs are exactly `textParagraph`'s runs — same kinds, same fields:

| Kind | Extra field | ODF element |
|------|-------------|-------------|
| `text` | `value` | (inline text) |
| `span` | `value`, `styleName?`, `bold?`, `italic?`, `strike?`, `monospace?`, `runs?`, `_extras?` | `<text:span>` |
| `space` | `count` | `<text:s text:c="N"/>` |
| `tab` | — | `<text:tab/>` |
| `line-break` | — | `<text:line-break/>` |
| `link` | `href`, `runs`, `_extras?` | `<text:a>` |

The `span` emphasis flags and the `link` run kind — including the write-side
precedence rule (**an explicit `styleName` wins; the flags are consulted only
when `styleName` is absent**) — are defined once, in
[text/paragraph](./paragraph.md). This module adds no run semantics of its own.

## Resolve

```js
const heading = runtime.resolve('textHeading');
// → { parseHeading, renderHeading, heading }
```

## API

| Method | Description |
|--------|-------------|
| `parseHeading(el, ctx?)` | Converts a `<text:h>` node into the model (re-uses paragraph run parsing). `ctx` is forwarded verbatim. |
| `renderHeading(h, ctx?)` | Builds a `<text:h>` node. `ctx` is forwarded verbatim. |
| `heading(text, { outlineLevel?, styleName? })` | Helper — builds a single-text-run heading. |

## Examples

```js
const hd = heading.heading('Chapter 1', { outlineLevel: 1, styleName: 'H1' });
heading.renderHeading(hd);
```

## Notes

- Run parsing/rendering is delegated to `textParagraph`; `outlineLevel` defaults to `1` when the `text:outline-level` attribute is missing or non-positive.
- **Attributes** — as for paragraphs, every `<text:h>` attribute other than
  `text:style-name` and `text:outline-level` (`text:is-list-header`, `xml:id`,
  …) is preserved verbatim in `_extras.attrs` and re-emitted on write. The
  outline level is typed once (`outlineLevel`), never carried in
  `_extras.attrs`, so a changed `outlineLevel` is what gets written.
- `heading()` mirrors `textParagraph.paragraph()`'s helper shape, adding the required `outlineLevel`.
- **`ctx` pass-through** — the optional trailing `ctx` (the `textStyleRegistry`
  style seam built by `odt`: a resolver on read, a registry on write) is
  forwarded unchanged to `parseParagraph` / `renderParagraph`. Called without a
  `ctx` — as the `odp` / `ods` paths do — behaviour is unchanged: emphasis flags
  degrade to a plain unstyled `<text:span>` with the text intact. See
  [text/paragraph](./paragraph.md) § the `ctx` style seam.

## See also

- [text/paragraph](./paragraph.md)
- [text/style-registry](./style-registry.md)
- [text/content](./content.md)
