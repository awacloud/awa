---
module: legacyVml
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# legacyVml

> Standalone VML mapper — `urn:schemas-microsoft-com:vml` + office namespace.

**Module** `legacyVml` | **Source** `packages/front/office/ooxml/src/extra/legacy-vml.js` | **Deps** `xml` | **Worker-safe** yes

A generic VML parser/renderer, used by xlsx comments (`xl/drawings/vmlDrawing*.vml`), legacy docx pictures, and any other VML island found in an OOXML package.

## Resolve

```js
const ext = legacyVml.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseElement` | `(el) => {kind, attrs, extraAttrs, children}` | typed dispatcher across every `v:*`/`o:*` tag; unrecognised attributes are preserved in `extraAttrs` |
| `renderElement` | `(node) => XmlNode` | inverse dispatcher — one `xml.el('v:foo', …)` call site per tag |
| `parseVml` | `(text: string) => XmlNode` | backward-compat raw passthrough (`xml.parse`, used by the smoke test) |
| `renderVml` | `(node: XmlNode) => string` | backward-compat raw passthrough (`xml.serialize`) |
| `VML_TAGS` | `string[]` | every known `v:*`/`o:*` tag name (`Object.keys(VML_ATTRS)`) |
| `VML_ATTRS` | `Record<string, string[]>` | documented attribute schema per tag |

## Elements typed

`v:shape`, `v:shapetype`, `v:group`, `v:rect`, `v:roundrect`, `v:oval`, `v:line`, `v:polyline`, `v:image`, `v:fill`, `v:stroke`, `v:textbox`, `v:formulas`, `v:f`, `v:path`, `v:imagedata`, plus the `o:*` extension namespace (`o:OLEObject`, `o:lock`, `o:idmap`, `o:colormru`, …).

## Notes

- Coordinates use VML's `style` CSS string (`position:absolute;left:1in;top:0.5in;…`).
- This module is only required for legacy fixtures; modern producers emit DrawingML.

## See also

- [transitional](./transitional.md)
- [wml-vml-legacy](./wml-vml-legacy.md)
