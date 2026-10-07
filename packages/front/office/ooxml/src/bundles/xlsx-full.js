// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/ooxml/xlsx-full` — complete xlsx coverage bundle.
 *
 * Pure fw factory descriptor that extends `xlsxLargeBundle` with every
 * remaining opt-in extra that touches xlsx : ActiveX form controls,
 * advanced custom-geometry shapes, SpreadsheetDrawing connectors / group
 * shapes, residual misc sweepers, and the part-4 transitional +
 * standalone legacy VML mappers.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('xlsxFullBundle')`.
 *
 * @module ooxml/xlsx-full
 */

import { xlsxLargeBundle } from './xlsx-large.js';
import { smlFormControls } from '../extra/sml-form-controls.js';
import { dmlShapesAdvanced } from '../extra/dml-shapes-advanced.js';
import { dmlXdrAdvanced } from '../extra/dml-xdr-advanced.js';
import { transitional } from '../extra/transitional.js';
import { legacyVml } from '../extra/legacy-vml.js';
import { smlMisc } from '../extra/sml-misc.js';
import { dmlChartMisc } from '../extra/dml-chart-misc.js';
import { dmlMainMisc } from '../extra/dml-main-misc.js';

export const xlsxFullBundle = {
    name: 'xlsxFullBundle',
    dependencies: [
        'xlsxLargeBundle',
        'smlFormControls', 'dmlShapesAdvanced', 'dmlXdrAdvanced',
        'transitional', 'legacyVml',
        'smlMisc', 'dmlChartMisc', 'dmlMainMisc'
    ],
    deps: [xlsxLargeBundle, smlFormControls, dmlShapesAdvanced, dmlXdrAdvanced, transitional, legacyVml, smlMisc, dmlChartMisc, dmlMainMisc],
    factory(xlsxLargeBundle,
            smlFormControls, dmlShapesAdvanced, dmlXdrAdvanced,
            transitional, legacyVml,
            smlMisc, dmlChartMisc, dmlMainMisc) {
        xlsxLargeBundle.use(
            smlFormControls, dmlShapesAdvanced, dmlXdrAdvanced,
            transitional, legacyVml,
            smlMisc, dmlChartMisc, dmlMainMisc
        );
        return xlsxLargeBundle;
    }
};
