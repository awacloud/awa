// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ISO/TS 32003 AES-GCM wrapper for PDF object encryption.
 *
 * TS 32003 amends ISO 32000-2 to permit AES-GCM (CFM = `AESV4`) as an
 * alternative cipher to AES-CBC in the Standard Security Handler v6.
 * Wire format:
 *     IV (12 bytes) ‖ ciphertext (n bytes) ‖ tag (16 bytes)
 *
 * @module pdf/crypto/aesGcm
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { gcm } from '@awacloud/fw/crypto/mode/gcm.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';

export const pdfAesGcm = {
    name: 'pdfAesGcm',
    dependencies: ['pdfErrors', 'aes', 'gcm', 'bitArray'],
    deps: [pdfErrors, aes, gcm, bitArray],
    factory(errors, aes, gcm, bitArray) {
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

        if (!aes || !gcm || !bitArray) {
            throw new EncryptionError('pdf/crypto/gcm/missing-fw',
                'pdfAesGcm requires aes, gcm, bitArray fw modules');
        }

        function buildCipher(fek) {
            if (!(fek instanceof Uint8Array) || fek.length !== 32) {
                throw new EncryptionError('pdf/crypto/gcm/bad-fek',
                    'File Encryption Key must be 32 bytes (AES-256)',
                    { context: { length: fek && fek.length } });
            }
            const c = aes.fn(bytesToWords(fek, 0, 32), false);
            if (c === false) {
                throw new EncryptionError('pdf/crypto/gcm/aes-schedule-failed',
                    'AES-256 key schedule failed');
            }
            return c;
        }

        function decryptObjectGcm(fek, framed) {
            if (!(framed instanceof Uint8Array) || framed.length < 12 + 16) {
                throw new EncryptionError('pdf/crypto/gcm/bad-input',
                    'AES-GCM framed input must be at least 28 bytes (IV + tag)');
            }
            const cipher = buildCipher(fek);
            const iv = framed.subarray(0, 12);
            const tag = framed.subarray(framed.length - 16);
            const ct  = framed.subarray(12, framed.length - 16);
            const pt = gcm.decrypt(
                cipher,
                bitArray.ui8_to_ba(ct),
                bitArray.ui8_to_ba(iv),
                [],
                bitArray.ui8_to_ba(tag),
                128
            );
            if (pt === false) {
                throw new EncryptionError('pdf/crypto/gcm/tag-mismatch',
                    'AES-GCM authentication tag mismatch');
            }
            return bitArray.ba_to_ui8(pt);
        }

        function encryptObjectGcm(fek, plaintext, ivProvider) {
            if (!(plaintext instanceof Uint8Array)) {
                throw new EncryptionError('pdf/crypto/gcm/bad-plaintext',
                    'plaintext must be Uint8Array');
            }
            if (typeof ivProvider !== 'function') {
                throw new EncryptionError('pdf/crypto/gcm/bad-iv-provider',
                    'ivProvider must be a function returning 12 bytes');
            }
            const iv = ivProvider();
            if (!(iv instanceof Uint8Array) || iv.length !== 12) {
                throw new EncryptionError('pdf/crypto/gcm/bad-iv',
                    'ivProvider must return exactly 12 bytes (96-bit nonce)',
                    { context: { length: iv && iv.length } });
            }
            const cipher = buildCipher(fek);
            const res = gcm.encrypt(
                cipher,
                bitArray.ui8_to_ba(plaintext),
                bitArray.ui8_to_ba(iv),
                [],
                128
            );
            if (res === false) {
                throw new EncryptionError('pdf/crypto/gcm/encrypt-failed',
                    'AES-GCM encryption failed');
            }
            const ct = bitArray.ba_to_ui8(res.ct);
            const tag = bitArray.ba_to_ui8(res.tag);
            const out = new Uint8Array(12 + ct.length + 16);
            out.set(iv, 0);
            out.set(ct, 12);
            out.set(tag, 12 + ct.length);
            return out;
        }

        return { encryptObjectGcm, decryptObjectGcm };
    }
};
