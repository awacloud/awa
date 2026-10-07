// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/odf/odt-full` — complete `.odt` coverage bundle.
 *
 * Pure fw factory descriptor that extends `odtLargeBundle` with every
 * remaining opt-in extra that touches text documents : P1 (meta /
 * sections / TOC / images / math), P2 (dr3d / forms / scripts /
 * signatures / settings extras) and P3 misc sweepers plus legacy
 * StarOffice passthrough.
 *
 * The factory receives the already-enriched `odt` instance produced by
 * `odtLargeBundle` and layers the remaining extras on top via
 * `odt.use(...)`. Returns the same instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('odtFullBundle')`.
 *
 * @module odf/odt-full
 */

import { odtLargeBundle } from './odt-large.js';
import { textMetaExtended } from '../extra/text-meta-extended.js';
import { textSectionsAdvanced } from '../extra/text-sections-advanced.js';
import { textTocIndex } from '../extra/text-toc-index.js';
import { drawImageExtended } from '../extra/draw-image-extended.js';
import { metaExtended } from '../extra/meta-extended.js';
import { mathMathml } from '../extra/math-mathml.js';
import { dr3d3d } from '../extra/dr3d-3d.js';
import { formsControls } from '../extra/forms-controls.js';
import { scriptMacros } from '../extra/script-macros.js';
import { dsigSignatures } from '../extra/dsig-signatures.js';
import { settingsExtended } from '../extra/settings-extended.js';
import { textMisc } from '../extra/text-misc.js';
import { styleMisc } from '../extra/style-misc.js';
import { drawMisc } from '../extra/draw-misc.js';
import { tableMisc } from '../extra/table-misc.js';
import { officeMisc } from '../extra/office-misc.js';
import { legacyStaroffice } from '../extra/legacy-staroffice.js';

export const odtFullBundle = {
    name: 'odtFullBundle',
    dependencies: [
        'odtLargeBundle',
        'textMetaExtended', 'textSectionsAdvanced', 'textTocIndex',
        'drawImageExtended', 'metaExtended', 'mathMathml',
        'dr3d3d', 'formsControls', 'scriptMacros',
        'dsigSignatures', 'settingsExtended',
        'textMisc', 'styleMisc', 'drawMisc', 'tableMisc',
        'officeMisc', 'legacyStaroffice'
    ],
    deps: [odtLargeBundle, textMetaExtended, textSectionsAdvanced, textTocIndex, drawImageExtended, metaExtended, mathMathml, dr3d3d, formsControls, scriptMacros, dsigSignatures, settingsExtended, textMisc, styleMisc, drawMisc, tableMisc, officeMisc, legacyStaroffice],
    factory(odtLargeBundle,
            textMetaExtended, textSectionsAdvanced, textTocIndex,
            drawImageExtended, metaExtended, mathMathml,
            dr3d3d, formsControls, scriptMacros,
            dsigSignatures, settingsExtended,
            textMisc, styleMisc, drawMisc, tableMisc,
            officeMisc, legacyStaroffice) {
        odtLargeBundle.use(
            textMetaExtended, textSectionsAdvanced, textTocIndex,
            drawImageExtended, metaExtended, mathMathml,
            dr3d3d, formsControls, scriptMacros,
            dsigSignatures, settingsExtended,
            textMisc, styleMisc, drawMisc, tableMisc,
            officeMisc, legacyStaroffice
        );
        return odtLargeBundle;
    }
};
