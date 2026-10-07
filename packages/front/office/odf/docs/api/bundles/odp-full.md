---
module: odpFullBundle
category: odf/bundles
dependencies: [odpLargeBundle, animationsSmil, chartTyped, drawImageExtended, textTocIndex, textTrackedChanges, tableAdvanced, metaExtended, mathMathml, formsControls, scriptMacros, dsigSignatures, dr3d3d, drawMisc, styleMisc, textMisc, tableMisc, officeMisc, legacyStaroffice]
returns: module
worker-safe: true
status: complete
---

# @awacloud/odf/odp-full

> Complete `.odp` coverage bundle.

**Module** `odpFullBundle` | **Source** `packages/front/office/odf/src/bundles/odp-full.js`

Pure fw factory descriptor that extends `odpLargeBundle` with the
presentation-relevant P1/P2/P3 extras (animations-smil, chart-typed,
draw-image-extended, text-toc-index, text-tracked-changes,
table-advanced, meta-extended, math-mathml, forms-controls,
script-macros, dsig-signatures, dr3d-3d, draw-misc, style-misc,
text-misc, table-misc, office-misc, legacy-staroffice).

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '@awacloud/odf';

const runtime = new ModuleRuntime();
for (const m of [...fw_require, ...modules, ...extras, ...bundle]) {
    runtime.register(m);
}

const odp = runtime.resolve('odpFullBundle'); // fully-enriched odp
```

For a leaner registration (only the extras the `odp-full` bundle uses),
import each factory via its sub-path :

```js
import { odpLargeBundle } from '@awacloud/odf/bundles/odp-large';
import { odpFullBundle }  from '@awacloud/odf/bundles/odp-full';
// + extras via '@awacloud/odf/extra/<name>' (e.g. '@awacloud/odf/extra/animations-smil')
```

## Breaking change

The imperative `buildOdpFull(odpInstance, { xml })` helper and the named
re-export of `odp` from `@awacloud/odf/odp-full` have been removed. Consume
exclusively via `ModuleRuntime.resolve('odpFullBundle')`.
