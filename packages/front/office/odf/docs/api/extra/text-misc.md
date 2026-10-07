---
module: textMisc
category: odf/extra
dependencies: [xml, odfMiscHelper]
returns: object
worker-safe: true
status: complete
---

# textMisc (P3 — misc)

> Opt-in catch-all : passthrough typed coverage for any residual
> `text:*` element not handled by a dedicated extra. Each element is
> preserved as `{ kind, attrs, children, _passthrough: true }`.

**Module** `textMisc` | **Source** `packages/front/office/odf/src/extra/text-misc.js`

## Hooks

`hydrateParagraph(p)` / `dehydrateParagraph(p)` — promotes recognised
`text:*` children of paragraphs into `p.text[]`.
