// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview FileAttachment annotation per ISO 32000-2:2020 §12.5.6.15.
 *
 * Subtype-specific entries:
 *   /FS    dict|ref — file-specification (required)
 *   /Name  name     — icon (PushPin, Graph, Paperclip, Tag)
 *
 * @module pdf/annot/fileAttach
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfFileAttachAnnot = {
    name: 'pdfFileAttachAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['FS', 'Name']);

        function typeFileAttachAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'FileAttachment') {
                throw new ParseError('pdf/annot/fileattach/bad-subtype',
                    '/Subtype must be /FileAttachment',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            if (e.FS && e.FS.type !== 'dict' && e.FS.type !== 'ref') {
                throw new ParseError('pdf/annot/fileattach/bad-fs',
                    '/FS must be a dictionary or indirect reference',
                    { context: { kind: e.FS.type } });
            }
            base.fs       = e.FS || null;
            base.iconName = isType(e.Name, 'name') ? e.Name.value : null;
            captureExtras(base, dict, KNOWN);
            return base;
        }

        return { typeFileAttachAnnot };
    }
};
