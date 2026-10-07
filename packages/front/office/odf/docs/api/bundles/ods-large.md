---
module: odsLargeBundle
category: odf/bundles
dependencies: [ods, tableAdvanced, stylePage, stylePropertiesTyped, drawShapes, textFieldsExtended, textListDetailed]
returns: module
worker-safe: true
status: complete
---

# @awacloud/odf/ods-large

> Extended `.ods` coverage bundle (P0).

**Module** `odsLargeBundle` | **Source** `packages/front/office/odf/src/bundles/ods-large.js`

Pure fw factory descriptor. Returns the core `ods` orchestrator enriched
with the six P0 extras most relevant to spreadsheets : `tableAdvanced`,
`stylePage`, `stylePropertiesTyped`, `drawShapes`, `textFieldsExtended`,
`textListDetailed`.

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '@awacloud/odf';

const runtime = new ModuleRuntime();
for (const m of [...fw_require, ...modules, ...extras, ...bundle]) {
    runtime.register(m);
}

const ods = runtime.resolve('odsLargeBundle'); // enriched ods instance
```

Or, to register only the P0 extras the `ods-large` bundle actually needs,
import each extra factory via its sub-path :

```js
import { tableAdvanced }      from '@awacloud/odf/extra/table-advanced';
import { stylePage }          from '@awacloud/odf/extra/style-page';
import { stylePropertiesTyped } from '@awacloud/odf/extra/style-properties-typed';
import { drawShapes }         from '@awacloud/odf/extra/draw-shapes';
import { textFieldsExtended } from '@awacloud/odf/extra/text-fields-extended';
import { textListDetailed }   from '@awacloud/odf/extra/text-list-detailed';
import { odsLargeBundle }     from '@awacloud/odf/bundles/ods-large';
```

## Breaking change

The imperative `buildOdsLarge(odsInstance, { xml })` helper and the
named re-export of `ods` from `@awacloud/odf/ods-large` have been removed.
Consume exclusively via `ModuleRuntime.resolve('odsLargeBundle')`.
