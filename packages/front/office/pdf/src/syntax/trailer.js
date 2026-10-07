// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Trailer typing per ISO 32000-2:2020 §7.5.5.
 *
 * @module pdf/syntax/trailer
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from './parser-obj.js';

export const pdfTrailer = {
    name: 'pdfTrailer',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError } = errors;
        const { isType } = parserObj;

        function typeTrailer(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/trailer/not-dict',
                    'trailer is not a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;

            const size = e.Size;
            if (!size || size.type !== 'int' || size.value < 0) {
                throw new ParseError('pdf/trailer/missing-size',
                    'trailer is missing required /Size entry',
                    { context: { hasSize: !!size } });
            }

            const root = e.Root;
            if (!root || root.type !== 'ref') {
                throw new ParseError('pdf/trailer/missing-root',
                    'trailer is missing required /Root indirect reference',
                    { context: { hasRoot: !!root, type: root && root.type } });
            }

            const out = {
                size: size.value,
                root: { num: root.num, gen: root.gen },
                raw:  dict
            };

            if (e.Info && e.Info.type === 'ref') {
                out.info = { num: e.Info.num, gen: e.Info.gen };
            }
            if (e.Prev && e.Prev.type === 'int') {
                out.prev = e.Prev.value;
            }
            if (e.Encrypt) {
                out.encrypt = e.Encrypt.type === 'ref'
                    ? { num: e.Encrypt.num, gen: e.Encrypt.gen }
                    : e.Encrypt;
            }
            if (e.ID && e.ID.type === 'array' && e.ID.items.length === 2
                    && e.ID.items[0].type === 'string'
                    && e.ID.items[1].type === 'string') {
                out.id = [e.ID.items[0].value, e.ID.items[1].value];
            }

            return out;
        }

        return { typeTrailer };
    }
};
