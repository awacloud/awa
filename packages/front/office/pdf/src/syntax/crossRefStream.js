// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Cross-reference stream parser per ISO 32000-2:2020 §7.5.8.
 *
 * @module pdf/syntax/crossRefStream
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from './parser-obj.js';

export const pdfCrossRefStream = {
    name: 'pdfCrossRefStream',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError } = errors;
        const { isType } = parserObj;

        function readBE(bytes, off, len) {
            let v = 0;
            for (let i = 0; i < len; i++) v = (v * 256) + bytes[off + i];
            return v;
        }

        function readInt(entry, label) {
            if (!entry || entry.type !== 'int') {
                throw new ParseError('pdf/xrefstm/missing-int',
                    `XRef stream dict missing required /${label}`,
                    { context: { label } });
            }
            return entry.value;
        }

        function parseCrossRefStream(decoded, dict) {
            if (!(decoded instanceof Uint8Array)) {
                throw new ParseError('pdf/xrefstm/bad-input',
                    'parseCrossRefStream expects Uint8Array');
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/xrefstm/bad-dict',
                    'XRef stream dict must be a typed dict');
            }
            const e = dict.entries;
            if (!e.Type || e.Type.type !== 'name' || e.Type.value !== 'XRef') {
                throw new ParseError('pdf/xrefstm/wrong-type',
                    '/Type must be /XRef',
                    { context: { actual: e.Type && e.Type.value } });
            }

            const W = e.W;
            if (!W || W.type !== 'array' || W.items.length !== 3) {
                throw new ParseError('pdf/xrefstm/bad-W',
                    '/W must be a 3-element array', { context: { items: W && W.items && W.items.length } });
            }
            const w = W.items.map(it => {
                if (it.type !== 'int' || it.value < 0) {
                    throw new ParseError('pdf/xrefstm/bad-W-entry',
                        '/W entries must be non-negative ints');
                }
                return it.value;
            });
            const recordSize = w[0] + w[1] + w[2];
            if (recordSize <= 0) {
                throw new ParseError('pdf/xrefstm/bad-W-zero',
                    '/W must yield at least one non-zero field');
            }

            let index;
            if (e.Index) {
                if (e.Index.type !== 'array' || (e.Index.items.length & 1) !== 0) {
                    throw new ParseError('pdf/xrefstm/bad-Index',
                        '/Index must be an array of (first, count) pairs');
                }
                index = [];
                for (let i = 0; i < e.Index.items.length; i += 2) {
                    const f = e.Index.items[i], c = e.Index.items[i + 1];
                    if (f.type !== 'int' || c.type !== 'int') {
                        throw new ParseError('pdf/xrefstm/bad-Index-entry',
                            '/Index entries must be ints');
                    }
                    index.push([f.value, c.value]);
                }
            } else {
                const size = readInt(e.Size, 'Size');
                index = [[0, size]];
            }

            const entries = {};
            let pos = 0;
            for (const [first, count] of index) {
                for (let k = 0; k < count; k++) {
                    if (pos + recordSize > decoded.length) {
                        throw new ParseError('pdf/xrefstm/truncated',
                            'truncated xref stream payload',
                            { context: { pos, recordSize, length: decoded.length } });
                    }
                    const t  = w[0] > 0 ? readBE(decoded, pos,         w[0]) : 1;
                    const f2 = w[1] > 0 ? readBE(decoded, pos + w[0],  w[1]) : 0;
                    const f3 = w[2] > 0 ? readBE(decoded, pos + w[0] + w[1], w[2]) : 0;
                    pos += recordSize;
                    const num = first + k;
                    if (t === 0) {
                        entries[num] = { type: 0, offset: f2, gen: f3, free: true };
                    } else if (t === 1) {
                        entries[num] = { type: 1, offset: f2, gen: f3, free: false };
                    } else if (t === 2) {
                        entries[num] = {
                            type: 2, objStm: f2, index: f3,
                            free: false, offset: 0, gen: 0
                        };
                    } else {
                        entries[num] = { type: t, offset: 0, gen: 0, free: true };
                    }
                }
            }

            return {
                entries,
                size: e.Size && e.Size.type === 'int' ? e.Size.value : Object.keys(entries).length,
                trailer: dict
            };
        }

        return { parseCrossRefStream };
    }
};
