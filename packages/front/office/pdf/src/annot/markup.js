// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Text-markup annotations per ISO 32000-2:2020 §12.5.6.10.
 *
 * Subtypes handled: Highlight, Underline, Squiggly, StrikeOut, Caret.
 *
 * Common entry:
 *   /QuadPoints  array of 8n numbers — quadrilaterals covering markup
 *
 * Caret-specific (§12.5.6.11) optional entries:
 *   /RD          rectangle differences
 *   /Sy          name — symbol displayed (P or None)
 *
 * @module pdf/annot/markup
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfMarkupAnnot = {
    name: 'pdfMarkupAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['QuadPoints', 'RD', 'Sy', 'IT']);
        const VALID = new Set(['Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Caret']);

        function typeMarkupAnnot(dict, expected) {
            if (!VALID.has(expected)) {
                throw new ParseError('pdf/annot/markup/bad-expected',
                    'unsupported markup subtype',
                    { context: { expected } });
            }
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== expected) {
                throw new ParseError('pdf/annot/markup/bad-subtype',
                    '/Subtype mismatch for markup typer',
                    { context: { expected, actual: base.subtype } });
            }
            const e = dict.entries;
            base.quadPoints = toNumArray(e.QuadPoints,
                'pdf/annot/markup/bad-quadpoints');
            if (expected === 'Caret') {
                base.rd = toNumArray(e.RD, 'pdf/annot/markup/bad-rd');
                base.sy = isType(e.Sy, 'name') ? e.Sy.value : null;
            } else if (e.QuadPoints) {
                if (base.quadPoints && base.quadPoints.length % 8 !== 0) {
                    throw new ParseError('pdf/annot/markup/bad-quadpoints',
                        '/QuadPoints length must be a multiple of 8',
                        { context: { length: base.quadPoints.length } });
                }
            }
            base.it = isType(e.IT, 'name') ? e.IT.value : null;
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

        return { typeMarkupAnnot };
    }
};
