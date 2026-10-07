---
module: textMetaExtended
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textMetaExtended (P1)

> Opt-in extra : typed support for `text:meta`, `text:meta-field`,
> `text:rdf-metadata` and paragraph-level RDFa attributes
> (`xhtml:about`, `xhtml:property`, `xhtml:content`, `xhtml:datatype`).

**Module** `textMetaExtended` | **Source** `packages/front/office/odf/src/extra/text-meta-extended.js`

## Helpers

`parseMeta(el)` / `renderMeta(m)`, `pickRdfa(attrs)`.

## Hooks

`hydrateParagraph` promotes RDFa attrs into `p.rdfa` and text:meta-*
children into `p.metaNodes[]`. `dehydrateParagraph` reverses.
