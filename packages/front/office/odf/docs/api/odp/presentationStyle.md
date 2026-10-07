---
module: presentationStyle
category: odf/odp
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# presentationStyle

> Parse/render `<presentation:placeholder>` and `<presentation:notes>`.

**Module** `presentationStyle` | **Source** `packages/front/office/odf/src/odp/presentationStyle.js` | **Deps** `xml` | **Worker-safe** yes

Models:

```js
// placeholder
{ type: 'placeholder', objectType?, x?, y?, width?, height?, _extras? }

// notes
{ type: 'notes', styleName?, body: [ ...rawXml ], _extras? }
```

## API

| Method | Description |
|---------|-------------|
| `parsePlaceholder(el)` | Converts `<presentation:placeholder>` to a model. |
| `renderPlaceholder(p)` | Builds the XML element. |
| `parseNotes(el)` | Converts `<presentation:notes>` to a model. |
| `renderNotes(n)` | Builds the XML element. |

## Notes

- The notes body (`body`) is preserved as raw XML — `textContent`
  can type it when reading.
- Animations (`anim:*`) and transitions are not typed here:
  [`odpAnimations`](./animations.md) parses and renders `anim:*` trees and
  the basic `presentation:transition` element, and the opt-in
  `animationsSmil` extra types every `anim:*` element.

## See also

- [odp/slide](./slide.md)
- [odp/odp](./odp.md)
