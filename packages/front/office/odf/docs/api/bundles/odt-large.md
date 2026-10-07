---
module: odtLargeBundle
category: odf/bundles
dependencies: [odt, textTrackedChanges, textFieldsExtended, textListDetailed, tableAdvanced, stylePage, stylePropertiesTyped, drawShapes]
returns: module
worker-safe: true
status: complete
---

# @awacloud/odf/odt-large

> Extended `.odt` coverage bundle (P0).

**Module** `odtLargeBundle` | **Source** `packages/front/office/odf/src/bundles/odt-large.js`

Pure fw factory descriptor. Returns the core `odt` orchestrator enriched
with the seven P0 extras most relevant to text documents :
`textTrackedChanges`, `textFieldsExtended`, `textListDetailed`,
`tableAdvanced`, `stylePage`, `stylePropertiesTyped`, `drawShapes`.

## Usage

Consumption is exclusively declarative — register the descriptor (and
its transitive dependencies) in a `ModuleRuntime` and resolve by name :

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '@awacloud/odf';

const runtime = new ModuleRuntime();
for (const m of [...fw_require, ...modules, ...extras, ...bundle]) {
    runtime.register(m);
}

const odt = runtime.resolve('odtLargeBundle'); // enriched odt instance
```

Or, to register only the P0 extras the `odt-large` bundle actually needs,
import each extra factory via its sub-path :

```js
import { textTrackedChanges } from '@awacloud/odf/extra/text-tracked-changes';
import { textFieldsExtended } from '@awacloud/odf/extra/text-fields-extended';
import { textListDetailed }   from '@awacloud/odf/extra/text-list-detailed';
import { tableAdvanced }      from '@awacloud/odf/extra/table-advanced';
import { stylePage }          from '@awacloud/odf/extra/style-page';
import { stylePropertiesTyped } from '@awacloud/odf/extra/style-properties-typed';
import { drawShapes }         from '@awacloud/odf/extra/draw-shapes';
import { odtLargeBundle }     from '@awacloud/odf/bundles/odt-large';
```

The bundle's factory calls `odt.use(...)` internally on the resolved
extras and returns the same `odt` instance — idempotent (the walker
dedupes extension registrations).

## Breaking change

Previously the bundle shipped an imperative helper
`buildOdtLarge(odtInstance, { xml })` re-exported from
`@awacloud/odf/odt-large`. That helper and the bundle's named re-export of
`odt` have been removed — the only supported consumption is via
`ModuleRuntime.resolve('odtLargeBundle')`.
