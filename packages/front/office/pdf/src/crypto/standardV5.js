// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard Security Handler v5 (V=5, R=5).
 *
 * Implements Algorithm 2.A (ISO 32000-1 §7.6.4.3 / Adobe Extension Level 3),
 * the precursor to the PDF 2.0 v6 handler. SHA-256 over
 * password ‖ validation-salt (and ‖ /U on owner-password path);
 * no hardening loop. AES-256-CBC with a zero IV decrypts /OE or /UE.
 *
 * @module pdf/crypto/standardV5
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { pdfAesGcm } from './aesGcm.js';

export const pdfStandardV5 = {
    name: 'pdfStandardV5',
    dependencies: ['pdfErrors', 'aes', 'cbc', 'sha256', 'bitArray', 'pdfAesGcm'],
    deps: [pdfErrors, aes, cbc, sha256, bitArray, pdfAesGcm],
    factory(errors, aes, cbc, sha256, bitArray, pdfAesGcm) {
        const { EncryptionError } = errors;

        if (!aes || !cbc || !sha256 || !bitArray) {
            throw new EncryptionError('pdf/crypto/v5/missing-fw',
                'pdfStandardV5 requires aes, cbc, sha256, bitArray fw modules');
        }
        // pdfAesGcm is optional at construction (some callers do not need
        // AESV4 support). The dispatcher below will throw a clearer error
        // if a caller actually requests AESV4 without having provided it.

        const ZERO_IV = new Uint8Array(16);

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

        function passwordToBytes(password) {
            if (password === undefined || password === null || password === '') {
                return new Uint8Array(0);
            }
            if (password instanceof Uint8Array) {
                return password.length > 127 ? password.subarray(0, 127) : password;
            }
            if (typeof password === 'string') {
                const enc = new TextEncoder().encode(password);
                return enc.length > 127 ? enc.subarray(0, 127) : enc;
            }
            throw new EncryptionError('pdf/crypto/v5/bad-password',
                'password must be string or Uint8Array');
        }

        function sha256Bytes(bytes) {
            const ba = bitArray.ui8_to_ba(bytes);
            const out = sha256.hash(ba);
            return bitArray.ba_to_ui8(out);
        }

        function concatBytes(parts) {
            let n = 0;
            for (const p of parts) n += p.length;
            const out = new Uint8Array(n);
            let off = 0;
            for (const p of parts) { out.set(p, off); off += p.length; }
            return out;
        }

        function aesCbcDecrypt(key, iv, ciphertext) {
            if (ciphertext.length % 16 !== 0) {
                throw new EncryptionError('pdf/crypto/v5/bad-ciphertext-len',
                    'AES-CBC ciphertext length must be a multiple of 16',
                    { context: { length: ciphertext.length } });
            }
            const cipher = aes.fn(bytesToWords(key, 0, 32), true);
            if (cipher === false) {
                throw new EncryptionError('pdf/crypto/v5/aes-schedule-failed',
                    'AES-256 key schedule failed');
            }
            const ctWords = bytesToWords(ciphertext, 0, ciphertext.length);
            const ivWords = bytesToWords(iv, 0, 16);
            const ptWords = cbc.decrypt(cipher, ctWords, ivWords);
            if (ptWords === false) {
                throw new EncryptionError('pdf/crypto/v5/cbc-decrypt-failed',
                    'AES-256-CBC decryption failed');
            }
            const out = new Uint8Array(ciphertext.length);
            wordsToBytes(ptWords, out, 0);
            return out;
        }

        function stripPkcs7(buf) {
            if (buf.length === 0) return buf;
            const pad = buf[buf.length - 1];
            if (pad < 1 || pad > 16 || pad > buf.length) return buf;
            for (let i = buf.length - pad; i < buf.length; i++) {
                if (buf[i] !== pad) return buf;
            }
            return buf.subarray(0, buf.length - pad);
        }

        function tryPassword(typedEncrypt, password, isOwner) {
            const O = typedEncrypt.O, U = typedEncrypt.U;
            const OE = typedEncrypt.OE, UE = typedEncrypt.UE;
            if (!(O instanceof Uint8Array) || O.length < 48 ||
                !(U instanceof Uint8Array) || U.length < 48) {
                throw new EncryptionError('pdf/crypto/v5/bad-O-U',
                    '/O and /U must be at least 48 bytes for v5');
            }
            const pw = passwordToBytes(password);
            const target = isOwner ? O : U;
            const valSalt = target.subarray(32, 40);
            const keySalt = target.subarray(40, 48);
            let h;
            if (isOwner) {
                h = sha256Bytes(concatBytes([pw, valSalt, U.subarray(0, 48)]));
                for (let i = 0; i < 32; i++) {
                    if (h[i] !== O[i]) return { fileEncryptionKey: null };
                }
            } else {
                h = sha256Bytes(concatBytes([pw, valSalt]));
                for (let i = 0; i < 32; i++) {
                    if (h[i] !== U[i]) return { fileEncryptionKey: null };
                }
            }
            const intermediate = isOwner
                ? sha256Bytes(concatBytes([pw, keySalt, U.subarray(0, 48)]))
                : sha256Bytes(concatBytes([pw, keySalt]));
            const oeue = isOwner ? OE : UE;
            if (!(oeue instanceof Uint8Array) || oeue.length !== 32) {
                throw new EncryptionError('pdf/crypto/v5/bad-OE-UE',
                    '/OE and /UE must be exactly 32 bytes for v5',
                    { context: { length: oeue && oeue.length } });
            }
            const fek = aesCbcDecrypt(intermediate, ZERO_IV, oeue);
            return { fileEncryptionKey: fek };
        }

        function methodOf(typedEncrypt, fallback) {
            const m = typedEncrypt && typedEncrypt.method;
            if (m === 'AESV3' || m === 'AESV4') return m;
            return fallback || 'AESV3';
        }
        function requireGcm() {
            if (!pdfAesGcm || typeof pdfAesGcm.decryptObjectGcm !== 'function') {
                throw new EncryptionError('pdf/crypto/v5/missing-gcm',
                    'AESV4 requires pdfAesGcm dependency');
            }
            return pdfAesGcm;
        }
        function decryptString(typedEncrypt, fek, _objNum, _gen, ciphertext) {
            const method = methodOf(typedEncrypt, 'AESV3');
            if (method === 'AESV4') {
                return requireGcm().decryptObjectGcm(fek, ciphertext);
            }
            if (!(ciphertext instanceof Uint8Array) || ciphertext.length < 32) {
                throw new EncryptionError('pdf/crypto/v5/bad-string',
                    'AES-256 encrypted string must be at least 32 bytes (IV+1 block)');
            }
            const iv = ciphertext.subarray(0, 16);
            const body = ciphertext.subarray(16);
            const pt = aesCbcDecrypt(fek, iv, body);
            return stripPkcs7(pt);
        }
        function decryptStream(typedEncrypt, fek, objNum, gen, ciphertext) {
            return decryptString(typedEncrypt, fek, objNum, gen, ciphertext);
        }

        // ---- ENCRYPT helpers (encrypted write side) ----

        function aesCbcEncrypt(key, iv, plaintext) {
            if (plaintext.length % 16 !== 0) {
                throw new EncryptionError('pdf/crypto/v5/bad-pt-len',
                    'AES-CBC plaintext length must be a multiple of 16',
                    { context: { length: plaintext.length } });
            }
            const cipher = aes.fn(bytesToWords(key, 0, key.length), false);
            if (cipher === false || typeof cipher.encrypt !== 'function') {
                throw new EncryptionError('pdf/crypto/v5/aes-encrypt-schedule',
                    'AES key schedule failed for encrypt');
            }
            const ptWords = bytesToWords(plaintext, 0, plaintext.length);
            const ivWords = bytesToWords(iv, 0, 16);
            const ctWords = cbc.encrypt(cipher, ptWords, ivWords);
            if (ctWords === false) {
                throw new EncryptionError('pdf/crypto/v5/cbc-encrypt-failed',
                    'AES-CBC encryption failed');
            }
            const out = new Uint8Array(plaintext.length);
            wordsToBytes(ctWords, out, 0);
            return out;
        }

        function padPkcs7(buf) {
            const pad = 16 - (buf.length % 16);
            const out = new Uint8Array(buf.length + pad);
            out.set(buf);
            for (let i = buf.length; i < out.length; i++) out[i] = pad;
            return out;
        }

        function encryptString(typedEncrypt, fek, _objNum, _gen, plaintext, iv) {
            if (!(plaintext instanceof Uint8Array)) {
                throw new EncryptionError('pdf/crypto/v5/encrypt-bad-input',
                    'plaintext must be Uint8Array');
            }
            const method = methodOf(typedEncrypt, 'AESV3');
            if (method === 'AESV4') {
                if (!(iv instanceof Uint8Array) || iv.length !== 12) {
                    throw new EncryptionError('pdf/crypto/v5/encrypt-bad-iv',
                        'AESV4 IV must be a 12-byte Uint8Array');
                }
                return requireGcm().encryptObjectGcm(fek, plaintext, () => iv);
            }
            if (!(iv instanceof Uint8Array) || iv.length !== 16) {
                throw new EncryptionError('pdf/crypto/v5/encrypt-bad-iv',
                    'IV must be a 16-byte Uint8Array');
            }
            const padded = padPkcs7(plaintext);
            const body = aesCbcEncrypt(fek, iv, padded);
            const out = new Uint8Array(16 + body.length);
            out.set(iv, 0);
            out.set(body, 16);
            return out;
        }
        function encryptStream(typedEncrypt, fek, objNum, gen, plaintext, iv) {
            return encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv);
        }

        // Build /O, /U, /OE, /UE per Algorithm 2.A (v5).
        // valSalt + keySalt are 8-byte randoms.
        function buildUUE(password, fek, valSalt, keySalt) {
            const pw = passwordToBytes(password);
            const hVal = sha256Bytes(concatBytes([pw, valSalt]));
            const U = new Uint8Array(48);
            U.set(hVal, 0); U.set(valSalt, 32); U.set(keySalt, 40);
            const intermediate = sha256Bytes(concatBytes([pw, keySalt]));
            const UE = aesCbcEncrypt(intermediate, ZERO_IV, fek);
            return { U, UE };
        }
        function buildOOE(password, fek, U48, valSalt, keySalt) {
            const pw = passwordToBytes(password);
            const hVal = sha256Bytes(concatBytes([pw, valSalt, U48]));
            const O = new Uint8Array(48);
            O.set(hVal, 0); O.set(valSalt, 32); O.set(keySalt, 40);
            const intermediate = sha256Bytes(concatBytes([pw, keySalt, U48]));
            const OE = aesCbcEncrypt(intermediate, ZERO_IV, fek);
            return { O, OE };
        }

        // Algorithm 10 — /Perms (16-byte AES-256-ECB block encrypted with FEK).
        function buildPerms(p, fek, encryptMetadata, randomBytes) {
            const buf = new Uint8Array(16);
            const v = p | 0;
            buf[0] =  v        & 0xff;
            buf[1] = (v >>>  8) & 0xff;
            buf[2] = (v >>> 16) & 0xff;
            buf[3] = (v >>> 24) & 0xff;
            buf[4] = 0xff; buf[5] = 0xff; buf[6] = 0xff; buf[7] = 0xff;
            buf[8] = encryptMetadata ? 0x54 : 0x46;
            buf[9] = 0x61; buf[10] = 0x64; buf[11] = 0x62;
            const rand = randomBytes(4);
            buf[12] = rand[0]; buf[13] = rand[1]; buf[14] = rand[2]; buf[15] = rand[3];
            // AES-256-ECB single block, no IV.
            const cipher = aes.fn(bytesToWords(fek, 0, 32), false);
            if (cipher === false || typeof cipher.encrypt !== 'function') {
                throw new EncryptionError('pdf/crypto/v5/perms-schedule',
                    'AES-256-ECB schedule failed for /Perms');
            }
            const blk = cipher.encrypt(bytesToWords(buf, 0, 16));
            const out = new Uint8Array(16);
            wordsToBytes(blk, out, 0);
            return out;
        }

        return {
            tryPassword, decryptString, decryptStream,
            encryptString, encryptStream,
            buildUUE, buildOOE, buildPerms
        };
    }
};
