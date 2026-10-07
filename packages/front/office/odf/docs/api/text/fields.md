---
module: textFields
category: odf/text
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textFields

> Inline ODF text fields (`<text:date>`, `<text:page-number>`, variables, references).

**Module** `textFields` | **Source** `packages/front/office/odf/src/text/fields.js` | **Deps** `xml` | **Worker-safe** yes

Model: `{ type: 'field', kind, value?, attrs, _extras? }`.

`kind` is the local element name minus the `text:` prefix (e.g. `'date'`, `'page-number'`, `'variable-set'`).

Recognised elements:

`text:date`, `text:time`, `text:page-number`, `text:page-count`,
`text:author-name`, `text:title`, `text:subject`, `text:keywords`,
`text:file-name`, `text:variable-set`, `text:variable-get`,
`text:user-field-get`, `text:sequence`, `text:bookmark-ref`,
`text:reference-ref`.

## Resolve

```js
const fields = runtime.resolve('textFields');
// → { isFieldName, parseField, renderField, KINDS }
```

## API

| Method | Description |
|--------|-------------|
| `isFieldName(name)` | Returns whether `name` is a recognised field element name. |
| `parseField(el)` | Converts an inline field node into the model. |
| `renderField(f)` | Builds an XML element node from the model. |
| `KINDS` | `Set` of the fifteen recognised `text:` field element names. |

## Examples

```js
const fields = runtime.resolve('textFields');
const el = xml.parse('<text:page-number>3</text:page-number>');
const f = fields.parseField(el);
// { type: 'field', kind: 'page-number', attrs: {}, value: '3' }
fields.renderField(f);
```

## Notes

- Element-typed children (rare, non-text) are preserved verbatim under `_extras.children`.
- Fields are inline runs; they surface inside paragraph/heading content via `textContent`/`textParagraph`, not standalone.

## See also

- [text/paragraph](./paragraph.md)
- [text/bookmarks](./bookmarks.md)
