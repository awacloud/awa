# API — `extra/` (opt-in modules)

Opt-in modules implementing the [coverage guide](../../guide/coverage.md). Each one wraps the core OOXML parsers with extra typed fields without modifying core. Loaded individually or via a [bundle](../bundles/README.md).

See the [getting-started guide](../../guide/getting-started.md) for the `.use()` pattern.

**Naming rule.** Sub-path imports use the kebab-case FILE name (`@awacloud/ooxml/extra/wml-run-formatting`); the module's export, its `ModuleRuntime` resolve key and the names in the tables below use the camelCase EXPORT name (`wmlRunFormatting`):

```js
import { wmlRunFormatting } from '@awacloud/ooxml/extra/wml-run-formatting';
// runtime.resolve('wmlRunFormatting')
```

## WordprocessingML extras

| Module | Phase | Source | Role |
|--------|------|--------|------|
| [`wmlRunFormatting`](./wml-run-formatting.md) | 1 | [`src/extra/wml-run-formatting.js`](../../../src/extra/wml-run-formatting.js) | Typed `<w:rPr>` (caps, kern, lang, shd, …) |
| [`wmlParagraphFormatting`](./wml-paragraph-formatting.md) | 2 | [`src/extra/wml-paragraph-formatting.js`](../../../src/extra/wml-paragraph-formatting.js) | Typed `<w:pPr>` (tabs, framePr, kinsoku, …) |
| [`wmlTableProperties`](./wml-table-properties.md) | 3 | [`src/extra/wml-table-properties.js`](../../../src/extra/wml-table-properties.js) | Typed tblPr / trPr / tcPr |
| [`wmlNumberingDetails`](./wml-numbering-details.md) | 4 | [`src/extra/wml-numbering-details.js`](../../../src/extra/wml-numbering-details.js) | numbering.xml advanced |
| [`wmlSettings`](./wml-settings.md) | 5 | [`src/extra/wml-settings.js`](../../../src/extra/wml-settings.js) | settings.xml advanced |
| [`wmlFields`](./wml-fields.md) | 6 | [`src/extra/wml-fields.js`](../../../src/extra/wml-fields.js) | Field instruction tokenizer |
| [`wmlTrackedChanges`](./wml-tracked-changes.md) | 7 | [`src/extra/wml-tracked-changes.js`](../../../src/extra/wml-tracked-changes.js) | moveFrom / rPrChange / cellIns / … |
| [`wmlVmlLegacy`](./wml-vml-legacy.md) | 8 | [`src/extra/wml-vml-legacy.js`](../../../src/extra/wml-vml-legacy.js) | `<w:pict>` / `<w:object>` / `<w:control>` |
| [`wmlMisc`](./wml-misc.md) | misc | [`src/extra/wml-misc.js`](../../../src/extra/wml-misc.js) | Long-tail sweeper |

## SpreadsheetML extras

| Module | Phase | Source | Role |
|--------|------|--------|------|
| [`smlPivotTables`](./sml-pivot-tables.md) | 9 | [`src/extra/sml-pivot-tables.js`](../../../src/extra/sml-pivot-tables.js) | pivot tables + cache |
| [`smlCalculation`](./sml-calculation.md) | 10 | [`src/extra/sml-calculation.js`](../../../src/extra/sml-calculation.js) | calcChain.xml + calcPr |
| [`smlSheetConfig`](./sml-sheet-config.md) | 11 | [`src/extra/sml-sheet-config.js`](../../../src/extra/sml-sheet-config.js) | per-sheet config |
| [`smlWorkbookConfig`](./sml-workbook-config.md) | 12 | [`src/extra/sml-workbook-config.js`](../../../src/extra/sml-workbook-config.js) | workbook-level config |
| [`smlFormControls`](./sml-form-controls.md) | 13 | [`src/extra/sml-form-controls.js`](../../../src/extra/sml-form-controls.js) | ActiveX form controls |
| [`smlMisc`](./sml-misc.md) | misc | [`src/extra/sml-misc.js`](../../../src/extra/sml-misc.js) | Long-tail sweeper |

## PresentationML extras

| Module | Phase | Source | Role |
|--------|------|--------|------|
| [`pmlAnimations`](./pml-animations.md) | 14 | [`src/extra/pml-animations.js`](../../../src/extra/pml-animations.js) | Slide timing graph |
| [`pmlTransitions`](./pml-transitions.md) | 15 | [`src/extra/pml-transitions.js`](../../../src/extra/pml-transitions.js) | Slide transitions |
| [`pmlNotes`](./pml-notes.md) | 16 | [`src/extra/pml-notes.js`](../../../src/extra/pml-notes.js) | Notes / handout master |
| [`pmlLayoutsTyped`](./pml-layouts-typed.md) | 17 | [`src/extra/pml-layouts-typed.js`](../../../src/extra/pml-layouts-typed.js) | Typed layout descriptors |
| [`pmlMisc`](./pml-misc.md) | misc | [`src/extra/pml-misc.js`](../../../src/extra/pml-misc.js) | Long-tail sweeper |

