// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/ooxml/docx-full` — complete docx coverage bundle.
 *
 * Pure fw factory descriptor that extends `docxLargeBundle` with every
 * remaining opt-in extra that touches docx : VML legacy, advanced
 * custom-geometry shapes, the residual `wml-misc` / `math-misc` /
 * `dml-main-misc` sweepers, and the part-4 transitional + standalone
 * legacy VML mappers.
 *
 * The factory receives the already-enriched `docx` instance produced by
 * `docxLargeBundle` and layers the remaining extras on top via
 * `docx.use(...)`. Returns the same instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('docxFullBundle')`.
 *
 * @module ooxml/docx-full
 */

import { docxLargeBundle } from './docx-large.js';
import { wmlVmlLegacy } from '../extra/wml-vml-legacy.js';
import { dmlShapesAdvanced } from '../extra/dml-shapes-advanced.js';
import { transitional } from '../extra/transitional.js';
import { legacyVml } from '../extra/legacy-vml.js';
import { wmlMisc } from '../extra/wml-misc.js';
import { mathMisc } from '../extra/math-misc.js';
import { dmlMainMisc } from '../extra/dml-main-misc.js';

export const docxFullBundle = {
    name: 'docxFullBundle',
    dependencies: [
        'docxLargeBundle',
        'wmlVmlLegacy', 'dmlShapesAdvanced',
        'transitional', 'legacyVml',
        'wmlMisc', 'mathMisc', 'dmlMainMisc'
    ],
    deps: [docxLargeBundle, wmlVmlLegacy, dmlShapesAdvanced, transitional, legacyVml, wmlMisc, mathMisc, dmlMainMisc],
    factory(docxLargeBundle,
            wmlVmlLegacy, dmlShapesAdvanced,
            transitional, legacyVml,
            wmlMisc, mathMisc, dmlMainMisc) {
        docxLargeBundle.use(
            wmlVmlLegacy, dmlShapesAdvanced,
            transitional, legacyVml,
            wmlMisc, mathMisc, dmlMainMisc
        );
        return docxLargeBundle;
    }
};
