---
module: odsWalker
category: odf/ods
dependencies: [odfWalker]
returns: object
worker-safe: true
status: complete
---

# odsWalker

> Extension hook walker for the `ods` orchestrator.

**Module** `odsWalker` | **Source** `packages/front/office/odf/src/ods/ods-walker.js`

Mirror of `odtWalker`, but the traversal visits the spreadsheet tree
(tables → rows → cells → embedded paragraphs / frames) instead of the
office:text body. Hooks : `hydrate*` / `dehydrate*` for `Paragraph`,
`Span`, `Table`, `Cell`, `Frame`, `Metadata`, `Settings`, `Styles`.
