---
module: mathMisc
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# mathMisc

> OMML — long-tail sweeper for `shared-math.xsd` elements not handled by `math-advanced`.

**Module** `mathMisc` | **Source** `packages/front/office/ooxml/src/extra/math-misc.js` | **Deps** `xml` | **Worker-safe** yes

Bulk parser/renderer for the rare OMML constructs (control points, alignment runs, defaults overrides) that complete the typed-or-preserved coverage of the math schema.

## Resolve

```js
const ext = mathMisc.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseElement` / `renderElement` | — | dispatcher |
| `ELEMENTS` | `string[]` | the residual OMML tags |

## Notes

- Loaded by [docx-full](../bundles/docx-full.md) and [pptx-full](../bundles/pptx-full.md).
- Most documents will never invoke any of these tags.

## See also

- [math-advanced](./math-advanced.md)
