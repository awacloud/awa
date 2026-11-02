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
 * `decodeTextString(bytes)` decodes a text string such as `/Title`
 * (§ 7.9.2.2): UTF-16BE after `FE FF` (a language escape `U+001B … U+001B`
 * removed), UTF-8 after `EF BB BF`, else PDFDocEncoding (Annex D).
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
        const { ParseError, ContractError } = errors;
        const { isType } = parser;

        // PDFDocEncoding (ISO 32000-2 Annex D, Table D.2): Latin-1 but for
        // 0x18-0x1F, 0x7F and 0x80-0xA0; an undefined code is U+FFFD.
        const PDFDOC = [];
        for (let c = 0; c < 256; c++) PDFDOC.push(c);
        [0x02d8, 0x02c7, 0x02c6, 0x02d9, 0x02dd, 0x02db, 0x02da, 0x02dc].forEach((u, i) => { PDFDOC[0x18 + i] = u; });
        PDFDOC[0x7f] = 0xfffd;
        [0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x0192, 0x2044, 0x2039, 0x203a, 0x2212, 0x2030,
            0x201e, 0x201c, 0x201d, 0x2018, 0x2019, 0x201a, 0x2122, 0xfb01, 0xfb02, 0x0141, 0x0152, 0x0160,
            0x0178, 0x017d, 0x0131, 0x0142, 0x0153, 0x0161, 0x017e, 0xfffd, 0x20ac].forEach((u, i) => { PDFDOC[0x80 + i] = u; });
        PDFDOC[0xad] = 0xfffd;

        /**
         * Decode a pdf text string (§ 7.9.2.2): UTF-16BE after `FE FF`,
         * its language escapes removed; UTF-8 after `EF BB BF`; else
         * PDFDocEncoding.
         *
         * @param {Uint8Array} bytes
         * @returns {string}
         * @throws {ContractError} `pdf/info/bad-text-string` when `bytes`
         *   is not a `Uint8Array`.
         */
        function decodeTextString(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ContractError('pdf/info/bad-text-string',
                    'decodeTextString expects a Uint8Array',
                    { context: { 'typeof': typeof bytes } });
            }
            if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
                let s = '';
                for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
                return s.replace(/\u001b[^\u001b]*\u001b/g, '');
            }
            if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
                return new TextDecoder('utf-8').decode(bytes.subarray(3));
            }
            let s = '';
            for (const c of bytes) s += String.fromCharCode(PDFDOC[c]);
            return s;
        }

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

        return { typeInfo, decodeTextString };
    }
};
