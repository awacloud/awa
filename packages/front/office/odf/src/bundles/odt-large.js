// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/odf/odt-large` — extended `.odt` coverage bundle.
 *
 * Pure fw factory descriptor. Declares the core `odt` orchestrator and
 * the P0 opt-in extras relevant to text documents as dependencies. The
 * runtime resolves every dependency transitively and passes the
 * already-constructed instances to the factory, which wires them into
 * the `odt` core via `odt.use(...)` and returns the enriched instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('odtLargeBundle')`.
 *
 * For the full ODF 1.4 surface (P1/P2/P3 + misc), use `odt-full`.
 *
 * @module odf/odt-large
 */

import { odt } from '../odt/odt.js';
import { textTrackedChanges } from '../extra/text-tracked-changes.js';
import { textFieldsExtended } from '../extra/text-fields-extended.js';
import { textListDetailed } from '../extra/text-list-detailed.js';
import { tableAdvanced } from '../extra/table-advanced.js';
import { stylePage } from '../extra/style-page.js';
import { stylePropertiesTyped } from '../extra/style-properties-typed.js';
import { drawShapes } from '../extra/draw-shapes.js';

export const odtLargeBundle = {
    name: 'odtLargeBundle',
    dependencies: [
        'odt',
        'textTrackedChanges', 'textFieldsExtended', 'textListDetailed',
        'tableAdvanced', 'stylePage', 'stylePropertiesTyped', 'drawShapes'
    ],
    deps: [odt, textTrackedChanges, textFieldsExtended, textListDetailed, tableAdvanced, stylePage, stylePropertiesTyped, drawShapes],
    factory(odt,
            textTrackedChanges, textFieldsExtended, textListDetailed,
            tableAdvanced, stylePage, stylePropertiesTyped, drawShapes) {
        odt.use(
            textTrackedChanges, textFieldsExtended, textListDetailed,
            tableAdvanced, stylePage, stylePropertiesTyped, drawShapes
        );
        return odt;
    }
};
