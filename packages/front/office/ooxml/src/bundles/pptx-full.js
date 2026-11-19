// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/ooxml/pptx-full` — complete pptx coverage bundle.
 *
 * Pure fw factory descriptor that extends `pptxLargeBundle` with every
 * remaining opt-in extra that touches pptx : advanced custom-geometry
 * shapes, residual misc sweepers, and the part-4 transitional +
 * standalone legacy VML mappers; the text, part-level and package
 * details (`dmlTextDetails`, `pmlPartDetails`, `pmlPackageParts`: the
 * notes slides, the notes and handout masters, the unused layouts).
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('pptxFullBundle')`.
 *
 * @module ooxml/pptx-full
 */

import { pptxLargeBundle } from './pptx-large.js';
import { dmlShapesAdvanced } from '../extra/dml-shapes-advanced.js';
import { transitional } from '../extra/transitional.js';
import { legacyVml } from '../extra/legacy-vml.js';
import { pmlMisc } from '../extra/pml-misc.js';
import { dmlChartMisc } from '../extra/dml-chart-misc.js';
import { dmlMainMisc } from '../extra/dml-main-misc.js';
import { mathMisc } from '../extra/math-misc.js';
import { dmlTextDetails } from '../extra/dml-text-details.js';
import { pmlPartDetails } from '../extra/pml-part-details.js';
import { pmlPackageParts } from '../extra/pml-package-parts.js';

export const pptxFullBundle = {
    name: 'pptxFullBundle',
    dependencies: [
        'pptxLargeBundle',
        'dmlShapesAdvanced', 'transitional', 'legacyVml',
        'pmlMisc', 'dmlChartMisc', 'dmlMainMisc', 'mathMisc',
        'dmlTextDetails', 'pmlPartDetails', 'pmlPackageParts'
    ],
    deps: [pptxLargeBundle, dmlShapesAdvanced, transitional, legacyVml, pmlMisc, dmlChartMisc, dmlMainMisc, mathMisc, dmlTextDetails, pmlPartDetails, pmlPackageParts],
    factory(pptxLargeBundle,
            dmlShapesAdvanced, transitional, legacyVml,
            pmlMisc, dmlChartMisc, dmlMainMisc, mathMisc,
            dmlTextDetails, pmlPartDetails, pmlPackageParts) {
        pptxLargeBundle.use(
            dmlShapesAdvanced, transitional, legacyVml,
            pmlMisc, dmlChartMisc, dmlMainMisc, mathMisc,
            dmlTextDetails, pmlPartDetails, pmlPackageParts
        );
        return pptxLargeBundle;
    }
};
