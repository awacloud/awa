// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Embedded File stream typing per ISO 32000-2:2020 §7.11.4.
 *
 * An embedded file stream has `/Type /EmbeddedFile`, an optional
 * `/Subtype` (MIME type encoded as a name), and an optional `/Params`
 * sub-dictionary holding `/Size`, `/CreationDate`, `/ModDate`, and
 * `/CheckSum` (a 16-byte MD5 hash as a hex/byte string).
 *
 * @module pdf/embedded/embeddedFile
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfEmbeddedFile = {
    name: 'pdfEmbeddedFile',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN_PARAMS = new Set(['Size', 'CreationDate', 'ModDate', 'CheckSum', 'Mac']);

        function typeEmbeddedFile(stream) {
            if (!isType(stream, 'stream')) {
                throw new ParseError('pdf/embedded/not-stream',
                    'embedded file must be a stream',
                    { context: { type: stream && stream.type } });
            }
            if (!stream.dict || stream.dict.type !== 'dict') {
                throw new ParseError('pdf/embedded/no-dict',
                    'embedded file stream missing its dict');
            }
            const e = stream.dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'EmbeddedFile')) {
                throw new ParseError('pdf/embedded/bad-type',
                    '/Type must be /EmbeddedFile',
                    { context: { actual: e.Type.value } });
            }
            const out = { bytes: stream.raw, raw: stream, _extras: {} };
            if (e.Subtype) {
                if (e.Subtype.type !== 'name') {
                    throw new ParseError('pdf/embedded/bad-subtype',
                        '/Subtype must be a name',
                        { context: { type: e.Subtype.type } });
                }
                out.subtype = e.Subtype.value;
            }
            if (e.Params) {
                if (e.Params.type !== 'dict') {
                    throw new ParseError('pdf/embedded/bad-params',
                        '/Params must be a dictionary',
                        { context: { type: e.Params.type } });
                }
                out.params = typeParams(e.Params);
            }
            // The stream entries (Table 5) `bytes` is encoded with, each
            // only when present: an integer or a name by its value, an
            // array or a dictionary as read.
            if (isType(e.Length, 'int')) out.length = e.Length.value;
            if (isType(e.Filter, 'name')) out.filter = e.Filter.value;
            else if (isType(e.Filter, 'array')) out.filter = e.Filter;
            if (isType(e.DecodeParms, 'dict') || isType(e.DecodeParms, 'array')) {
                out.decodeParms = e.DecodeParms;
            }
            if (isType(e.DL, 'int')) out.dl = e.DL.value;
            for (const k of Object.keys(e)) {
                if (k !== 'Type' && k !== 'Subtype' && k !== 'Params'
                    && k !== 'Length' && k !== 'Filter' && k !== 'DecodeParms'
                    && k !== 'DL') {
                    out._extras[k] = e[k];
                }
            }
            return out;
        }

        /**
         * Type an embedded file parameter dictionary (ISO 32000-2 Table 45):
         * `size`, `creationDate`, `modDate`, `checkSum` and `mac` (the Mac OS
         * dictionary as read, `null` for another value), each present only
         * when the key is; the other keys in `_extras`.
         */
        function typeParams(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/embedded/bad-params',
                    '/Params must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };
            if (e.Size && (e.Size.type === 'int' || e.Size.type === 'real')) {
                out.size = e.Size.value | 0;
            }
            if (e.CreationDate && e.CreationDate.type === 'string') {
                out.creationDate = e.CreationDate.value;
            }
            if (e.ModDate && e.ModDate.type === 'string') {
                out.modDate = e.ModDate.value;
            }
            if (e.CheckSum && e.CheckSum.type === 'string') {
                out.checkSum = e.CheckSum.value;
            }
            if (e.Mac !== undefined) out.mac = isType(e.Mac, 'dict') || isType(e.Mac, 'ref') ? e.Mac : null;
            for (const k of Object.keys(e)) {
                if (!KNOWN_PARAMS.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeEmbeddedFile, typeEmbeddedFileParams: typeParams };
    }
};
