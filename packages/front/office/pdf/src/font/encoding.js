// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Font encoding resolution per ISO 32000-2:2020 §9.6.5.
 *
 * A simple Font's `/Encoding` entry is either a name or a dict with
 * `{ BaseEncoding?: name, Differences?: array }`.
 *
 * `resolveEncoding(entry, lookupNamed)` returns a 256-entry array of
 * glyph names (or `null` for unmapped slots).
 *
 * @module pdf/font/encoding
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';

export const pdfFontEncoding = {
    name: 'pdfFontEncoding',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ParseError } = errors;

        function isType(v, kind) { return !!(v && v.type === kind); }

        function applyDifferences(diffsArr, table) {
            if (diffsArr.type !== 'array') {
                throw new ParseError('pdf/encoding/bad-differences',
                    '/Differences must be an array');
            }
            let cur = 0;
            for (const it of diffsArr.items) {
                if (it.type === 'int') cur = it.value;
                else if (it.type === 'name') {
                    if (cur >= 0 && cur < 256) table[cur] = it.value;
                    cur++;
                } else {
                    throw new ParseError('pdf/encoding/bad-differences-entry',
                        '/Differences entries must be ints or names',
                        { context: { kind: it.type } });
                }
            }
        }

        function resolveEncoding(entry, lookupNamed) {
            const table = new Array(256).fill(null);
            let baseName;

            if (!entry) baseName = 'StandardEncoding';
            else if (entry.type === 'name') baseName = entry.value;
            else if (entry.type === 'dict') {
                const be = entry.entries.BaseEncoding;
                if (be) {
                    if (be.type !== 'name') {
                        throw new ParseError('pdf/encoding/bad-base',
                            'BaseEncoding must be a name',
                            { context: { type: be.type } });
                    }
                    baseName = be.value;
                } else {
                    baseName = 'StandardEncoding';
                }
            } else {
                throw new ParseError('pdf/encoding/bad-shape',
                    '/Encoding must be a name or a dict',
                    { context: { type: entry.type } });
            }

            if (typeof lookupNamed === 'function') {
                const named = lookupNamed(baseName);
                if (named) {
                    for (let i = 0; i < 256 && i < named.length; i++) {
                        table[i] = named[i] || null;
                    }
                }
            }

            if (isType(entry, 'dict') && entry.entries.Differences) {
                applyDifferences(entry.entries.Differences, table);
            }
            return table;
        }

        return { resolveEncoding };
    }
};
