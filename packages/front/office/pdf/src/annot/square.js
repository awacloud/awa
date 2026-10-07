// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shape annotations per ISO 32000-2:2020 §12.5.6.7–9.
 *
 * Subtypes handled: Square, Circle, Line, Polygon, PolyLine.
 *
 * Common-ish entries:
 *   /BS    border style dict       (already on base; explicit here)
 *   /IC    interior color array
 *   /LE    line-ending styles array of 2 names
 *
 * Square/Circle: /RD (rectangle differences).
 * Line:          /L (x1,y1,x2,y2), /LL, /LLE, /Cap, /CP, /Measure, /IT.
 * Polygon/PolyLine: /Vertices, /Measure, /IT, /Path.
 *
 * @module pdf/annot/square
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfShapeAnnot = {
    name: 'pdfShapeAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const VALID = new Set(['Square', 'Circle', 'Line', 'Polygon', 'PolyLine']);
        const KNOWN = new Set([
            'RD', 'IC', 'L', 'LE', 'LL', 'LLE', 'Cap', 'CP', 'Measure', 'IT',
            'Vertices', 'Path'
        ]);

        function typeShapeAnnot(dict, expected) {
            if (!VALID.has(expected)) {
                throw new ParseError('pdf/annot/shape/bad-expected',
                    'unsupported shape subtype',
                    { context: { expected } });
            }
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== expected) {
                throw new ParseError('pdf/annot/shape/bad-subtype',
                    '/Subtype mismatch for shape typer',
                    { context: { expected, actual: base.subtype } });
            }
            const e = dict.entries;

            base.ic = toNumArray(e.IC, 'pdf/annot/shape/bad-ic');

            if (expected === 'Square' || expected === 'Circle') {
                base.rd = toNumArray(e.RD, 'pdf/annot/shape/bad-rd');
            }
            if (expected === 'Line') {
                base.l   = toNumArray(e.L, 'pdf/annot/shape/bad-l');
                base.le  = toNameArray(e.LE, 'pdf/annot/shape/bad-le');
                base.ll  = toNum(e.LL, null);
                base.lle = toNum(e.LLE, null);
                base.cap = isType(e.Cap, 'bool') ? !!e.Cap.value : false;
                base.cp  = isType(e.CP, 'name') ? e.CP.value : null;
                base.it  = isType(e.IT, 'name') ? e.IT.value : null;
                base.measure = isType(e.Measure, 'dict') ? e.Measure : null;
            }
            if (expected === 'Polygon' || expected === 'PolyLine') {
                base.vertices = toNumArray(e.Vertices, 'pdf/annot/shape/bad-vertices');
                base.le       = toNameArray(e.LE, 'pdf/annot/shape/bad-le');
                base.it       = isType(e.IT, 'name') ? e.IT.value : null;
                base.measure  = isType(e.Measure, 'dict') ? e.Measure : null;
                base.path     = isType(e.Path, 'array') ? e.Path : null;
            }

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

        function toNameArray(v, errCode) {
            if (!v) return null;
            if (v.type !== 'array') {
                throw new ParseError(errCode,
                    'expected an array of names',
                    { context: { kind: v.type } });
            }
            const out = [];
            for (const it of v.items) {
                if (!it || it.type !== 'name') {
                    throw new ParseError(errCode,
                        'array entries must be names',
                        { context: { kind: it && it.type } });
                }
                out.push(it.value);
            }
            return out;
        }

        function toNum(v, dflt) {
            if (!v) return dflt;
            if (v.type !== 'int' && v.type !== 'real') return dflt;
            return v.value;
        }

        return { typeShapeAnnot };
    }
};
