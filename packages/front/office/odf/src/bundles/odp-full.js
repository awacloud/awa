// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/odf/odp-full` — complete `.odp` coverage bundle.
 *
 * Pure fw factory descriptor that extends `odpLargeBundle` with every
 * remaining opt-in extra relevant to presentations.
 *
 * @module odf/odp-full
 */

import { odpLargeBundle } from './odp-large.js';
import { animationsSmil } from '../extra/animations-smil.js';
import { chartTyped } from '../extra/chart-typed.js';
import { drawImageExtended } from '../extra/draw-image-extended.js';
import { textTocIndex } from '../extra/text-toc-index.js';
import { textTrackedChanges } from '../extra/text-tracked-changes.js';
import { tableAdvanced } from '../extra/table-advanced.js';
import { metaExtended } from '../extra/meta-extended.js';
import { mathMathml } from '../extra/math-mathml.js';
import { formsControls } from '../extra/forms-controls.js';
import { scriptMacros } from '../extra/script-macros.js';
import { dsigSignatures } from '../extra/dsig-signatures.js';
import { dr3d3d } from '../extra/dr3d-3d.js';
import { drawMisc } from '../extra/draw-misc.js';
import { styleMisc } from '../extra/style-misc.js';
import { textMisc } from '../extra/text-misc.js';
import { tableMisc } from '../extra/table-misc.js';
import { officeMisc } from '../extra/office-misc.js';
import { legacyStaroffice } from '../extra/legacy-staroffice.js';

export const odpFullBundle = {
    name: 'odpFullBundle',
    dependencies: [
        'odpLargeBundle',
        'animationsSmil', 'chartTyped', 'drawImageExtended',
        'textTocIndex', 'textTrackedChanges', 'tableAdvanced',
        'metaExtended', 'mathMathml',
        'formsControls', 'scriptMacros', 'dsigSignatures', 'dr3d3d',
        'drawMisc', 'styleMisc', 'textMisc', 'tableMisc',
        'officeMisc', 'legacyStaroffice'
    ],
    deps: [odpLargeBundle, animationsSmil, chartTyped, drawImageExtended, textTocIndex, textTrackedChanges, tableAdvanced, metaExtended, mathMathml, formsControls, scriptMacros, dsigSignatures, dr3d3d, drawMisc, styleMisc, textMisc, tableMisc, officeMisc, legacyStaroffice],
    factory(odpLargeBundle,
            animationsSmil, chartTyped, drawImageExtended,
            textTocIndex, textTrackedChanges, tableAdvanced,
            metaExtended, mathMathml,
            formsControls, scriptMacros, dsigSignatures, dr3d3d,
            drawMisc, styleMisc, textMisc, tableMisc,
            officeMisc, legacyStaroffice) {
        odpLargeBundle.use(
            animationsSmil, chartTyped, drawImageExtended,
            textTocIndex, textTrackedChanges, tableAdvanced,
            metaExtended, mathMathml,
            formsControls, scriptMacros, dsigSignatures, dr3d3d,
            drawMisc, styleMisc, textMisc, tableMisc,
            officeMisc, legacyStaroffice
        );
        return odpLargeBundle;
    }
};