## DrawingML chart extras

| Module | Phase | Source | Role |
|--------|------|--------|------|
| [`dmlChartDataLabels`](./dml-chart-data-labels.md) | 18 | [`src/extra/dml-chart-data-labels.js`](../../../src/extra/dml-chart-data-labels.js) | dLbls / dLbl |
| [`dmlChartTrendlines`](./dml-chart-trendlines.md) | 19 | [`src/extra/dml-chart-trendlines.js`](../../../src/extra/dml-chart-trendlines.js) | Trendlines / errBars |
| [`dmlChartAxesAdvanced`](./dml-chart-axes-advanced.md) | 20 | [`src/extra/dml-chart-axes-advanced.js`](../../../src/extra/dml-chart-axes-advanced.js) | Full axis config |
| [`dmlChart3d`](./dml-chart-3d.md) | 21 | [`src/extra/dml-chart-3d.js`](../../../src/extra/dml-chart-3d.js) | 3D scenes |
| [`dmlChartOtherTypes`](./dml-chart-other-types.md) | 22 | [`src/extra/dml-chart-other-types.js`](../../../src/extra/dml-chart-other-types.js) | bubble / radar / stock / ofPie |
| [`dmlChartMisc`](./dml-chart-misc.md) | misc | [`src/extra/dml-chart-misc.js`](../../../src/extra/dml-chart-misc.js) | Long-tail chart sweeper |

## DrawingML shared / shapes / wp / xdr

| Module | Phase | Source | Role |
|--------|------|--------|------|
| [`dmlEffects`](./dml-effects.md) | 24 | [`src/extra/dml-effects.js`](../../../src/extra/dml-effects.js) | effectLst / effectDag / 3D scene |
| [`dmlFillsAdvanced`](./dml-fills-advanced.md) | 25 | [`src/extra/dml-fills-advanced.js`](../../../src/extra/dml-fills-advanced.js) | gradFill / blipFill / pattFill |
| [`dmlShapesAdvanced`](./dml-shapes-advanced.md) | 26 | [`src/extra/dml-shapes-advanced.js`](../../../src/extra/dml-shapes-advanced.js) | Custom geometry |
| [`dmlWpPositioning`](./dml-wp-positioning.md) | 27 | [`src/extra/dml-wp-positioning.js`](../../../src/extra/dml-wp-positioning.js) | wp:anchor + wrap |
| [`dmlXdrAdvanced`](./dml-xdr-advanced.md) | 28 | [`src/extra/dml-xdr-advanced.js`](../../../src/extra/dml-xdr-advanced.js) | Connectors + groups |
| [`dmlMainMisc`](./dml-main-misc.md) | misc | [`src/extra/dml-main-misc.js`](../../../src/extra/dml-main-misc.js) | Long-tail dml sweeper |

## Math extras

| Module | Phase | Source | Role |
|--------|------|--------|------|
| [`mathAdvanced`](./math-advanced.md) | 23 | [`src/extra/math-advanced.js`](../../../src/extra/math-advanced.js) | eqArr / groupChr / mathPr / phant |
| [`mathMisc`](./math-misc.md) | misc | [`src/extra/math-misc.js`](../../../src/extra/math-misc.js) | Long-tail OMML |

## Cross-cutting

| Module | Phase | Source | Role |
|--------|------|--------|------|
| [`transitional`](./transitional.md) | 29 | [`src/extra/transitional.js`](../../../src/extra/transitional.js) | Part 4 namespace mapping |
| [`legacyVml`](./legacy-vml.md) | 30 | [`src/extra/legacy-vml.js`](../../../src/extra/legacy-vml.js) | Standalone VML mapper |

## Common pattern

```js
import { xml as xmlMod } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '@awacloud/ooxml';
import { docx } from '@awacloud/ooxml/docx';
import { wmlRunFormatting } from '@awacloud/ooxml/extra/wml-run-formatting';

const xml   = xmlMod.factory();
const props = docxProperties.factory(xml);
const word  = docx.factory(/* … */);
word.use(wmlRunFormatting.factory(xml, props));
// → docx.read(...) now exposes typed run-properties.
```

## See also

- [Bundles](../bundles/README.md) — pre-wired collections
- [Coverage guide](../../guide/coverage.md)
- [Extending guide](../../guide/extending.md)
