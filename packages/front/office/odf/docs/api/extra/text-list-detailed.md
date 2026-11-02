---
module: textListDetailed
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textListDetailed (P0)

> Opt-in extra : typed support for ODF list-style / outline-style /
> list-header.

**Module** `textListDetailed` | **Source** `packages/front/office/odf/src/extra/text-list-detailed.js`

## Elements covered

`text:list-style`, `text:list-level-style-number`,
`text:list-level-style-bullet`, `text:list-level-style-image`,
`text:outline-style`, `text:outline-level-style`, `text:list-header`.

## Hooks

`hydrateStyles` / `dehydrateStyles` (promotes list / outline styles
from the styles bag into `styles.listStyles`, and puts each back on
write into the container it came from, after the elements left there:
`styles` by default; a style met in another container records it in an
optional `container` field — `automaticStyles`, `masterStyles`, or
`_extras` for an array carrier; the root's other children are left as
read), and
`hydrateList` / `dehydrateList` (promotes `text:list-header` children
from a list `_extras` — an array carrier, or the `children` of the usual
`_extras` object, which they leave — into `list.headers`, and puts them
back on write).
