---
module: presentationTyped
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# presentationTyped (P0)

> Opt-in extra : typed support for the `presentation:*` slide
> vocabulary.

**Module** `presentationTyped` | **Source** `packages/front/office/odf/src/extra/presentation-typed.js`

## Elements covered

`presentation:placeholder`, `presentation:notes`,
`presentation:settings`, `presentation:show`,
`presentation:show-shape`, `presentation:show-text`,
`presentation:hide-shape`, `presentation:hide-text`,
`presentation:dim`, `presentation:play`,
`presentation:event-listener(s)?`, `presentation:sound`,
`presentation:date-time(-decl)?`, `presentation:footer(-decl)?`,
`presentation:header(-decl)?`, `presentation:animations`,
`presentation:transition`.

## Hooks

`hydrateSlide` / `dehydrateSlide` — promotes/demotes recognised
nodes between `slide._extras` and `slide.presentation[]`.
