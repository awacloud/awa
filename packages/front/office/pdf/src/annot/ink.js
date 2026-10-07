// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Ink annotation per ISO 32000-2:2020 §12.5.6.13.
 *
 * Subtype-specific entries:
 *   /InkList  array of arrays of numbers — each inner array is a stroke
 *                                          as x1 y1 x2 y2 …
 *   /BS       border style (on base)
 *
 * @module pdf/annot/ink
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfInkAnnot = {
    name: 'pdfInkAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType: _isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['InkList']);

        function typeInkAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'Ink') {
                throw new ParseError('pdf/annot/ink/bad-subtype',
                    '/Subtype must be /Ink',
                    { context: { actual: base.subtype } });
            }
            base.inkList = toInkList(dict.entries.InkList);
            captureExtras(base, dict, KNOWN);
            return base;
        }

        function toInkList(v) {
            if (!v) return [];
            if (v.type !== 'array') {
                throw new ParseError('pdf/annot/ink/bad-inklist',
                    '/InkList must be an array of arrays',
                    { context: { kind: v.type } });
            }
            const out = [];
            for (const stroke of v.items) {
                if (!stroke || stroke.type !== 'array') {
                    throw new ParseError('pdf/annot/ink/bad-stroke',
                        '/InkList entries must be arrays of numbers',
                        { context: { kind: stroke && stroke.type } });
                }
                const nums = [];
                for (const it of stroke.items) {
                    if (!it || (it.type !== 'int' && it.type !== 'real')) {
                        throw new ParseError('pdf/annot/ink/bad-coord',
                            '/InkList stroke entries must be numbers',
                            { context: { kind: it && it.type } });
                    }
                    nums.push(it.value);
                }
                out.push(nums);
            }
            return out;
        }

        return { typeInkAnnot };
    }
};
