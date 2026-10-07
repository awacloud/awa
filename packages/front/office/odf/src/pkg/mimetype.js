// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ODF mimetype file — must be the first ZIP entry, STORED.
 *
 * The `mimetype` file in an ODF package is a tiny ASCII file containing
 * the document's MIME type (e.g. `application/vnd.oasis.opendocument.text`).
 * It is stored uncompressed and must be the first entry in the ZIP so that
 * naive file-type sniffers can identify the document type by inspecting
 * the first ~38 bytes after the local file header.
 *
 * @module odf/pkg/mimetype
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';

export const pkgMimetype = {
    name: 'pkgMimetype',
    dependencies: ['odfErrors', 'odfShared'],
    deps: [odfErrors, odfShared],

    factory(errors, shared) {
        const { ParseError, ContractError } = errors;
        const { CT, encodeText, decodeText } = shared;
        const CT_ODT = CT.ODT;
        const CT_ODS = CT.ODS;
        const CT_ODP = CT.ODP;
        const KNOWN = [CT_ODT, CT_ODS, CT_ODP];

        /**
         * Parse mimetype bytes into a trimmed string.
         *
         * @param {Uint8Array} bytes
         * @returns {string}
         */
        function parse(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ContractError('odf/contract-error/mimetype',
                    'mimetype: expected Uint8Array',
                    { context: { module: 'mimetype', argument: 'bytes' } });
            }
            const s = decodeText(bytes).trim();
            if (!s) throw new ParseError('odf/parse-error/mimetype',
                'mimetype: empty',
                { context: { module: 'mimetype' } });
            return s;
        }

        /**
         * Render a mimetype string to bytes (UTF-8, no trailing newline).
         *
         * @param {string} mimetype
         * @returns {Uint8Array}
         */
        function render(mimetype) {
            if (typeof mimetype !== 'string' || !mimetype) {
                throw new ContractError('odf/contract-error/mimetype',
                    'mimetype: expected non-empty string',
                    { context: { module: 'mimetype', argument: 'mimetype' } });
            }
            return encodeText(mimetype);
        }

        function isKnown(mt) { return KNOWN.indexOf(mt) >= 0; }

        return {
            parse, render, isKnown,
            CT_ODT, CT_ODS, CT_ODP
        };
    }
};
