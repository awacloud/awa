---
module: textSection
category: odf/text
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textSection

> Parse/render `<text:section>` — named region wrapping arbitrary text content.

**Module** `textSection` | **Source** `packages/front/office/odf/src/text/section.js` | **Deps** `xml` | **Worker-safe** yes

Model:

```js
{ type: 'section', name, styleName?, children: [...nodes], _extras? }
```

Children are passed through as-is (raw XML nodes) unless
`hooks.parseChild` / `hooks.renderChild` delegates them to a
higher-level parser (`textContent`).

## Resolve

```js
const section = runtime.resolve('textSection');
// → { parseSection, renderSection }
```

## API

| Method | Description |
|--------|-------------|
| `parseSection(el, hooks?)` | Converts a `<text:section>` node into the model. |
| `renderSection(sec, hooks?)` | Builds a `<text:section>` node. |

## Examples

```js
const section = runtime.resolve('textSection');
const el = xml.parse('<text:section text:name="Intro"><text:p>Hi</text:p></text:section>');
const s = section.parseSection(el, { parseChild: node => textContent.parseNode(node) });
section.renderSection(s, { renderChild: node => textContent.renderNode(node) });
```

## Notes

- Passing `hooks` lets a caller (typically `textContent`) type the section's children instead of leaving them as opaque XML.
- Unknown attributes on `<text:section>` other than `text:name`/`text:style-name` are preserved under `_extras.attrs`.

## See also

- [text/content](./content.md)
- [text/paragraph](./paragraph.md)
