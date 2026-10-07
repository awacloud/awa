---
module: wmlMisc
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# wmlMisc

> WML — long-tail sweeper for residual WordprocessingML elements not covered by the dedicated phase modules.

**Module** `wmlMisc` | **Source** `packages/front/office/ooxml/src/extra/wml-misc.js` | **Deps** `xml` | **Worker-safe** yes

A bulk parser/renderer that handles the remaining ECMA-376 strict elements of `wml.xsd` that the typed `wml-run-formatting`, `wml-paragraph-formatting`, `wml-table-properties`, `wml-numbering-details`, `wml-settings`, `wml-fields`, `wml-tracked-changes` and `wml-vml-legacy` modules do not cover. Each element gets a generic `{ kind, attrs, children }` shape so a roundtrip is loss-free.

## Resolve

```js
const ext = wmlMisc.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseElement` | `(el) => Generic` | `{ kind, attrs, children }` or `null` |
| `renderElement` | `(g) => xmlNode` | back to XML |
| `ELEMENTS` | `string[]` | the long-tail tag names handled here |

## Notes

- Handles the residual ~300 rarely-used WML elements (annotation references, frame sets, custom-XML markers, compatibility settings, glossary/style-pane settings, …). Document protection (`w:documentProtection`) is not among them.
- Used internally by [docx-full](../bundles/docx-full.md) so that every WordprocessingML element is either typed or preserved as a passthrough.

## See also

- [wml-run-formatting](./wml-run-formatting.md)
- [docx-full bundle](../bundles/docx-full.md)
