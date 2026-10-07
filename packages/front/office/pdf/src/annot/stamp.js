// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Rubber-stamp annotation per ISO 32000-2:2020 §12.5.6.12.
 *
 * Subtype-specific entries:
 *   /Name  name — icon name (Approved, Confidential, Draft, …)
 *
 * @module pdf/annot/stamp
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfStampAnnot = {
    name: 'pdfStampAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['Name']);

        function typeStampAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'Stamp') {
                throw new ParseError('pdf/annot/stamp/bad-subtype',
                    '/Subtype must be /Stamp',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            base.iconName = isType(e.Name, 'name') ? e.Name.value : null;
            captureExtras(base, dict, KNOWN);
            return base;
        }

        return { typeStampAnnot };
    }
};
