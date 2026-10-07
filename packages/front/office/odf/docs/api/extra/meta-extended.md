---
module: metaExtended
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# metaExtended (P1)

> Opt-in extra : extended typing for `<office:meta>` — covers the full
> `meta:*` set (generator, initial-creator, creation-date, printed-by,
> print-date, template, auto-reload, hyperlink-behaviour,
> document-statistic, user-defined, keyword, editing-cycles,
> editing-duration) plus the standard `dc:*` set (title, creator,
> date, description, subject, language, rights).

**Module** `metaExtended` | **Source** `packages/front/office/odf/src/extra/meta-extended.js`

## Helpers

`parseMetaBody(el)` / `renderMetaBody(m)`.
