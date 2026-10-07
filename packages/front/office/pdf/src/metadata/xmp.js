// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview XMP metadata stream typing per ISO 32000-2:2020 §14.3.2.
 *
 * The Catalog's `/Metadata` entry points to a stream object with
 * `/Type /Metadata` and `/Subtype /XML`. The stream content is an XMP
 * packet (an RDF/XML document); RDF parsing is out of scope here — we
 * only expose the raw bytes and the dict typing.
 *
 * @module pdf/metadata/xmp
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfXmp = {
    name: 'pdfXmp',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        function typeXmpStream(stream) {
            if (!isType(stream, 'stream')) {
                throw new ParseError('pdf/xmp/not-stream',
                    'XMP metadata must be a stream',
                    { context: { type: stream && stream.type } });
            }
            if (!stream.dict || stream.dict.type !== 'dict') {
                throw new ParseError('pdf/xmp/no-dict',
                    'XMP stream missing dict');
            }
            const e = stream.dict.entries;
            if (!e.Type || e.Type.type !== 'name' || e.Type.value !== 'Metadata') {
                throw new ParseError('pdf/xmp/bad-type',
                    '/Type must be /Metadata',
                    { context: { actual: e.Type && e.Type.value } });
            }
            if (!e.Subtype || e.Subtype.type !== 'name' || e.Subtype.value !== 'XML') {
                throw new ParseError('pdf/xmp/bad-subtype',
                    '/Subtype must be /XML',
                    { context: { actual: e.Subtype && e.Subtype.value } });
            }
            return {
                type: 'Metadata',
                subtype: 'XML',
                bytes: stream.raw,
                raw: stream
            };
        }

        return { typeXmpStream };
    }
};
