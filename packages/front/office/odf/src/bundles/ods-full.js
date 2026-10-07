// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/odf/ods-full` — complete `.ods` coverage bundle.
 *
 * Pure fw factory descriptor that extends `odsLargeBundle` with every
 * remaining opt-in extra relevant to spreadsheets.
 *
 * @module odf/ods-full
 */

import { odsLargeBundle } from './ods-large.js';
import { animationsSmil } from '../extra/animations-smil.js';
import { chartTyped } from '../extra/chart-typed.js';
import { drawImageExtended } from '../extra/draw-image-extended.js';
import { numberFormatExtended } from '../extra/number-format-extended.js';
import { metaExtended } from '../extra/meta-extended.js';
import { formsControls } from '../extra/forms-controls.js';
import { scriptMacros } from '../extra/script-macros.js';
import { databaseSources } from '../extra/database-sources.js';
import { dsigSignatures } from '../extra/dsig-signatures.js';
import { dr3d3d } from '../extra/dr3d-3d.js';
import { tableMisc } from '../extra/table-misc.js';
import { drawMisc } from '../extra/draw-misc.js';
import { styleMisc } from '../extra/style-misc.js';
import { textMisc } from '../extra/text-misc.js';
import { officeMisc } from '../extra/office-misc.js';
import { legacyStaroffice } from '../extra/legacy-staroffice.js';

export const odsFullBundle = {
    name: 'odsFullBundle',
    dependencies: [
        'odsLargeBundle',
        'animationsSmil', 'chartTyped', 'drawImageExtended',
        'numberFormatExtended', 'metaExtended',
        'formsControls', 'scriptMacros', 'databaseSources',
        'dsigSignatures', 'dr3d3d',
        'tableMisc', 'drawMisc', 'styleMisc',
        'textMisc', 'officeMisc', 'legacyStaroffice'
    ],
    deps: [odsLargeBundle, animationsSmil, chartTyped, drawImageExtended, numberFormatExtended, metaExtended, formsControls, scriptMacros, databaseSources, dsigSignatures, dr3d3d, tableMisc, drawMisc, styleMisc, textMisc, officeMisc, legacyStaroffice],
    factory(odsLargeBundle,
            animationsSmil, chartTyped, drawImageExtended,
            numberFormatExtended, metaExtended,
            formsControls, scriptMacros, databaseSources,
            dsigSignatures, dr3d3d,
            tableMisc, drawMisc, styleMisc,
            textMisc, officeMisc, legacyStaroffice) {
        odsLargeBundle.use(
            animationsSmil, chartTyped, drawImageExtended,
            numberFormatExtended, metaExtended,
            formsControls, scriptMacros, databaseSources,
            dsigSignatures, dr3d3d,
            tableMisc, drawMisc, styleMisc,
            textMisc, officeMisc, legacyStaroffice
        );
        return odsLargeBundle;
    }
};
