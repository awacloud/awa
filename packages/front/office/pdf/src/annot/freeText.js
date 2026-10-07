// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview FreeText annotation per ISO 32000-2:2020 §12.5.6.6.
 *
 * Subtype-specific entries:
 *   /DA  string  — default appearance (required)
 *   /Q   int     — quadding (0 left, 1 center, 2 right)
 *   /RC  string  — rich-text contents (XHTML)
 *   /DS  string  — default style (CSS-like)
 *   /CL  array   — callout-line coordinates (4 or 6 numbers)
 *   /IT  name    — intent (FreeText, FreeTextCallout, FreeTextTypeWriter)
 *   /RD  array   — rectangle differences
 *   /LE  name    — line ending (callout)
 *
 * @module pdf/annot/freeText
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfFreeTextAnnot = {
    name: 'pdfFreeTextAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['DA', 'Q', 'RC', 'DS', 'CL', 'IT', 'RD', 'LE']);

        function typeFreeTextAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'FreeText') {
                throw new ParseError('pdf/annot/freetext/bad-subtype',
                    '/Subtype must be /FreeText',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            base.da = isType(e.DA, 'string') ? e.DA.value : null;
            base.q  = (e.Q && (e.Q.type === 'int' || e.Q.type === 'real'))
                ? (e.Q.value | 0) : 0;
            base.rc = isType(e.RC, 'string') ? e.RC.value : null;
            base.ds = isType(e.DS, 'string') ? e.DS.value : null;
            base.cl = toNumArray(e.CL, 'pdf/annot/freetext/bad-cl');
            base.it = isType(e.IT, 'name') ? e.IT.value : null;
            base.rd = toNumArray(e.RD, 'pdf/annot/freetext/bad-rd');
            base.le = isType(e.LE, 'name') ? e.LE.value : null;
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

        return { typeFreeTextAnnot };
    }
};
