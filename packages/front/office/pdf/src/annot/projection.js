// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Projection (3D-view) annotation per ISO 32000-2:2020
 * §13.6.6.2 (Projections), and legacy Movie/Sound annotations
 * (Annex H, deprecated in PDF 2.0 but still parsed for completeness).
 *
 * Projection subtype-specific entries:
 *   /V  dict|name — 3D-view (or referenced view name)
 *   /B  dict      — 3D-state (background, etc.)
 *
 * @module pdf/annot/projection
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfProjectionAnnot = {
    name: 'pdfProjectionAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['V', 'B']);

        function typeProjectionAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'Projection') {
                throw new ParseError('pdf/annot/projection/bad-subtype',
                    '/Subtype must be /Projection',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            base.v = e.V || null;
            base.b = isType(e.B, 'dict') ? e.B : null;
            captureExtras(base, dict, KNOWN);
            return base;
        }

        return { typeProjectionAnnot };
    }
};
