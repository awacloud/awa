// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/odf/ods-large` — extended `.ods` coverage bundle.
 *
 * Pure fw factory descriptor. Declares the core `ods` orchestrator and
 * the P0 opt-in extras relevant to spreadsheets as dependencies. The
 * runtime resolves every dependency transitively and passes the
 * already-constructed instances to the factory, which wires them into
 * the `ods` core via `ods.use(...)` and returns the enriched instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('odsLargeBundle')`.
 *
 * @module odf/ods-large
 */

import { ods } from '../ods/ods.js';
import { tableAdvanced } from '../extra/table-advanced.js';
import { stylePage } from '../extra/style-page.js';
import { stylePropertiesTyped } from '../extra/style-properties-typed.js';
import { drawShapes } from '../extra/draw-shapes.js';
import { textFieldsExtended } from '../extra/text-fields-extended.js';
import { textListDetailed } from '../extra/text-list-detailed.js';

export const odsLargeBundle = {
    name: 'odsLargeBundle',
    dependencies: [
        'ods',
        'tableAdvanced', 'stylePage', 'stylePropertiesTyped',
        'drawShapes', 'textFieldsExtended', 'textListDetailed'
    ],
    deps: [ods, tableAdvanced, stylePage, stylePropertiesTyped, drawShapes, textFieldsExtended, textListDetailed],
    factory(ods,
            tableAdvanced, stylePage, stylePropertiesTyped,
            drawShapes, textFieldsExtended, textListDetailed) {
        ods.use(
            tableAdvanced, stylePage, stylePropertiesTyped,
            drawShapes, textFieldsExtended, textListDetailed
        );
        return ods;
    }
};
