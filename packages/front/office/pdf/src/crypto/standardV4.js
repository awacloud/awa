// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standard Security Handler v4 (V=4, R=4).
 *
 * Implements PDF 1.6 / ISO 32000-1 §7.6.3 Algorithm 2 (key derivation
 * R=4, 128-bit), Algorithm 3 (/O), Algorithm 5 (/U), and the per-object
 * key derivation for AESV2 (AES-128-CBC) and V2 (RC4-128) crypt filters.
 *
 * V=4 requires the /Encrypt dictionary to carry `/CF /StdCF` selecting
 * either method:
 *
 *   - AESV2 — AES-128-CBC; per-object key = MD5(fileKey || objId(3 LE)
 *     || gen(2 LE) || "sAlT") truncated to min(fileKey.len + 5, 16);
 *     IV prefixed, PKCS#7 padded.
 *   - V2    — RC4-128;     per-object key = MD5(fileKey || objId(3 LE)
 *     || gen(2 LE)) truncated to min(fileKey.len + 5, 16).
 *
 * @module pdf/crypto/standardV4
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { aes } from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc } from '@awacloud/fw/crypto/mode/cbc.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';

export const pdfStandardV4 = {
    name: 'pdfStandardV4',
    dependencies: ['pdfErrors', 'aes', 'cbc', 'bitArray'],
    deps: [pdfErrors, aes, cbc, bitArray],
    factory(errors, aes, cbc, bitArray) {
        const { EncryptionError } = errors;

        if (!aes || !cbc || !bitArray) {
            throw new EncryptionError('pdf/crypto/v4/missing-fw',
                'pdfStandardV4 requires aes, cbc, bitArray fw modules');
        }

        const PASSWORD_PADDING = new Uint8Array([
            0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
            0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
            0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
            0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
        ]);
        const AES_SALT = new Uint8Array([0x73, 0x41, 0x6C, 0x54]); // 'sAlT'

        // ---- helpers ----

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

        // RC4 stream cipher (used for V2 method + Algorithm 5 /U).
        function rc4(key, data) {
            const S = new Uint8Array(256);
            for (let i = 0; i < 256; i++) S[i] = i;
            let j = 0;
            for (let i = 0; i < 256; i++) {
                j = (j + S[i] + key[i % key.length]) & 0xFF;
                const t = S[i]; S[i] = S[j]; S[j] = t;
            }
            const out = new Uint8Array(data.length);
            let a = 0, b = 0;
            for (let n = 0; n < data.length; n++) {
                a = (a + 1) & 0xFF;
                b = (b + S[a]) & 0xFF;
                const t = S[a]; S[a] = S[b]; S[b] = t;
                const k = S[(S[a] + S[b]) & 0xFF];
                out[n] = data[n] ^ k;
            }
            return out;
        }

        // MD5 — RFC 1321 reference, compacted.
        function md5(bytes) {
            function rol(x, n) { return ((x << n) | (x >>> (32 - n))) | 0; }
            const r = [
                7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
                5, 9,14,20,5, 9,14,20,5, 9,14,20,5, 9,14,20,
                4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
                6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21
            ];
            const k = [
                0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
                0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
                0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
                0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
                0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
                0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
                0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
                0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
            ];
            const msgLenBytes = bytes.length;
            const withOne = new Uint8Array(((msgLenBytes + 8) >> 6 << 6) + 64);
            withOne.set(bytes);
            withOne[msgLenBytes] = 0x80;
            const bitsLo = (msgLenBytes * 8) >>> 0;
            const bitsHi = Math.floor((msgLenBytes * 8) / 0x100000000) >>> 0;
            const dv = new DataView(withOne.buffer);
            dv.setUint32(withOne.length - 8, bitsLo, true);
            dv.setUint32(withOne.length - 4, bitsHi, true);
            let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
            for (let off = 0; off < withOne.length; off += 64) {
                const M = new Array(16);
                for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
                let A = a0, B = b0, C = c0, D = d0;
                for (let i = 0; i < 64; i++) {
                    let F, g;
                    if (i < 16)       { F = (B & C) | ((~B) & D); g = i; }
                    else if (i < 32)  { F = (D & B) | ((~D) & C); g = (5 * i + 1) % 16; }
                    else if (i < 48)  { F = B ^ C ^ D;           g = (3 * i + 5) % 16; }
                    else              { F = C ^ (B | (~D));      g = (7 * i) % 16; }
                    const t = (A + F + k[i] + M[g]) | 0;
                    A = D; D = C; C = B; B = (B + rol(t, r[i])) | 0;
                }
                a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
            }
            const out = new Uint8Array(16);
            const ov = new DataView(out.buffer);
            ov.setUint32(0, a0, true);
            ov.setUint32(4, b0, true);
            ov.setUint32(8, c0, true);
            ov.setUint32(12, d0, true);
            return out;
        }

        function padPassword(pw) {
            if (pw === undefined || pw === null) pw = '';
            if (typeof pw === 'string') pw = new TextEncoder().encode(pw);
            if (!(pw instanceof Uint8Array)) {
                throw new EncryptionError('pdf/crypto/v4/bad-password',
                    'password must be string or Uint8Array');
            }
            const out = new Uint8Array(32);
            const take = Math.min(32, pw.length);
            out.set(pw.subarray(0, take));
            out.set(PASSWORD_PADDING.subarray(0, 32 - take), take);
            return out;
        }

        // §7.6.3.3 Algorithm 2 — compute file encryption key for R=4.
        // params: { O, P, idFirst, encryptMetadata }
        function computeFileKey(pw, O, P, idFirst, encryptMetadata) {
            if (!(O instanceof Uint8Array) || O.length !== 32) {
                throw new EncryptionError('pdf/crypto/v4/bad-O',
                    '/O must be a 32-byte Uint8Array');
            }
            if (!(idFirst instanceof Uint8Array)) {
                throw new EncryptionError('pdf/crypto/v4/bad-id',
                    'first /ID element required');
            }
            const padded = padPassword(pw);
            const extra = encryptMetadata === false ? 4 : 0;
            const buf = new Uint8Array(32 + 32 + 4 + idFirst.length + extra);
            let p = 0;
            buf.set(padded, p); p += 32;
            buf.set(O, p);      p += 32;
            const dv = new DataView(buf.buffer);
            dv.setInt32(p, P | 0, true); p += 4;
            buf.set(idFirst, p); p += idFirst.length;
            if (extra) { buf[p++] = 0xFF; buf[p++] = 0xFF; buf[p++] = 0xFF; buf[p] = 0xFF; }
            let h = md5(buf);
            const nBytes = 16; // 128-bit
            for (let i = 0; i < 50; i++) h = md5(h.subarray(0, nBytes));
            return h.subarray(0, nBytes);
        }

        // §7.6.3.4 Algorithm 5 — compute /U for R>=3.
        function computeU(fileKey, idFirst) {
            const seed = new Uint8Array(PASSWORD_PADDING.length + idFirst.length);
            seed.set(PASSWORD_PADDING, 0);
            seed.set(idFirst, PASSWORD_PADDING.length);
            let h = md5(seed);
            h = rc4(fileKey, h);
            for (let i = 1; i <= 19; i++) {
                const xk = new Uint8Array(fileKey.length);
                for (let n = 0; n < fileKey.length; n++) xk[n] = fileKey[n] ^ i;
                h = rc4(xk, h);
            }
            const out = new Uint8Array(32);
            out.set(h, 0);
            return out;
        }

        // §7.6.3.4 Algorithm 3 — compute /O from owner+user passwords.
        function computeO(ownerPw, userPw) {
            const oPad = padPassword(ownerPw && ownerPw.length ? ownerPw : userPw);
            let h = md5(oPad);
            for (let i = 0; i < 50; i++) h = md5(h);
            const rc4Key = h.subarray(0, 16);
            let out = rc4(rc4Key, padPassword(userPw));
            for (let i = 1; i <= 19; i++) {
                const xk = new Uint8Array(16);
                for (let n = 0; n < 16; n++) xk[n] = rc4Key[n] ^ i;
                out = rc4(xk, out);
            }
            return out;
        }

        function bytesEqual(a, b, n) {
            const len = n === undefined ? Math.min(a.length, b.length) : n;
            for (let i = 0; i < len; i++) if (a[i] !== b[i]) return false;
            return true;
        }

        // Per-object key derivation for V=4. `isAes=true` appends "sAlT".
        function objectKey(fileKey, objNum, gen, isAes) {
            const extra = isAes ? 4 : 0;
            const buf = new Uint8Array(fileKey.length + 5 + extra);
            buf.set(fileKey, 0);
            buf[fileKey.length + 0] = objNum & 0xFF;
            buf[fileKey.length + 1] = (objNum >> 8) & 0xFF;
            buf[fileKey.length + 2] = (objNum >> 16) & 0xFF;
            buf[fileKey.length + 3] = gen & 0xFF;
            buf[fileKey.length + 4] = (gen >> 8) & 0xFF;
            if (isAes) buf.set(AES_SALT, fileKey.length + 5);
            const h = md5(buf);
            return h.subarray(0, Math.min(fileKey.length + 5, 16));
        }

        // ---- AES-128-CBC primitives ----

        function aesCbcDecrypt(key, iv, ciphertext) {
            if (ciphertext.length % 16 !== 0) {
                throw new EncryptionError('pdf/crypto/v4/bad-ciphertext-len',
                    'AES-CBC ciphertext length must be a multiple of 16');
            }
            const cipher = aes.fn(bytesToWords(key, 0, key.length), true);
            if (cipher === false) {
                throw new EncryptionError('pdf/crypto/v4/aes-schedule-failed',
                    'AES-128 key schedule failed');
            }
            const ctWords = bytesToWords(ciphertext, 0, ciphertext.length);
            const ivWords = bytesToWords(iv, 0, 16);
            const ptWords = cbc.decrypt(cipher, ctWords, ivWords);
            if (ptWords === false) {
                throw new EncryptionError('pdf/crypto/v4/cbc-decrypt-failed',
                    'AES-128-CBC decryption failed');
            }
            const out = new Uint8Array(ciphertext.length);
            wordsToBytes(ptWords, out, 0);
            return out;
        }

        function aesCbcEncrypt(key, iv, plaintext) {
            if (plaintext.length % 16 !== 0) {
                throw new EncryptionError('pdf/crypto/v4/bad-pt-len',
                    'AES-CBC plaintext length must be a multiple of 16');
            }
            const cipher = aes.fn(bytesToWords(key, 0, key.length), false);
            if (cipher === false || typeof cipher.encrypt !== 'function') {
                throw new EncryptionError('pdf/crypto/v4/aes-encrypt-schedule',
                    'AES-128 key schedule failed for encrypt');
            }
            const ptWords = bytesToWords(plaintext, 0, plaintext.length);
            const ivWords = bytesToWords(iv, 0, 16);
            const ctWords = cbc.encrypt(cipher, ptWords, ivWords);
            if (ctWords === false) {
                throw new EncryptionError('pdf/crypto/v4/cbc-encrypt-failed',
                    'AES-128-CBC encryption failed');
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
        function stripPkcs7(buf) {
            if (buf.length === 0) return buf;
            const pad = buf[buf.length - 1];
            if (pad < 1 || pad > 16 || pad > buf.length) return buf;
            for (let i = buf.length - pad; i < buf.length; i++) {
                if (buf[i] !== pad) return buf;
            }
            return buf.subarray(0, buf.length - pad);
        }

        // ---- READ side ----

        // typedEncrypt minimal shape: { O, U, P, idFirst, encryptMetadata, method }
        function tryPassword(typedEncrypt, password, isOwner) {
            const O = typedEncrypt.O, U = typedEncrypt.U;
            const idFirst = typedEncrypt.idFirst;
            const P = typedEncrypt.P | 0;
            const encryptMetadata = typedEncrypt.EncryptMetadata !== false;
            if (!(O instanceof Uint8Array) || O.length !== 32 ||
                !(U instanceof Uint8Array) || U.length !== 32) {
                throw new EncryptionError('pdf/crypto/v4/bad-O-U',
                    '/O and /U must be 32 bytes for v4');
            }
            if (!(idFirst instanceof Uint8Array)) {
                throw new EncryptionError('pdf/crypto/v4/bad-id',
                    'idFirst is required for v4 key derivation');
            }
            let userPw;
            if (isOwner) {
                // Recover user password from /O.
                const oPad = padPassword(password);
                let h = md5(oPad);
                for (let i = 0; i < 50; i++) h = md5(h);
                const rc4Key = h.subarray(0, 16);
                let recovered = O;
                for (let i = 19; i >= 0; i--) {
                    const xk = new Uint8Array(16);
                    for (let n = 0; n < 16; n++) xk[n] = rc4Key[n] ^ i;
                    recovered = rc4(xk, recovered);
                }
                userPw = recovered;
            } else {
                userPw = password;
            }
            const fk = computeFileKey(userPw, O, P, idFirst, encryptMetadata);
            const u = computeU(fk, idFirst);
            const ok = bytesEqual(u, U, 16);
            return ok ? { fileEncryptionKey: fk } : { fileEncryptionKey: null };
        }

        function decryptString(typedEncrypt, fek, objNum, gen, ciphertext) {
            const method = typedEncrypt && typedEncrypt.method;
            if (method === 'AESV2') {
                if (ciphertext.length < 16) {
                    throw new EncryptionError('pdf/crypto/v4/bad-string',
                        'AESV2 string must be at least 16 bytes (IV)');
                }
                const key = objectKey(fek, objNum, gen, true);
                const iv = ciphertext.subarray(0, 16);
                const body = ciphertext.subarray(16);
                if (body.length === 0) return body;
                const pt = aesCbcDecrypt(key, iv, body);
                return stripPkcs7(pt);
            }
            if (method === 'V2' || method === 'RC4') {
                const key = objectKey(fek, objNum, gen, false);
                return rc4(key, ciphertext);
            }
            throw new EncryptionError('pdf/crypto/v4/bad-method',
                'V4 method must be AESV2 or V2',
                { context: { method } });
        }
        function decryptStream(typedEncrypt, fek, objNum, gen, ciphertext) {
            return decryptString(typedEncrypt, fek, objNum, gen, ciphertext);
        }
        // Embedded file stream (ISO 32000-1 §7.6.5): same per-object key
        // derivation as a regular stream, but the dispatched method comes
        // from /EFF. Callers pass a typed view whose `.method` is the
        // resolved `effMethod`.
        function decryptEmbeddedFile(typedEncrypt, fek, objNum, gen, ciphertext) {
            return decryptString(typedEncrypt, fek, objNum, gen, ciphertext);
        }
        function encryptEmbeddedFile(typedEncrypt, fek, objNum, gen, plaintext, iv) {
            return encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv);
        }

        // ---- WRITE side ----

        function encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv) {
            const method = typedEncrypt && typedEncrypt.method;
            if (!(plaintext instanceof Uint8Array)) {
                throw new EncryptionError('pdf/crypto/v4/encrypt-bad-input',
                    'plaintext must be Uint8Array');
            }
            if (method === 'AESV2') {
                if (!(iv instanceof Uint8Array) || iv.length !== 16) {
                    throw new EncryptionError('pdf/crypto/v4/encrypt-bad-iv',
                        'AESV2 IV must be 16 bytes');
                }
                const key = objectKey(fek, objNum, gen, true);
                const padded = padPkcs7(plaintext);
                const body = aesCbcEncrypt(key, iv, padded);
                const out = new Uint8Array(16 + body.length);
                out.set(iv, 0);
                out.set(body, 16);
                return out;
            }
            if (method === 'V2' || method === 'RC4') {
                const key = objectKey(fek, objNum, gen, false);
                return rc4(key, plaintext);
            }
            throw new EncryptionError('pdf/crypto/v4/bad-method',
                'V4 method must be AESV2 or V2',
                { context: { method } });
        }
        function encryptStream(typedEncrypt, fek, objNum, gen, plaintext, iv) {
            return encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv);
        }

        // Build /O and /U pair given owner + user passwords + idFirst.
        // Returns { O, U, fek } where fek is the derived 16-byte file key.
        function buildOU(ownerPassword, userPassword, P, idFirst, encryptMetadata) {
            if (!(idFirst instanceof Uint8Array)) {
                throw new EncryptionError('pdf/crypto/v4/bad-id',
                    'idFirst required to build /O and /U');
            }
            const O = computeO(ownerPassword, userPassword);
            const fek = computeFileKey(userPassword, O, P, idFirst, encryptMetadata);
            const U = computeU(fek, idFirst);
            return { O, U, fek };
        }

        // Algorithm 8 (V=4) — /Perms is NOT used for R=4 (only R>=5). We
        // expose a no-op for symmetry; callers should not emit /Perms
        // for V=4.
        function buildPerms() { return null; }

        return {
            tryPassword,
            decryptString, decryptStream,
            decryptEmbeddedFile, encryptEmbeddedFile,
            encryptString, encryptStream,
            buildOU, buildPerms,
            computeFileKey, computeU, computeO,
            objectKey, rc4, md5, padPassword,
            PASSWORD_PADDING
        };
    }
};
