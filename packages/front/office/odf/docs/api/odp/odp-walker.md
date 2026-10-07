---
module: odpWalker
category: odf/odp
dependencies: [odfWalker]
returns: object
worker-safe: true
status: complete
---

# odpWalker

> Extension hook walker for the `odp` orchestrator.

**Module** `odpWalker` | **Source** `packages/front/office/odf/src/odp/odp-walker.js`

Mirror of `odtWalker`. Traversal visits slides → frames → embedded
paragraphs / spans. Hooks : `hydrate*` / `dehydrate*` for `Slide`,
`Paragraph`, `Span`, `Frame`, `Metadata`, `Settings`, `Styles`.
