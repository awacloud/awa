---
module: odtFullBundle
category: odf/bundles
dependencies: [odtLargeBundle, textMetaExtended, textSectionsAdvanced, textTocIndex, drawImageExtended, metaExtended, mathMathml, dr3d3d, formsControls, scriptMacros, dsigSignatures, settingsExtended, textMisc, styleMisc, drawMisc, tableMisc, officeMisc, legacyStaroffice]
returns: module
worker-safe: true
status: complete
---

# @awacloud/odf/odt-full

> Complete `.odt` coverage bundle.

**Module** `odtFullBundle` | **Source** `packages/front/office/odf/src/bundles/odt-full.js`

Pure fw factory descriptor that extends `odtLargeBundle` with every
remaining opt-in extra touching text documents : P1 (text-meta-extended,
text-sections-advanced, text-toc-index, draw-image-extended,
meta-extended, math-mathml), P2 (dr3d-3d, forms-controls, script-macros,
dsig-signatures, settings-extended) and P3 misc sweepers plus legacy
StarOffice passthrough.

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '@awacloud/odf';

const runtime = new ModuleRuntime();
for (const m of [...fw_require, ...modules, ...extras, ...bundle]) {
    runtime.register(m);
}

const odt = runtime.resolve('odtFullBundle'); // fully-enriched odt
```

For a leaner registration (only the extras the `odt-full` bundle uses),
import each factory via its sub-path :

```js
import { odtLargeBundle } from '@awacloud/odf/bundles/odt-large';
import { odtFullBundle }  from '@awacloud/odf/bundles/odt-full';
// + extras via '@awacloud/odf/extra/<name>' (e.g. '@awacloud/odf/extra/text-meta-extended')
```

Idempotent : the descriptor depends on `odtLargeBundle` and layers the
P1/P2/P3 extras on top via `.use(...)` ; the underlying walker dedupes
extension registrations.

## Breaking change

The imperative `buildOdtFull(odtInstance, { xml })` helper and the named
re-export of `odt` from `@awacloud/odf/odt-full` have been removed. Consume
exclusively via `ModuleRuntime.resolve('odtFullBundle')`.
