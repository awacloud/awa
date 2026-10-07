---
module: pmlMisc
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# pmlMisc

> PML — long-tail sweeper for residual PresentationML elements.

**Module** `pmlMisc` | **Source** `packages/front/office/ooxml/src/extra/pml-misc.js` | **Deps** `xml` | **Worker-safe** yes

Bulk parser/renderer for `pml.xsd` elements outside the typed `pml-animations`, `pml-transitions`, `pml-notes` and `pml-layouts-typed` modules (custom shows, photo album, comment authors, kinsoku, embedded fonts, …).

## Resolve

```js
const ext = pmlMisc.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseElement` / `renderElement` | — | generic dispatcher |
| `ELEMENTS` | `string[]` | long-tail PML tag names |

## Notes

- Custom shows reference slides by id — preserved as raw lists.
- Loaded only via [pptx-full](../bundles/pptx-full.md).

## See also

- [pml-animations](./pml-animations.md)
- [pptx-full bundle](../bundles/pptx-full.md)
