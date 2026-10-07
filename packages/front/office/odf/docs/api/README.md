# API reference — `@awacloud/odf` (L4)

One page per module. Each page begins with YAML frontmatter
(module / category / dependencies / returns / worker-safe / status).

## Core

| Module | Page |
|--------|------|
| `xml` (consumed from `@awacloud/fw/io/codec/xml.js`) | — |
| `odfErrors` | [errors.md](./errors.md) |
| `odfMeta` | [meta.md](./meta.md) |
| `odfSettings` | [settings.md](./settings.md) |

## Shared

| Module | Page |
|--------|------|
| `odfShared` | [_shared/README.md](./_shared/README.md) |
| `odfWalker` | [_shared/README.md](./_shared/README.md) |

## Pkg

| Module | Page |
|--------|------|
| `pkgMimetype` | [pkg/mimetype.md](./pkg/mimetype.md) |
| `pkgManifest` | [pkg/manifest.md](./pkg/manifest.md) |
| `pkgPackage` | [pkg/package.md](./pkg/package.md) |

## Style

| Module | Page |
|--------|------|
| `odfStyles` | [style/styles.md](./style/styles.md) |
| `styleAutomatic` | [style/automaticStyles.md](./style/automaticStyles.md) |
| `stylePageLayout` | [style/pageLayout.md](./style/pageLayout.md) |
| `styleMasterPage` | [style/masterPage.md](./style/masterPage.md) |

## Text

| Module | Page |
|--------|------|
| `textParagraph` | [text/paragraph.md](./text/paragraph.md) |
| `textHeading` | [text/heading.md](./text/heading.md) |
| `textList` | [text/list.md](./text/list.md) |
| `textSection` | [text/section.md](./text/section.md) |
| `textBookmarks` | [text/bookmarks.md](./text/bookmarks.md) |
| `textFields` | [text/fields.md](./text/fields.md) |
| `textTracked` | [text/tracked.md](./text/tracked.md) |
| `textContent` | [text/content.md](./text/content.md) |
| `textStyleRegistry` | [text/style-registry.md](./text/style-registry.md) |

## Table

| Module | Page |
|--------|------|
| `tableCell` | [table/cell.md](./table/cell.md) |
| `tableRow` | [table/row.md](./table/row.md) |
| `tableTable` | [table/table.md](./table/table.md) |

## Draw

| Module | Page |
|--------|------|
| `drawImage` | [draw/image.md](./draw/image.md) |
| `drawFrame` | [draw/frame.md](./draw/frame.md) |
| `drawShape` | [draw/shape.md](./draw/shape.md) |

## Number

| Module | Page |
|--------|------|
| `numberFormats` | [number/numberFormats.md](./number/numberFormats.md) |

## ODS

| Module | Page |
|--------|------|
| `spreadsheet` | [ods/spreadsheet.md](./ods/spreadsheet.md) |
| `ods` | [ods/ods.md](./ods/ods.md) |

## ODP

| Module | Page |
|--------|------|
| `presentationStyle` | [odp/presentationStyle.md](./odp/presentationStyle.md) |
| `odpAnimations` | [odp/animations.md](./odp/animations.md) |
| `slide` | [odp/slide.md](./odp/slide.md) |
| `odp` | [odp/odp.md](./odp/odp.md) |

## Chart

| Module | Page |
|--------|------|
| `chartChart` | [chart/chart.md](./chart/chart.md) |

## Math

| Module | Page |
|--------|------|
| `mathMath` | [math/math.md](./math/math.md) |

## Form

| Module | Page |
|--------|------|
| `formForms` | [form/forms.md](./form/forms.md) |

## 3D

| Module | Page |
|--------|------|
| `dr3dScene` | [dr3d/dr3d.md](./dr3d/dr3d.md) |

## Markup compatibility

| Module | Page |
|--------|------|
| `odfMc` | [mc/markupCompatibility.md](./mc/markupCompatibility.md) |

## Orchestrator

