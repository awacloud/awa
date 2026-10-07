---
module: wmlVmlLegacy
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# wmlVmlLegacy

> WML — VML legacy in WordprocessingML (`<w:pict>`, `<w:object>`, `<w:control>`, `<w:movie>`).

**Module** `wmlVmlLegacy` | **Source** `packages/front/office/ooxml/src/extra/wml-vml-legacy.js` | **Deps** `xml` | **Worker-safe** yes

Parses the four legacy run-level WML wrappers around VML drawings (`<w:pict>`, `<w:object>`, `<w:control>`, `<w:movie>`) — typical of older Word fixtures (Office 2003 and converted documents) — plus a typed projection of the dominant inner VML shapes (`v:shape`, `v:rect`, `v:oval`, `v:roundrect`, `v:line`, `v:group`, `v:polyline`, `v:shapetype`).

## Resolve

```js
const ext = wmlVmlLegacy.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseLegacy` / `renderLegacy` | `(el) => Legacy` / `(l) => xmlNode` | generic dispatcher for `<w:pict>`/`<w:object>`/`<w:control>`/`<w:movie>` — `{ kind, attrs, shapes: VmlShape[], vml: xmlNode[] }`; there is no separate `parsePict`/`parseObject`/`parseControl`/`parseMovie` |
| `parseVmlShape` / `renderVmlShape` | `(el) => VmlShape` / `(s) => xmlNode` | one recognised inner VML shape — `{ tag, ...pickedAttrs, _extraAttrs?, children }` |
| `TAGS` | `string[]` | `['pict', 'object', 'control', 'movie']` |
| `VML_SHAPE_TAGS` | `string[]` | the 8 recognised inner VML shape tags |
| `SHAPE_ATTRS` | `string[]` | the standard attribute set surfaced per shape (`id`, `type`, `style`, `fillcolor`, `strokecolor`, `coordsize`, `coordorigin`, `alt`, `href`, `title`, `filled`, `stroked`, `o:spid`, `o:connectortype`) — anything else lands in `_extraAttrs` |

## Elements typed

`w:pict`, `w:object`, `w:control`, `w:movie`, plus `v:shape`, `v:rect`, `v:oval`, `v:roundrect`, `v:line`, `v:group`, `v:polyline`, `v:shapetype` (other inner content, including `o:*`, is preserved raw in `vml`).

## Notes

- VML inner content is preserved as a raw XML node tree (no typed shape).
- Use this module only when round-tripping legacy docx files; new documents should emit DrawingML instead.

## See also

- [legacy-vml](./legacy-vml.md) — standalone VML mapper
- [transitional](./transitional.md) — ECMA-376 part 4 namespace switch
