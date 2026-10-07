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

        const KNOWN_PARAMS = new Set(['Size', 'CreationDate', 'ModDate', 'CheckSum']);

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
            for (const k of Object.keys(e)) {
                if (k !== 'Type' && k !== 'Subtype' && k !== 'Params'
                    && k !== 'Length' && k !== 'Filter' && k !== 'DecodeParms'
                    && k !== 'DL') {
                    out._extras[k] = e[k];
                }
            }
            return out;
        }

        function typeParams(dict) {
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
            for (const k of Object.keys(e)) {
                if (!KNOWN_PARAMS.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeEmbeddedFile };
    }
};
