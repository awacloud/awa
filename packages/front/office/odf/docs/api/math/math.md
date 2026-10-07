---
module: mathMath
category: odf/math
dependencies: [odfErrors, odfShared, xml]
returns: object
worker-safe: true
status: complete
---

# mathMath

> Pass-through for embedded MathML (`<math:math>` root).

**Module** `mathMath` | **Source** `packages/front/office/odf/src/math/math.js` | **Deps** `odfErrors, odfShared, xml` | **Worker-safe** yes

ODF formulas live in their own sub-document. The entire MathML
fragment is kept as opaque XML and written back, so it is preserved
on a round-trip. Operators, fractions and sub/sup are not typed; the
`mathMathml` extra adds typed entry points and manifest-entry helpers
but keeps the MathML body raw.

Model: `{ type: 'math', xml: <element-node> }`.

## Resolve

```js
const math = runtime.resolve('mathMath');
// → { parseMath, renderMath, parseBytes, bytesOf }
```

## API

| Method | Description |
|--------|-------------|
| `parseMath(el)` | Stores the `<math:math>` fragment as-is. |
| `renderMath(m)` | Returns the stored fragment verbatim (or an empty `<math:math/>` if absent). |
| `parseBytes(bytes)` | Parses a math `content.xml` byte payload (`Uint8Array` or `string`) into the model. |
| `bytesOf(m)` | Serializes the model back to a math `content.xml` byte payload. The written root declares every namespace prefix it uses — its own declarations first, then `odfShared.ODF_PREFIXES` (so the empty `<math:math/>` fallback gets `xmlns:math`); the model's element is not modified. A prefix nobody declares throws `RenderError('odf/render-error/namespace')`. |

## Examples

```js
const math = runtime.resolve('mathMath');
const el = xml.parse('<math:math><math:mrow><math:mn>1</math:mn></math:mrow></math:math>');
const m = math.parseMath(el);
const bytes = math.bytesOf(m);
math.parseBytes(bytes);
```

## Notes

- `parseBytes` falls back to a deep search (`findDeep`) for `math:math` when it isn't the document root, and to an empty `<math:math/>` model if none is found.
- `bytesOf` prepends the standalone XML declaration (`XML_DECL_STANDALONE`) before serializing.

## See also

- [extra/math-mathml](../extra/math-mathml.md)
- [errors](../errors.md)
