// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Linearization Parameter Dictionary typing per ISO
 * 32000-2:2020 Annex F.2.
 *
 * If the first indirect object in a PDF is a dictionary whose first
 * entry is `/Linearized`, the file is "fast web view" optimized. The
 * dictionary contains:
 *   /Linearized  — version number (required, usually 1.0)
 *   /L           — file length (required)
 *   /H           — hint stream offset/length array (required)
 *   /O           — object number of the first page (required)
 *   /E           — end of first page (required)
 *   /N           — number of pages (required)
 *   /T           — offset of first entry in main xref table (required)
 *   /P           — page number of the first page (optional, default 0)
 *
 * Read-only: `pdf.write` does not linearize (no writer module references this module), and
 * `extra/linearization-write` only builds the `/Linearized` dictionary and a
 * zero-length hint-stream placeholder.
 *
 * @module pdf/linearization/linearization
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfLinearization = {
    name: 'pdfLinearization',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set(['Linearized', 'L', 'H', 'O', 'E', 'N', 'T', 'P']);

        function int(v, key) {
            if (!v || (v.type !== 'int' && v.type !== 'real')) {
                throw new ParseError('pdf/linearization/missing-' + key.toLowerCase(),
                    '/' + key + ' must be a number',
                    { context: { type: v && v.type } });
            }
            return v.value | 0;
        }
        function num(v, key) {
            if (!v || (v.type !== 'int' && v.type !== 'real')) {
                throw new ParseError('pdf/linearization/missing-' + key.toLowerCase(),
                    '/' + key + ' must be a number',
                    { context: { type: v && v.type } });
            }
            return +v.value;
        }

        function typeLinearizationDict(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/linearization/not-dict',
                    'Linearization params must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (!e.Linearized) {
                throw new ParseError('pdf/linearization/not-linearized',
                    'dictionary has no /Linearized entry');
            }
            const out = { raw: dict, _extras: {} };
            out.version = num(e.Linearized, 'Linearized');
            out.length  = int(e.L, 'L');
            out.firstPageObject = int(e.O, 'O');
            out.endOfFirstPage  = int(e.E, 'E');
            out.numberOfPages   = int(e.N, 'N');
            out.mainXrefOffset  = int(e.T, 'T');

            if (!e.H || e.H.type !== 'array') {
                throw new ParseError('pdf/linearization/missing-h',
                    '/H must be an array',
                    { context: { type: e.H && e.H.type } });
            }
            out.hintOffsets = e.H.items
                .filter((x) => x.type === 'int' || x.type === 'real')
                .map((x) => x.value);
            if (out.hintOffsets.length < 2) {
                throw new ParseError('pdf/linearization/bad-h',
                    '/H must hold at least two numbers',
                    { context: { length: out.hintOffsets.length } });
            }

            if (e.P !== undefined) {
                out.firstPageNumber = int(e.P, 'P');
            }

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeLinearizationDict };
    }
};
