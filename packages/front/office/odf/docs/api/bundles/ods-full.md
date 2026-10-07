---
module: odsFullBundle
category: odf/bundles
dependencies: [odsLargeBundle, animationsSmil, chartTyped, drawImageExtended, numberFormatExtended, metaExtended, formsControls, scriptMacros, databaseSources, dsigSignatures, dr3d3d, tableMisc, drawMisc, styleMisc, textMisc, officeMisc, legacyStaroffice]
returns: module
worker-safe: true
status: complete
---

# @awacloud/odf/ods-full

> Complete `.ods` coverage bundle.

**Module** `odsFullBundle` | **Source** `packages/front/office/odf/src/bundles/ods-full.js`

Pure fw factory descriptor that extends `odsLargeBundle` with the
spreadsheet-relevant P1/P2/P3 extras (animations-smil, chart-typed,
draw-image-extended, number-format-extended, meta-extended,
forms-controls, script-macros, database-sources, dsig-signatures,
dr3d-3d, table-misc, draw-misc, style-misc, text-misc, office-misc,
legacy-staroffice).

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '@awacloud/odf';

const runtime = new ModuleRuntime();
for (const m of [...fw_require, ...modules, ...extras, ...bundle]) {
    runtime.register(m);
}

const ods = runtime.resolve('odsFullBundle'); // fully-enriched ods
```

For a leaner registration (only the extras the `ods-full` bundle uses),
import each factory via its sub-path :

```js
import { odsLargeBundle } from '@awacloud/odf/bundles/ods-large';
import { odsFullBundle }  from '@awacloud/odf/bundles/ods-full';
// + extras via '@awacloud/odf/extra/<name>' (e.g. '@awacloud/odf/extra/chart-typed')
```

## Breaking change

The imperative `buildOdsFull(odsInstance, { xml })` helper and the named
re-export of `ods` from `@awacloud/odf/ods-full` have been removed. Consume
exclusively via `ModuleRuntime.resolve('odsFullBundle')`.