| Module | Page |
|--------|------|
| `odt` | [odt/odt.md](./odt/odt.md) |
| `odtWalker` | [odt/odt-walker.md](./odt/odt-walker.md) |
| `odsWalker` | [ods/ods-walker.md](./ods/ods-walker.md) |
| `odpWalker` | [odp/odp-walker.md](./odp/odp-walker.md) |

## Extras (opt-in)

### P0 — Batch A (deep typing — core)

| Module | Page |
|--------|------|
| `textTrackedChanges` | [extra/text-tracked-changes.md](./extra/text-tracked-changes.md) |
| `textFieldsExtended` | [extra/text-fields-extended.md](./extra/text-fields-extended.md) |
| `textListDetailed` | [extra/text-list-detailed.md](./extra/text-list-detailed.md) |
| `tableAdvanced` | [extra/table-advanced.md](./extra/table-advanced.md) |
| `stylePage` | [extra/style-page.md](./extra/style-page.md) |
| `stylePropertiesTyped` | [extra/style-properties-typed.md](./extra/style-properties-typed.md) |
| `drawShapes` | [extra/draw-shapes.md](./extra/draw-shapes.md) |
| `presentationTyped` | [extra/presentation-typed.md](./extra/presentation-typed.md) |

### P1 — Batch B (deep typing — complementary)

| Module | Page |
|--------|------|
| `textMetaExtended` | [extra/text-meta-extended.md](./extra/text-meta-extended.md) |
| `textSectionsAdvanced` | [extra/text-sections-advanced.md](./extra/text-sections-advanced.md) |
| `textTocIndex` | [extra/text-toc-index.md](./extra/text-toc-index.md) |
| `drawImageExtended` | [extra/draw-image-extended.md](./extra/draw-image-extended.md) |
| `chartTyped` | [extra/chart-typed.md](./extra/chart-typed.md) |
| `animationsSmil` | [extra/animations-smil.md](./extra/animations-smil.md) |
| `formsControls` | [extra/forms-controls.md](./extra/forms-controls.md) |
| `numberFormatExtended` | [extra/number-format-extended.md](./extra/number-format-extended.md) |
| `metaExtended` | [extra/meta-extended.md](./extra/meta-extended.md) |
| `mathMathml` | [extra/math-mathml.md](./extra/math-mathml.md) |

### P2 — Batch B (secondary domains)

| Module | Page |
|--------|------|
| `dr3d3d` | [extra/dr3d-3d.md](./extra/dr3d-3d.md) |
| `databaseSources` | [extra/database-sources.md](./extra/database-sources.md) |
| `settingsExtended` | [extra/settings-extended.md](./extra/settings-extended.md) |
| `scriptMacros` | [extra/script-macros.md](./extra/script-macros.md) |
| `dsigSignatures` | [extra/dsig-signatures.md](./extra/dsig-signatures.md) |

### P3 — Batch B (`*-misc` passthrough)

| Module | Page |
|--------|------|
| `textMisc` | [extra/text-misc.md](./extra/text-misc.md) |
| `styleMisc` | [extra/style-misc.md](./extra/style-misc.md) |
| `drawMisc` | [extra/draw-misc.md](./extra/draw-misc.md) |
| `tableMisc` | [extra/table-misc.md](./extra/table-misc.md) |
| `officeMisc` | [extra/office-misc.md](./extra/office-misc.md) |
| `legacyStaroffice` | [extra/legacy-staroffice.md](./extra/legacy-staroffice.md) |

## Bundles

Descriptors resolved via `runtime.resolve('<name>')` — see each page
for the list of extras to register beforehand.

| Module | Page |
|--------|------|
| `odtLargeBundle` | [bundles/odt-large.md](./bundles/odt-large.md) |
| `odtFullBundle`  | [bundles/odt-full.md](./bundles/odt-full.md) |
| `odsLargeBundle` | [bundles/ods-large.md](./bundles/ods-large.md) |
| `odsFullBundle`  | [bundles/ods-full.md](./bundles/ods-full.md) |
| `odpLargeBundle` | [bundles/odp-large.md](./bundles/odp-large.md) |
| `odpFullBundle`  | [bundles/odp-full.md](./bundles/odp-full.md) |
