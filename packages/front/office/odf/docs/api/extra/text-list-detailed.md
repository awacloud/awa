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
from the styles bag into `styles.listStyles`), and
`hydrateList` / `dehydrateList` (promotes `text:list-header` children
from a list `_extras` into `list.headers`).
