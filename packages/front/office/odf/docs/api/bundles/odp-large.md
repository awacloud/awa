---
module: odpLargeBundle
category: odf/bundles
dependencies: [odp, presentationTyped, drawShapes, stylePage, stylePropertiesTyped, textFieldsExtended, textListDetailed]
returns: module
worker-safe: true
status: complete
---

# @awacloud/odf/odp-large

> Extended `.odp` coverage bundle (P0).

**Module** `odpLargeBundle` | **Source** `packages/front/office/odf/src/bundles/odp-large.js`

Pure fw factory descriptor. Returns the core `odp` orchestrator enriched
with the six P0 extras most relevant to presentations :
`presentationTyped`, `drawShapes`, `stylePage`, `stylePropertiesTyped`,
`textFieldsExtended`, `textListDetailed`.

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '@awacloud/odf';

const runtime = new ModuleRuntime();
for (const m of [...fw_require, ...modules, ...extras, ...bundle]) {
    runtime.register(m);
}

const odp = runtime.resolve('odpLargeBundle'); // enriched odp instance
```

Or, to register only the P0 extras the `odp-large` bundle actually needs,
import each extra factory via its sub-path :

```js
import { presentationTyped }  from '@awacloud/odf/extra/presentation-typed';
import { drawShapes }         from '@awacloud/odf/extra/draw-shapes';
import { stylePage }          from '@awacloud/odf/extra/style-page';
import { stylePropertiesTyped } from '@awacloud/odf/extra/style-properties-typed';
import { textFieldsExtended } from '@awacloud/odf/extra/text-fields-extended';
import { textListDetailed }   from '@awacloud/odf/extra/text-list-detailed';
import { odpLargeBundle }     from '@awacloud/odf/bundles/odp-large';
```

## Breaking change

The imperative `buildOdpLarge(odpInstance, { xml })` helper and the
named re-export of `odp` from `@awacloud/odf/odp-large` have been removed.
Consume exclusively via `ModuleRuntime.resolve('odpLargeBundle')`.
