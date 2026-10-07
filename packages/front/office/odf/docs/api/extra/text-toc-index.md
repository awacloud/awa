---
module: textTocIndex
category: odf/extra
dependencies: [xml, odfTypedHelper]
returns: object
worker-safe: true
status: complete
---

# textTocIndex (P1)

> Opt-in extra : typed parse/render of every ODF index family —
> `text:table-of-content`, `text:alphabetical-index`, `text:user-index`,
> `text:object-index`, `text:illustration-index`, `text:table-index`,
> `text:bibliography` and all their `*-source` / `*-entry-template` /
> `index-title-template` / `index-body` children.

**Module** `textTocIndex` | **Source** `packages/front/office/odf/src/extra/text-toc-index.js`

## Helpers

`parseIndex(el)` / `renderIndex(obj)`, `hydrateBody(body)` /
`dehydrateBody(body)`.
