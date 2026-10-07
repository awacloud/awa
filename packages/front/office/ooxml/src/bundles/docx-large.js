// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/ooxml/docx-large` — extended docx coverage bundle.
 *
 * Pure fw factory descriptor. Declares the core `docx` orchestrator and
 * the P0/P1 opt-in extras (run/paragraph/table formatting, numbering
 * details, settings, fields, tracked changes, advanced math, wp
 * positioning, shared DrawingML effects + advanced fills) as
 * dependencies. The runtime resolves every dependency transitively and
 * passes the already-constructed instances to the factory, which wires
 * them into the `docx` core via `docx.use(...)` and returns the
 * enriched instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('docxLargeBundle')`.
 *
 * To also type or preserve the long tail of the schema, use `docx-full`.
 *
 * @module ooxml/docx-large
 */

import { docx } from '../docx/docx.js';
import { wmlRunFormatting } from '../extra/wml-run-formatting.js';
import { wmlParagraphFormatting } from '../extra/wml-paragraph-formatting.js';
import { wmlTableProperties } from '../extra/wml-table-properties.js';
import { wmlNumberingDetails } from '../extra/wml-numbering-details.js';
import { wmlSettings } from '../extra/wml-settings.js';
import { wmlFields } from '../extra/wml-fields.js';
import { wmlTrackedChanges } from '../extra/wml-tracked-changes.js';
import { mathAdvanced } from '../extra/math-advanced.js';
import { dmlWpPositioning } from '../extra/dml-wp-positioning.js';
import { dmlEffects } from '../extra/dml-effects.js';
import { dmlFillsAdvanced } from '../extra/dml-fills-advanced.js';

export const docxLargeBundle = {
    name: 'docxLargeBundle',
    dependencies: [
        'docx',
        'wmlRunFormatting', 'wmlParagraphFormatting', 'wmlTableProperties',
        'wmlNumberingDetails', 'wmlSettings', 'wmlFields', 'wmlTrackedChanges',
        'mathAdvanced', 'dmlWpPositioning',
        'dmlEffects', 'dmlFillsAdvanced'
    ],
    deps: [docx, wmlRunFormatting, wmlParagraphFormatting, wmlTableProperties, wmlNumberingDetails, wmlSettings, wmlFields, wmlTrackedChanges, mathAdvanced, dmlWpPositioning, dmlEffects, dmlFillsAdvanced],
    factory(docx,
            wmlRunFormatting, wmlParagraphFormatting, wmlTableProperties,
            wmlNumberingDetails, wmlSettings, wmlFields, wmlTrackedChanges,
            mathAdvanced, dmlWpPositioning,
            dmlEffects, dmlFillsAdvanced) {
        docx.use(
            wmlRunFormatting, wmlParagraphFormatting, wmlTableProperties,
            wmlNumberingDetails, wmlSettings, wmlFields, wmlTrackedChanges,
            mathAdvanced, dmlWpPositioning,
            dmlEffects, dmlFillsAdvanced
        );
        return docx;
    }
};
