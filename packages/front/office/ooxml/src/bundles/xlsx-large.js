// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/ooxml/xlsx-large` — extended xlsx coverage bundle.
 *
 * Pure fw factory descriptor. Declares the core `xlsx` orchestrator and
 * the P0/P1 opt-in extras (pivot tables, calculation, sheet/workbook
 * config, the DrawingML chart deepening modules, shared effects +
 * advanced fills) as dependencies. The runtime passes already-built
 * instances to the factory, which wires them into the `xlsx` core via
 * `xlsx.use(...)` and returns the enriched instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('xlsxLargeBundle')`.
 *
 * @module ooxml/xlsx-large
 */

import { xlsx } from '../xlsx/xlsx.js';
import { smlPivotTables } from '../extra/sml-pivot-tables.js';
import { smlCalculation } from '../extra/sml-calculation.js';
import { smlSheetConfig } from '../extra/sml-sheet-config.js';
import { smlWorkbookConfig } from '../extra/sml-workbook-config.js';
import { dmlChartDataLabels } from '../extra/dml-chart-data-labels.js';
import { dmlChartTrendlines } from '../extra/dml-chart-trendlines.js';
import { dmlChartAxesAdvanced } from '../extra/dml-chart-axes-advanced.js';
import { dmlChart3d } from '../extra/dml-chart-3d.js';
import { dmlChartOtherTypes } from '../extra/dml-chart-other-types.js';
import { dmlEffects } from '../extra/dml-effects.js';
import { dmlFillsAdvanced } from '../extra/dml-fills-advanced.js';

export const xlsxLargeBundle = {
    name: 'xlsxLargeBundle',
    dependencies: [
        'xlsx',
        'smlPivotTables', 'smlCalculation', 'smlSheetConfig', 'smlWorkbookConfig',
        'dmlChartDataLabels', 'dmlChartTrendlines', 'dmlChartAxesAdvanced',
        'dmlChart3d', 'dmlChartOtherTypes',
        'dmlEffects', 'dmlFillsAdvanced'
    ],
    deps: [xlsx, smlPivotTables, smlCalculation, smlSheetConfig, smlWorkbookConfig, dmlChartDataLabels, dmlChartTrendlines, dmlChartAxesAdvanced, dmlChart3d, dmlChartOtherTypes, dmlEffects, dmlFillsAdvanced],
    factory(xlsx,
            smlPivotTables, smlCalculation, smlSheetConfig, smlWorkbookConfig,
            dmlChartDataLabels, dmlChartTrendlines, dmlChartAxesAdvanced,
            dmlChart3d, dmlChartOtherTypes,
            dmlEffects, dmlFillsAdvanced) {
        xlsx.use(
            smlPivotTables, smlCalculation, smlSheetConfig, smlWorkbookConfig,
            dmlChartDataLabels, dmlChartTrendlines, dmlChartAxesAdvanced,
            dmlChart3d, dmlChartOtherTypes,
            dmlEffects, dmlFillsAdvanced
        );
        return xlsx;
    }
};
