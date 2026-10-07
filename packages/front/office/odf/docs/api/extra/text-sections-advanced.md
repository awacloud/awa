---
module: textSectionsAdvanced
category: odf/extra
dependencies: [xml, odfTypedHelper]
returns: object
worker-safe: true
status: complete
---

# textSectionsAdvanced (P1)

> Opt-in extra : extended `<text:section>` features —
> `text:section-source`, `text:section-decl`, `text:dde-connection`
> inside a section, plus `text:protected` / `text:condition` /
> `text:display` / `text:protection-key` attributes.

**Module** `textSectionsAdvanced` | **Source** `packages/front/office/odf/src/extra/text-sections-advanced.js`

## Hooks

`hydrateSection(s)` / `dehydrateSection(s)` — promotes protection
attrs into `s.protection` and section-aux children into
`s.sectionNodes[]`.
