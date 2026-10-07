// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview DSIG — OpenType Digital Signature table.
 *
 * Strict factory body.
 *
 * @module fonts/extra/dsig
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';

export const extraDsig = {
    name: 'extraDsig',
    dependencies: ['fontErrors', 'fontReader'],
    deps: [fontErrors, fontReader],
    factory(errors, reader) {
        const DSIG_VERSION_CONST = 1;
        const DSIG_FORMAT_PKCS7_CONST = 1;

        const { ParseError } = errors;
        const { BinaryReader } = reader;

        /**
         * Parse the DSIG table.
         *
         * @param {Uint8Array} bytes — raw DSIG table bytes
         */
        function parseDsig(bytes) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/dsig-input',
                    'parseDsig expects a Uint8Array', { context: { actual: typeof bytes } });
            if (bytes.length < 8)
                throw new ParseError('fonts/dsig-short',
                    'DSIG table truncated', { context: { length: bytes.length } });
            const r = new BinaryReader(bytes);
            const version = r.readUint32();
            if (version !== DSIG_VERSION_CONST)
                throw new ParseError('fonts/dsig-version',
                    `unsupported DSIG version ${version}`,
                    { context: { version } });
            const numSignatures = r.readUint16();
            const flags = r.readUint16();

            if (8 + numSignatures * 12 > bytes.length)
                throw new ParseError('fonts/dsig-records-truncated',
                    'DSIG signature records run past end of table',
                    { context: { numSignatures, tableLength: bytes.length } });

            const records = new Array(numSignatures);
            for (let i = 0; i < numSignatures; i++) {
                records[i] = {
                    format: r.readUint32(),
                    length: r.readUint32(),
                    offset: r.readUint32()
                };
            }

            const signatures = new Array(numSignatures);
            for (let i = 0; i < numSignatures; i++) {
                const rec = records[i];
                if (rec.offset + rec.length > bytes.length)
                    throw new ParseError('fonts/dsig-block-truncated',
                        `DSIG signature block #${i} extends past table`,
                        { context: { index: i, offset: rec.offset, length: rec.length, tableLength: bytes.length } });
                if (rec.length < 8)
                    throw new ParseError('fonts/dsig-block-short',
                        `DSIG signature block #${i} too short for header`,
                        { context: { index: i, length: rec.length } });
                const sub = r.sub(rec.offset, rec.length);
                const reserved1 = sub.readUint16();
                const reserved2 = sub.readUint16();
                const signatureLength = sub.readUint32();
                if (8 + signatureLength > rec.length)
                    throw new ParseError('fonts/dsig-blob-truncated',
                        `DSIG signature blob #${i} declared length exceeds block`,
                        { context: { index: i, signatureLength, blockLength: rec.length } });
                const signature = sub.readBytesCopy(signatureLength);
                signatures[i] = {
                    format: rec.format,
                    length: rec.length,
                    offset: rec.offset,
                    reserved1, reserved2,
                    signatureLength,
                    signature
                };
            }

            return { version, numSignatures, flags, signatures };
        }

        return {
            parseDsig,
            DSIG_VERSION: DSIG_VERSION_CONST,
            DSIG_FORMAT_PKCS7: DSIG_FORMAT_PKCS7_CONST
        };
    }
};

