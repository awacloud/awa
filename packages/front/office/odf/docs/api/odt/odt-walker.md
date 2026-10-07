---
module: odtWalker
category: odf/odt
dependencies: [odfWalker]
returns: object
worker-safe: true
status: complete
---

# odtWalker

> Extension hook walker for the `odt` orchestrator.

**Module** `odtWalker` | **Source** `packages/front/office/odf/src/odt/odt-walker.js`

Implements the `.use(...)` registry and the `hydrate*` / `dehydrate*`
hook dispatcher. One walker instance is created per `odt.factory(...)`
invocation so registered extensions are scoped per consumer.

## API

`createWalker()` returns :

- `use(...exts)` — idempotent registration (skips already-registered)
- `applyHydrate(result)` — run after parsing
- `applyDehydrate(result)` — run before writing
- `hasExtensions` — `true` once any extension is registered

## Hooks

`hydrateParagraph` / `dehydrateParagraph`,
`hydrateSpan` / `dehydrateSpan`,
`hydrateHeading` / `dehydrateHeading`,
`hydrateList` / `dehydrateList`,
`hydrateTable` / `dehydrateTable`,
`hydrateCell` / `dehydrateCell`,
`hydrateFrame` / `dehydrateFrame`,
`hydrateMetadata` / `dehydrateMetadata`,
`hydrateSettings` / `dehydrateSettings`,
`hydrateStyles` / `dehydrateStyles`.

Each extension may implement any subset.
