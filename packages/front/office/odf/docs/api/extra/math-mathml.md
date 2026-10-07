---
module: mathMathml
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# mathMathml (P1)

> Opt-in extra : typed entry points + manifest wiring helpers for
> embedded MathML (`<math:math>`). The actual MathML element tree is
> kept as raw XML (W3C namespace, ~100 elements) — no deep typing.

**Module** `mathMathml` | **Source** `packages/front/office/odf/src/extra/math-mathml.js`

## Helpers

`parseMath(el)` / `renderMath(obj)`, `manifestEntries({ path })`.
