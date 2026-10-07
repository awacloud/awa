// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PDF permission flag decoding + /Perms field validation.
 *
 * Per ISO 32000-2:2020 Table 24, the /P value in the /Encrypt dictionary is
 * a signed 32-bit integer whose individual bits convey user access
 * permissions. For Security Handler v5/v6 the /Perms field (16 bytes,
 * AES-256-ECB single block, no IV) is decrypted with the File Encryption
 * Key and validated against /P (Algorithm 13, ISO 32000-2 §7.6.4.5).
 *
 * @module pdf/crypto/permissions
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';

export const pdfPermissions = {
    name: 'pdfPermissions',
    dependencies: ['pdfErrors', 'aes'],
    deps: [pdfErrors, aes],
    factory(errors, aesFw) {
        const { EncryptionError } = errors;

        function bytesToWords(b, off, len) {
            const n = len >>> 2;
            const out = new Array(n);
            for (let i = 0; i < n; i++) {
                const j = off + (i << 2);
                out[i] = ((b[j] << 24) | (b[j + 1] << 16) | (b[j + 2] << 8) | b[j + 3]) | 0;
            }
            return out;
        }

        function wordsToBytes(w, into, off) {
            for (let i = 0; i < w.length; i++) {
                const j = off + (i << 2);
                into[j]     = (w[i] >>> 24) & 0xff;
                into[j + 1] = (w[i] >>> 16) & 0xff;
                into[j + 2] = (w[i] >>>  8) & 0xff;
                into[j + 3] =  w[i]         & 0xff;
            }
        }

        function decodePermissions(p) {
            if (typeof p !== 'number' || !Number.isInteger(p)) {
                throw new EncryptionError('pdf/crypto/permissions/bad-input',
                    '/P must be a 32-bit integer',
                    { context: { p } });
            }
            const v = p | 0;
            return {
                raw: v,
                print:            (v & 0x004) !== 0,
                modify:           (v & 0x008) !== 0,
                copy:             (v & 0x010) !== 0,
                annot:            (v & 0x020) !== 0,
                formFill:         (v & 0x100) !== 0,
                accessible:       (v & 0x200) !== 0,
                assemble:         (v & 0x400) !== 0,
                printHighQuality: (v & 0x800) !== 0
            };
        }

        if (!aesFw || typeof aesFw.fn !== 'function') {
            throw new EncryptionError('pdf/crypto/permissions/missing-fw',
                'pdfPermissions requires the fw aes factory');
        }

        function verifyPermsField(typedEncrypt, fek) {
            if (!typedEncrypt || !typedEncrypt.Perms) {
                throw new EncryptionError('pdf/crypto/permissions/missing-perms',
                    '/Perms entry absent in /Encrypt dictionary');
            }
            const perms = typedEncrypt.Perms;
            if (!(perms instanceof Uint8Array) || perms.length !== 16) {
                throw new EncryptionError('pdf/crypto/permissions/bad-perms-length',
                    '/Perms must be a 16-byte string',
                    { context: { length: perms && perms.length } });
            }
            if (!(fek instanceof Uint8Array) || fek.length !== 32) {
                throw new EncryptionError('pdf/crypto/permissions/bad-fek',
                    'File Encryption Key must be 32 bytes for AES-256',
                    { context: { length: fek && fek.length } });
            }
            const cipher = aesFw.fn(bytesToWords(fek, 0, 32), true);
            if (cipher === false || typeof cipher.decrypt !== 'function') {
                throw new EncryptionError('pdf/crypto/permissions/aes-schedule-failed',
                    'AES-256 key schedule failed for /Perms verification');
            }
            const blk = cipher.decrypt(bytesToWords(perms, 0, 16));
            if (blk === false) {
                throw new EncryptionError('pdf/crypto/permissions/aes-decrypt-failed',
                    'AES-256 block decryption failed for /Perms');
            }
            const out = new Uint8Array(16);
            wordsToBytes(blk, out, 0);
            const ok = out[9] === 0x61 && out[10] === 0x64 && out[11] === 0x62;
            const p = ((out[0]) | (out[1] << 8) | (out[2] << 16) | (out[3] << 24)) | 0;
            const encryptMetadata = out[8] === 0x54;
            return { ok, p, encryptMetadata };
        }

        return { decodePermissions, verifyPermsField };
    }
};
