// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/odf/odp-large` — extended `.odp` coverage bundle.
 *
 * Pure fw factory descriptor. Declares the core `odp` orchestrator and
 * the P0 opt-in extras relevant to presentations as dependencies. The
 * runtime resolves every dependency transitively and passes the
 * already-constructed instances to the factory, which wires them into
 * the `odp` core via `odp.use(...)` and returns the enriched instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('odpLargeBundle')`.
 *
 * @module odf/odp-large
 */

import { odp } from '../odp/odp.js';
import { presentationTyped } from '../extra/presentation-typed.js';
import { drawShapes } from '../extra/draw-shapes.js';
import { stylePage } from '../extra/style-page.js';
import { stylePropertiesTyped } from '../extra/style-properties-typed.js';
import { textFieldsExtended } from '../extra/text-fields-extended.js';
import { textListDetailed } from '../extra/text-list-detailed.js';

export const odpLargeBundle = {
    name: 'odpLargeBundle',
    dependencies: [
        'odp',
        'presentationTyped', 'drawShapes', 'stylePage',
        'stylePropertiesTyped', 'textFieldsExtended', 'textListDetailed'
    ],
    deps: [odp, presentationTyped, drawShapes, stylePage, stylePropertiesTyped, textFieldsExtended, textListDetailed],
    factory(odp,
            presentationTyped, drawShapes, stylePage,
            stylePropertiesTyped, textFieldsExtended, textListDetailed) {
        odp.use(
            presentationTyped, drawShapes, stylePage,
            stylePropertiesTyped, textFieldsExtended, textListDetailed
        );
        return odp;
    }
};
