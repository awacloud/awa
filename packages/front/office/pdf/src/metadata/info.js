// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Info dict typing per ISO 32000-2:2020 §14.3.3.
 *
 * The trailer's `/Info` entry points to the document information
 * dictionary. PDF 2.0 deprecates it in favour of XMP metadata, but
 * readers are expected to tolerate its presence. Standard entries:
 *   /Title /Author /Subject /Keywords /Creator /Producer
 *   /CreationDate /ModDate /Trapped.
 *
 * @module pdf/metadata/info
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfInfo = {
    name: 'pdfInfo',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const STRINGY = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'];
        const DATEY   = ['CreationDate', 'ModDate'];
        const KNOWN   = new Set(STRINGY.concat(DATEY, ['Trapped']));

        function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

        function typeInfo(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/info/not-dict',
                    'Info must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };

            for (const k of STRINGY) {
                if (e[k] !== undefined) {
                    if (e[k].type !== 'string') {
                        throw new ParseError('pdf/info/bad-string',
                            '/' + k + ' must be a string',
                            { context: { key: k, type: e[k].type } });
                    }
                    out[lower(k)] = e[k].value;
                }
            }
            for (const k of DATEY) {
                if (e[k] !== undefined) {
                    if (e[k].type !== 'string') {
                        throw new ParseError('pdf/info/bad-date',
                            '/' + k + ' must be a date string',
                            { context: { key: k, type: e[k].type } });
                    }
                    out[lower(k)] = e[k].value;
                }
            }
            if (e.Trapped !== undefined) {
                if (e.Trapped.type === 'name') {
                    out.trapped = e.Trapped.value;
                } else if (e.Trapped.type === 'bool') {
                    out.trapped = e.Trapped.value ? 'True' : 'False';
                } else {
                    throw new ParseError('pdf/info/bad-trapped',
                        '/Trapped must be a name (True|False|Unknown)',
                        { context: { type: e.Trapped.type } });
                }
            }

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeInfo };
    }
};
