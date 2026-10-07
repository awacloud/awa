// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Link annotation per ISO 32000-2:2020 §12.5.6.5.
 *
 * Subtype-specific entries:
 *   /Dest       array|name|string — destination (mutually exclusive with /A)
 *   /A          dict              — action to perform
 *   /H          name              — highlight mode (N, I, O, P)
 *   /PA         dict              — URI action for WWW links
 *   /QuadPoints array of numbers  — link-region quadrilaterals
 *   /BS         dict              — border style (already on base, but
 *                                   captured explicitly for clarity)
 *
 * @module pdf/annot/link
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfLinkAnnot = {
    name: 'pdfLinkAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['Dest', 'A', 'H', 'PA', 'QuadPoints']);

        function typeLinkAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'Link') {
                throw new ParseError('pdf/annot/link/bad-subtype',
                    '/Subtype must be /Link',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            base.dest       = e.Dest || null;
            base.action     = isType(e.A, 'dict') ? e.A : null;
            base.h          = isType(e.H, 'name') ? e.H.value : null;
            base.pa         = isType(e.PA, 'dict') ? e.PA : null;
            base.quadPoints = toNumArray(e.QuadPoints);
            captureExtras(base, dict, KNOWN);
            return base;
        }

        function toNumArray(v) {
            if (!v) return null;
            if (v.type !== 'array') {
                throw new ParseError('pdf/annot/link/bad-quadpoints',
                    '/QuadPoints must be an array of numbers',
                    { context: { kind: v.type } });
            }
            const out = [];
            for (const it of v.items) {
                if (!it || (it.type !== 'int' && it.type !== 'real')) {
                    throw new ParseError('pdf/annot/link/bad-quadpoints',
                        '/QuadPoints entries must be numbers',
                        { context: { kind: it && it.type } });
                }
                out.push(it.value);
            }
            return out;
        }

        return { typeLinkAnnot };
    }
};
