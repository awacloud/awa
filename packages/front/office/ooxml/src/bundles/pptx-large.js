// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/ooxml/pptx-large` — extended pptx coverage bundle.
 *
 * Pure fw factory descriptor. Declares the core `pptx` orchestrator and
 * the P0/P1 opt-in extras (animations, transitions, notes, typed
 * layouts, the DrawingML chart deepening modules, advanced math, shared
 * effects + advanced fills) as dependencies. The runtime passes
 * already-built instances to the factory, which wires them into the
 * `pptx` core via `pptx.use(...)` and returns the enriched instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('pptxLargeBundle')`.
 *
 * @module ooxml/pptx-large
 */

import { pptx } from '../pptx/pptx.js';
import { pmlAnimations } from '../extra/pml-animations.js';
import { pmlTransitions } from '../extra/pml-transitions.js';
import { pmlNotes } from '../extra/pml-notes.js';
import { pmlLayoutsTyped } from '../extra/pml-layouts-typed.js';
import { dmlChartDataLabels } from '../extra/dml-chart-data-labels.js';
import { dmlChartTrendlines } from '../extra/dml-chart-trendlines.js';
import { dmlChartAxesAdvanced } from '../extra/dml-chart-axes-advanced.js';
import { dmlChart3d } from '../extra/dml-chart-3d.js';
import { dmlChartOtherTypes } from '../extra/dml-chart-other-types.js';
import { mathAdvanced } from '../extra/math-advanced.js';
import { dmlEffects } from '../extra/dml-effects.js';
import { dmlFillsAdvanced } from '../extra/dml-fills-advanced.js';

export const pptxLargeBundle = {
    name: 'pptxLargeBundle',
    dependencies: [
        'pptx',
        'pmlAnimations', 'pmlTransitions', 'pmlNotes', 'pmlLayoutsTyped',
        'dmlChartDataLabels', 'dmlChartTrendlines', 'dmlChartAxesAdvanced',
        'dmlChart3d', 'dmlChartOtherTypes',
        'mathAdvanced',
        'dmlEffects', 'dmlFillsAdvanced'
    ],
    deps: [pptx, pmlAnimations, pmlTransitions, pmlNotes, pmlLayoutsTyped, dmlChartDataLabels, dmlChartTrendlines, dmlChartAxesAdvanced, dmlChart3d, dmlChartOtherTypes, mathAdvanced, dmlEffects, dmlFillsAdvanced],
    factory(pptx,
            pmlAnimations, pmlTransitions, pmlNotes, pmlLayoutsTyped,
            dmlChartDataLabels, dmlChartTrendlines, dmlChartAxesAdvanced,
            dmlChart3d, dmlChartOtherTypes,
            mathAdvanced,
            dmlEffects, dmlFillsAdvanced) {
        pptx.use(
            pmlAnimations, pmlTransitions, pmlNotes, pmlLayoutsTyped,
            dmlChartDataLabels, dmlChartTrendlines, dmlChartAxesAdvanced,
            dmlChart3d, dmlChartOtherTypes,
            mathAdvanced,
            dmlEffects, dmlFillsAdvanced
        );
        return pptx;
    }
};
