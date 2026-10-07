---
module: scriptMacros
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# scriptMacros (P2)

> Opt-in extra : typed parse/render of `<office:scripts>` /
> `<office:script>` and the `script:event-listener` +
> `office:event-listeners` / `office:event-listener` family.

**Module** `scriptMacros` | **Source** `packages/front/office/odf/src/extra/script-macros.js`

## Helpers

`parseScript(el)` / `renderScript(obj)`, `hydrateMetadata(m)` /
`dehydrateMetadata(m)`.
