// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard Security Handler v6 (V=5, R=6, PDF 2.0).
 *
 * Implements Algorithm 2.B (password validation with the hardening loop)
 * and Algorithm 8 (File Encryption Key derivation) per ISO 32000-2:2020
 * §7.6.4.3.3 and §7.6.4.4.7.
 *
 * String/stream decryption shape is identical to v5 (IV-prefixed
 * AES-256-CBC, no obj/gen rekeying).
 *
 * @module pdf/crypto/standardV6
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 } from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 } from '@awacloud/fw/crypto/hash/sha512.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { pdfAesGcm } from './aesGcm.js';

export const pdfStandardV6 = {
    name: 'pdfStandardV6',
    dependencies: ['pdfErrors', 'aes', 'cbc', 'sha256', 'sha384', 'sha512', 'bitArray', 'pdfAesGcm'],
    deps: [pdfErrors, aes, cbc, sha256, sha384, sha512, bitArray, pdfAesGcm],
    factory(errors, aes, cbc, sha256, sha384, sha512, bitArray, pdfAesGcm) {
        const { EncryptionError } = errors;

        if (!aes || !cbc || !sha256 || !sha384 || !sha512 || !bitArray) {
            throw new EncryptionError('pdf/crypto/v6/missing-fw',
                'pdfStandardV6 requires aes, cbc, sha256, sha384, sha512, bitArray');
        }
        // pdfAesGcm optional — only required when /CFM = AESV4.

        const ZERO_IV = new Uint8Array(16);
        // Reusable scratch buffer for AES-128 key schedule (Algorithm 2.B).
        const _AES128_KEY_SCRATCH = new Array(4);

        function bytesToWords(b, off, len, scratch) {
            const n = len >>> 2;
            const out = (scratch && scratch.length >= n) ? scratch : new Array(n);
            for (let i = 0; i < n; i++) {
                const j = off + (i << 2);
                out[i] = ((b[j] << 24) | (b[j + 1] << 16) | (b[j + 2] << 8) | b[j + 3]) | 0;
            }
            if (out.length !== n && out !== scratch) out.length = n;
            if (scratch && out === scratch) out.length = n;
            return out;
        }
        function wordsToBytes(w, into, off, count) {
            const n = count === undefined ? w.length : count;
            for (let i = 0; i < n; i++) {
                const j = off + (i << 2);
                into[j]     = (w[i] >>> 24) & 0xff;
                into[j + 1] = (w[i] >>> 16) & 0xff;
                into[j + 2] = (w[i] >>>  8) & 0xff;
                into[j + 3] =  w[i]         & 0xff;
            }
        }
        function concatBytes(parts) {
            let n = 0;
            for (const p of parts) n += p.length;
            const out = new Uint8Array(n);
            let off = 0;
            for (const p of parts) { out.set(p, off); off += p.length; }
            return out;
        }
        function passwordToBytes(password) {
            if (password === undefined || password === null || password === '') return new Uint8Array(0);
            if (password instanceof Uint8Array) {
                return password.length > 127 ? password.subarray(0, 127) : password;
            }
            if (typeof password === 'string') {
                const enc = new TextEncoder().encode(password);
                return enc.length > 127 ? enc.subarray(0, 127) : enc;
            }
            throw new EncryptionError('pdf/crypto/v6/bad-password',
                'password must be string or Uint8Array');
        }
        function hashBytes(hashMod, bytes, outLen) {
            const ba = bitArray.ui8_to_ba(bytes);
            const digest = hashMod.hash(ba);
            const u8 = bitArray.ba_to_ui8(digest);
            return u8.length === outLen ? u8 : u8.subarray(0, outLen);
        }

        function aesCbcEncryptRaw(key, iv, plaintext) {
            if (plaintext.length % 16 !== 0) {
                throw new EncryptionError('pdf/crypto/v6/bad-pt-len',
                    'AES-CBC plaintext length must be a multiple of 16',
                    { context: { length: plaintext.length } });
            }
            const cipher = aes.fn(
                bytesToWords(key, 0, key.length, _AES128_KEY_SCRATCH), false);
            if (cipher === false) {
                throw new EncryptionError('pdf/crypto/v6/aes-schedule-failed', 'AES key schedule failed');
            }
            const out = new Uint8Array(plaintext.length);
            let p0 = (iv[0] << 24) | (iv[1] << 16) | (iv[2] << 8) | iv[3];
            let p1 = (iv[4] << 24) | (iv[5] << 16) | (iv[6] << 8) | iv[7];
            let p2 = (iv[8] << 24) | (iv[9] << 16) | (iv[10] << 8) | iv[11];
            let p3 = (iv[12] << 24) | (iv[13] << 16) | (iv[14] << 8) | iv[15];
            for (let off = 0; off < plaintext.length; off += 16) {
                const b0 = (plaintext[off] << 24) | (plaintext[off+1] << 16) | (plaintext[off+2] << 8) | plaintext[off+3];
                const b1 = (plaintext[off+4] << 24) | (plaintext[off+5] << 16) | (plaintext[off+6] << 8) | plaintext[off+7];
                const b2 = (plaintext[off+8] << 24) | (plaintext[off+9] << 16) | (plaintext[off+10] << 8) | plaintext[off+11];
                const b3 = (plaintext[off+12] << 24) | (plaintext[off+13] << 16) | (plaintext[off+14] << 8) | plaintext[off+15];
                const blk = cipher.encrypt([b0 ^ p0, b1 ^ p1, b2 ^ p2, b3 ^ p3]);
                p0 = blk[0]; p1 = blk[1]; p2 = blk[2]; p3 = blk[3];
                wordsToBytes(blk, out, off, 4);
            }
            return out;
        }

        function aesCbcDecrypt(key, iv, ciphertext) {
            if (ciphertext.length % 16 !== 0) {
                throw new EncryptionError('pdf/crypto/v6/bad-ct-len',
                    'AES-CBC ciphertext length must be a multiple of 16');
            }
            const cipher = aes.fn(bytesToWords(key, 0, key.length), true);
            if (cipher === false || typeof cipher.decrypt !== 'function') {
                throw new EncryptionError('pdf/crypto/v6/aes-decrypt-schedule',
                    'AES-256 decrypt key schedule failed');
            }
            const ctWords = bytesToWords(ciphertext, 0, ciphertext.length);
            const ivWords = bytesToWords(iv, 0, 16);
            const ptWords = cbc.decrypt(cipher, ctWords, ivWords);
            if (ptWords === false) {
                throw new EncryptionError('pdf/crypto/v6/cbc-decrypt-failed',
                    'AES-256-CBC decryption failed');
            }
            const out = new Uint8Array(ciphertext.length);
            wordsToBytes(ptWords, out, 0, ptWords.length);
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

        function hardenKey(password, salt, extra) {
            let K = hashBytes(sha256, concatBytes([password, salt, extra]), 32);
            let round = 0;
            while (true) {
                const block = concatBytes([password, K, extra]);
                const K1 = new Uint8Array(block.length * 64);
                for (let i = 0; i < 64; i++) K1.set(block, i * block.length);
                const aesKey = K.subarray(0, 16);
                const iv = K.subarray(16, 32);
                const E = aesCbcEncryptRaw(aesKey, iv, K1);
                let sum = 0;
                for (let i = 0; i < 16; i++) sum = (sum + E[i]) % 3;
                let nextHash, outLen;
                if (sum === 0)      { nextHash = sha256; outLen = 32; }
                else if (sum === 1) { nextHash = sha384; outLen = 48; }
                else                { nextHash = sha512; outLen = 64; }
                K = hashBytes(nextHash, E, outLen);
                round++;
                if (round >= 64 && E[E.length - 1] <= round - 32) break;
                if (round > 1024) {
                    throw new EncryptionError('pdf/crypto/v6/hardening-runaway',
                        'Algorithm 2.B exceeded 1024 rounds',
                        { context: { round } });
                }
            }
            return K.subarray(0, 32);
        }

        function tryPassword(typedEncrypt, password, isOwner) {
            const O = typedEncrypt.O, U = typedEncrypt.U;
            const OE = typedEncrypt.OE, UE = typedEncrypt.UE;
            if (!(O instanceof Uint8Array) || O.length < 48 ||
                !(U instanceof Uint8Array) || U.length < 48) {
                throw new EncryptionError('pdf/crypto/v6/bad-O-U',
                    '/O and /U must be at least 48 bytes for v6');
            }
            const pw = passwordToBytes(password);
            const target = isOwner ? O : U;
            const valSalt = target.subarray(32, 40);
            const keySalt = target.subarray(40, 48);
            const extra = isOwner ? U.subarray(0, 48) : new Uint8Array(0);
            const valHash = hardenKey(pw, valSalt, extra);
            for (let i = 0; i < 32; i++) {
                if (valHash[i] !== target[i]) return { fileEncryptionKey: null };
            }
            const intermediate = hardenKey(pw, keySalt, extra);
            const oeue = isOwner ? OE : UE;
            if (!(oeue instanceof Uint8Array) || oeue.length !== 32) {
                throw new EncryptionError('pdf/crypto/v6/bad-OE-UE',
                    '/OE and /UE must be exactly 32 bytes for v6');
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
                throw new EncryptionError('pdf/crypto/v6/missing-gcm',
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
                throw new EncryptionError('pdf/crypto/v6/bad-string',
                    'AES-256 encrypted string must be at least 32 bytes');
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

        function aesCbcEncrypt256(key, iv, plaintext) {
            // Uses the existing aesCbcEncryptRaw which expects multiple-of-16.
            return aesCbcEncryptRaw(key, iv, plaintext);
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
                throw new EncryptionError('pdf/crypto/v6/encrypt-bad-input',
                    'plaintext must be Uint8Array');
            }
            const method = methodOf(typedEncrypt, 'AESV3');
            if (method === 'AESV4') {
                if (!(iv instanceof Uint8Array) || iv.length !== 12) {
                    throw new EncryptionError('pdf/crypto/v6/encrypt-bad-iv',
                        'AESV4 IV must be a 12-byte Uint8Array');
                }
                return requireGcm().encryptObjectGcm(fek, plaintext, () => iv);
            }
            if (!(iv instanceof Uint8Array) || iv.length !== 16) {
                throw new EncryptionError('pdf/crypto/v6/encrypt-bad-iv',
                    'IV must be a 16-byte Uint8Array');
            }
            const padded = padPkcs7(plaintext);
            const body = aesCbcEncrypt256(fek, iv, padded);
            const out = new Uint8Array(16 + body.length);
            out.set(iv, 0);
            out.set(body, 16);
            return out;
        }
        function encryptStream(typedEncrypt, fek, objNum, gen, plaintext, iv) {
            return encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv);
        }

        // Build /U, /UE, /O, /OE per Algorithm 8 / 2.B with hardening.
        function buildUUE(password, fek, valSalt, keySalt) {
            const pw = passwordToBytes(password);
            const hVal = hardenKey(pw, valSalt, new Uint8Array(0));
            const U = new Uint8Array(48);
            U.set(hVal, 0); U.set(valSalt, 32); U.set(keySalt, 40);
            const intermediate = hardenKey(pw, keySalt, new Uint8Array(0));
            const UE = aesCbcEncrypt256(intermediate, ZERO_IV, fek);
            return { U, UE };
        }
        function buildOOE(password, fek, U48, valSalt, keySalt) {
            const pw = passwordToBytes(password);
            const hVal = hardenKey(pw, valSalt, U48);
            const O = new Uint8Array(48);
            O.set(hVal, 0); O.set(valSalt, 32); O.set(keySalt, 40);
            const intermediate = hardenKey(pw, keySalt, U48);
            const OE = aesCbcEncrypt256(intermediate, ZERO_IV, fek);
            return { O, OE };
        }

        // Algorithm 10 — /Perms.
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
            const cipher = aes.fn(bytesToWords(fek, 0, 32, _AES128_KEY_SCRATCH), false);
            if (cipher === false || typeof cipher.encrypt !== 'function') {
                throw new EncryptionError('pdf/crypto/v6/perms-schedule',
                    'AES-256-ECB schedule failed for /Perms');
            }
            const blk = cipher.encrypt(bytesToWords(buf, 0, 16));
            const out = new Uint8Array(16);
            wordsToBytes(blk, out, 0, 4);
            return out;
        }

        return {
            tryPassword, decryptString, decryptStream,
            encryptString, encryptStream,
            buildUUE, buildOOE, buildPerms
        };
    }
};
