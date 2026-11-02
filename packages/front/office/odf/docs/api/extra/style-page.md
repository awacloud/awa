---
module: stylePage
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# stylePage (P0)

> Opt-in extra : typed support for page layouts and master pages.

**Module** `stylePage` | **Source** `packages/front/office/odf/src/extra/style-page.js`

## Elements covered

`style:page-layout`, `style:page-layout-properties`,
`style:header-style`, `style:footer-style`,
`style:master-page`, `style:header`, `style:footer`,
`style:header-left`, `style:footer-left`,
`style:header-first`, `style:footer-first`,
`style:background-image`, `style:column`, `style:columns`,
`style:column-sep`, `style:footnote-sep`,
`style:layout-grid-properties`.

## Hooks

`hydrateStyles` / `dehydrateStyles` — partitions `style:page-layout`
and `style:master-page` from the styles bag into `styles.pageLayouts`
and `styles.masterPages`, and puts each back on write: a page layout
into `automaticStyles`, a master page into `masterStyles`, after the
elements left there. A bag met in another container records it in an
optional `container` field (`styles`, `automaticStyles`,
`masterStyles`, or `_extras` for an array carrier) and goes back there;
the root's other children (`_extras`, the font-face declarations) are
left as read. A bag's `children` hold the typed bags of its elements and,
at their place, its other children as read (text, CDATA, comments: the
words of a header or footer).
