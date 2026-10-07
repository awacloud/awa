// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Object Stream parser per ISO 32000-2:2020 §7.5.7.
 *
 * @module pdf/syntax/objStream
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from './parser-obj.js';
import { pdfTokenizer } from './tokenizer.js';
import { pdfParser } from './parser.js';

export const pdfObjStream = {
    name: 'pdfObjStream',
    dependencies: ['pdfErrors', 'pdfParserObj', 'pdfTokenizer', 'pdfParser'],
    deps: [pdfErrors, pdfParserObj, pdfTokenizer, pdfParser],
    factory(errors, parserObj, tokenizerMod, parserMod) {
        const { ParseError } = errors;
        const { isType } = parserObj;
        const tokenize = tokenizerMod.tokenize;
        const parseObject = parserMod.parseObject;

        function readInt(entry, label) {
            if (!entry || entry.type !== 'int') {
                throw new ParseError('pdf/objstm/missing-int',
                    `ObjStm dict missing required /${label}`,
                    { context: { label, hasEntry: !!entry, type: entry && entry.type } });
            }
            return entry.value;
        }

        function parseObjectStream(decoded, dict) {
            if (!(decoded instanceof Uint8Array)) {
                throw new ParseError('pdf/objstm/bad-input',
                    'parseObjectStream expects Uint8Array',
                    { context: { typeof: typeof decoded } });
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/objstm/bad-dict',
                    'ObjStm dict must be a typed dict');
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'ObjStm')) {
                throw new ParseError('pdf/objstm/wrong-type',
                    '/Type must be /ObjStm', { context: { actual: e.Type.value } });
            }
            const N = readInt(e.N, 'N');
            const First = readInt(e.First, 'First');
            if (N < 0) {
                throw new ParseError('pdf/objstm/bad-N',
                    '/N must be non-negative', { context: { N } });
            }
            if (First < 0 || First > decoded.length) {
                throw new ParseError('pdf/objstm/bad-First',
                    '/First out of payload range',
                    { context: { First, length: decoded.length } });
            }

            const header = tokenize(decoded, { start: 0, end: First });
            const nums = new Array(N);
            const offs = new Array(N);
            for (let i = 0; i < N; i++) {
                const tNum = header.next();
                const tOff = header.next();
                if (!tNum || tNum.kind !== 'int' || !tOff || tOff.kind !== 'int') {
                    throw new ParseError('pdf/objstm/bad-pair',
                        'ObjStm header expects N pairs of integers',
                        { context: { index: i } });
                }
                nums[i] = tNum.value;
                offs[i] = tOff.value;
            }

            const out = new Array(N);
            for (let i = 0; i < N; i++) {
                const start = First + offs[i];
                const end = (i + 1 < N) ? (First + offs[i + 1]) : decoded.length;
                if (start < First || end > decoded.length || start > end) {
                    throw new ParseError('pdf/objstm/bad-offset',
                        'ObjStm member offset out of range',
                        { context: { index: i, start, end, length: decoded.length } });
                }
                const tok = tokenize(decoded, { start, end });
                const value = parseObject(tok);
                out[i] = { num: nums[i], gen: 0, value };
            }
            return out;
        }

        return { parseObjectStream };
    }
};
