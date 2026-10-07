---
module: textBookmarks
category: odf/text
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textBookmarks

> Inline bookmark / reference-mark markers found inside `<text:p>` / `<text:h>`.

**Module** `textBookmarks` | **Source** `packages/front/office/odf/src/text/bookmarks.js` | **Deps** `xml` | **Worker-safe** yes

Model: `{ type: 'marker', kind, name?, _extras? }` where `kind` is one of:
`text:bookmark`, `text:bookmark-start`, `text:bookmark-end`,
`text:reference-mark`, `text:reference-mark-start`, `text:reference-mark-end`.

## Resolve

```js
const bookmarks = runtime.resolve('textBookmarks');
// → { isMarkerName, parseMarker, renderMarker, KINDS }
```

## API

| Method | Description |
|--------|-------------|
| `isMarkerName(name)` | Returns whether `name` is a recognised marker element name. |
| `parseMarker(el)` | Converts a marker/reference-mark node into the model. |
| `renderMarker(m)` | Builds an XML element node from the model. |
| `KINDS` | `Set` of the six recognised `text:` element names. |

## Examples

```js
const bookmarks = runtime.resolve('textBookmarks');
const el = xml.parse('<text:bookmark text:name="anchor1"/>');
const m = bookmarks.parseMarker(el);
// { type: 'marker', kind: 'text:bookmark', name: 'anchor1' }
bookmarks.renderMarker(m);
```

## Notes

- Only the marker element itself is modelled; the surrounding run/paragraph is handled by `textParagraph`/`textContent`.
- Unknown attributes beyond `text:name` are preserved verbatim under `_extras.attrs`.

## See also

- [text/paragraph](./paragraph.md)
- [text/content](./content.md)
