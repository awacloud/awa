// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Redact annotation (ISO 32000-2 §12.5.6.21) — read-side typing only; applying a redaction (content removal) is not implemented.
 *
 * Subtype-specific entries:
 *   /QuadPoints  array of numbers (multiple of 8) — redaction regions
 *   /IC          array — interior color (post-redaction fill)
 *   /RO          stream — replacement appearance for the redacted area
 *   /OverlayText string — text overlaid after applying the redaction
 *   /Repeat      boolean — repeat overlay text to fill the region
 *   /DA          string — default appearance for /OverlayText
 *   /Q           int    — quadding for /OverlayText
 *
 * @module pdf/annot/redact
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfRedactAnnot = {
    name: 'pdfRedactAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set([
            'QuadPoints', 'IC', 'RO', 'OverlayText', 'Repeat', 'DA', 'Q'
        ]);

        function typeRedactAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'Redact') {
                throw new ParseError('pdf/annot/redact/bad-subtype',
                    '/Subtype must be /Redact',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            base.quadPoints  = toNumArray(e.QuadPoints, 'pdf/annot/redact/bad-quadpoints');
            if (base.quadPoints && base.quadPoints.length % 8 !== 0) {
                throw new ParseError('pdf/annot/redact/bad-quadpoints',
                    '/QuadPoints length must be a multiple of 8',
                    { context: { length: base.quadPoints.length } });
            }
            base.ic          = toNumArray(e.IC, 'pdf/annot/redact/bad-ic');
            base.ro          = e.RO || null;
            base.overlayText = isType(e.OverlayText, 'string') ? e.OverlayText.value : null;
            base.repeat      = isType(e.Repeat, 'bool') ? !!e.Repeat.value : false;
            base.da          = isType(e.DA, 'string') ? e.DA.value : null;
            base.q           = (e.Q && (e.Q.type === 'int' || e.Q.type === 'real'))
                ? (e.Q.value | 0) : 0;
            captureExtras(base, dict, KNOWN);
            return base;
        }

        function toNumArray(v, errCode) {
            if (!v) return null;
            if (v.type !== 'array') {
                throw new ParseError(errCode,
                    'expected an array of numbers',
                    { context: { kind: v.type } });
            }
            const out = [];
            for (const it of v.items) {
                if (!it || (it.type !== 'int' && it.type !== 'real')) {
                    throw new ParseError(errCode,
                        'array entries must be numbers',
                        { context: { kind: it && it.type } });
                }
                out.push(it.value);
            }
            return out;
        }

        return { typeRedactAnnot };
    }
};
