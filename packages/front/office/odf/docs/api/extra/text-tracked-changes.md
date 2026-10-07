---
module: textTrackedChanges
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# textTrackedChanges (P0)

> Opt-in extra : typed support for ODF tracked-changes containers and
> inline change markers.

**Module** `textTrackedChanges` | **Source** `packages/front/office/odf/src/extra/text-tracked-changes.js`

## Elements covered

`text:tracked-changes`, `text:changed-region`, `text:insertion`,
`text:deletion`, `text:format-change`, `text:change`,
`text:change-start`, `text:change-end`, `text:change-info`.

## Hooks

`hydrateParagraph` / `dehydrateParagraph` (promotes inline change
markers into a `changeMarkers: [...]` array on the paragraph model).
The `hydrateMetadata` hook is exposed as a no-op for completeness.

## Helpers

`parseTrackedChanges(el)` / `renderTrackedChanges(tc)`,
`parseChangeMarker(el)` / `renderChangeMarker(m)`,
`parseChangeInfo(el)` / `renderChangeInfo(info)`.
