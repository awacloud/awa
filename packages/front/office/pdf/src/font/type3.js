// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Type 3 user-defined font typing per ISO 32000-2:2020 §9.6.4.
 *
 * Unlike Type1/TrueType/CIDFont (which delegate to `@awacloud/fonts`),
 * Type 3 fonts are **PDF-specific** — each glyph is defined by a
 * content stream in the `/CharProcs` dict, not a portable font format.
 *
 * @module pdf/font/type3
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfType3 = {
    name: 'pdfType3',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        function toArray(v, n) {
            if (!v || v.type !== 'array' || v.items.length !== n) return null;
            const r = new Array(n);
            for (let i = 0; i < n; i++) {
                const it = v.items[i];
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                r[i] = it.value;
            }
            return r;
        }

        function typeType3(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/type3/not-dict',
                    'Type 3 font must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (!e.Subtype || e.Subtype.type !== 'name' || e.Subtype.value !== 'Type3') {
                throw new ParseError('pdf/type3/wrong-subtype',
                    '/Subtype must be /Type3',
                    { context: { actual: e.Subtype && e.Subtype.value } });
            }
            return {
                subtype: 'Type3',
                bbox:    toArray(e.FontBBox, 4),
                matrix:  toArray(e.FontMatrix, 6) || [0.001, 0, 0, 0.001, 0, 0],
                charProcs: e.CharProcs && e.CharProcs.type === 'dict'
                    ? { ...e.CharProcs.entries } : {},
                encoding:  e.Encoding || null,
                firstChar: e.FirstChar && e.FirstChar.type === 'int' ? e.FirstChar.value : null,
                lastChar:  e.LastChar  && e.LastChar.type  === 'int' ? e.LastChar.value  : null,
                widths:    e.Widths && e.Widths.type === 'array'
                    ? e.Widths.items.filter(it => it.type === 'int' || it.type === 'real')
                                    .map(it => it.value)
                    : null,
                fontDescriptor: e.FontDescriptor || null,
                resources:      e.Resources || null,
                raw: dict
            };
        }

        return { typeType3 };
    }
};
