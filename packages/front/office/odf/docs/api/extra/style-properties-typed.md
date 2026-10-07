---
module: stylePropertiesTyped
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# stylePropertiesTyped (P0)

> Opt-in extra : typed attribute bags on every `style:*-properties`
> element.

**Module** `stylePropertiesTyped` | **Source** `packages/front/office/odf/src/extra/style-properties-typed.js`

## Elements covered

`style:paragraph-properties`, `style:text-properties`,
`style:graphic-properties`, `style:section-properties`,
`style:ruby-properties`, `style:table-properties`,
`style:table-column-properties`, `style:table-row-properties`,
`style:table-cell-properties`, `style:chart-properties`,
`style:drawing-page-properties`, `style:list-level-properties`,
`style:list-level-label-alignment`, `style:tab-stops`,
`style:tab-stop`.

A curated subset of attributes (fo:font-family, fo:font-size,
fo:color, fo:text-align, fo:margin-*, fo:padding, fo:line-height,
fo:break-before/after, svg:width/height, style:column-width,
style:row-height …) is promoted into typed fields. Unknown attrs are
preserved verbatim through an `attrs` bag.

## Hooks

`hydrateStyles` / `dehydrateStyles`.
