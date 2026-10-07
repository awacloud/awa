// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: LEGACY RC4 read support.
 *
 * Implements the RC4 stream cipher locally (per the Wikipedia
 * pseudo-code) and exposes the read side of the PDF v2/v3 Standard
 * Security Handler:
 *
 *   - 40-bit RC4 (revision 2, V=1) and 128-bit RC4 (revision 3, V=2)
 *   - password validation against /O and /U using PDF 1.7 §7.6.3.3-4
 *   - per-object key derivation (file-key || objectId/MD5) for /Encrypt
 *     V <= 2.
 *
 * PDF 2.0 forbids RC4 on write; this module is intentionally read-only.
 *
 * @module pdf/extra/legacy-rc4-read
 */

import { pdfErrors } from '../errors.js';

export const pdfLegacyRc4Read = {
    name: 'pdfLegacyRc4Read',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { EncryptionError } = errors;
        const PASSWORD_PADDING = new Uint8Array([
            0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
            0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
            0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
            0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
        ]);
        // ---- RC4 ----
        function rc4(key, data) {
            if (!(key instanceof Uint8Array) || !(data instanceof Uint8Array)) {
                throw new EncryptionError('pdf/rc4/bad-input',
                    'RC4 expects Uint8Array key and data');
            }
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

        // Lightweight MD5 — needed for PDF Standard SH password algos.
        // Public-domain RFC 1321 reference implementation, compacted.
        function md5(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new EncryptionError('pdf/md5/bad-input',
                    'md5 expects Uint8Array');
            }
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
            if (typeof pw === 'string') pw = new TextEncoder().encode(pw);
            if (!(pw instanceof Uint8Array)) {
                throw new EncryptionError('pdf/rc4/bad-password',
                    'password must be string or Uint8Array');
            }
            const out = new Uint8Array(32);
            const take = Math.min(32, pw.length);
            out.set(pw.subarray(0, take));
            out.set(PASSWORD_PADDING.subarray(0, 32 - take), take);
            return out;
        }

        // §7.6.3.3 Algorithm 2 — compute file encryption key.
        function computeFileKey(pw, params) {
            const { O, P, idFirst, revision, keyLength, encryptMetadata } = params;
            if (!(O instanceof Uint8Array) || O.length !== 32) {
                throw new EncryptionError('pdf/rc4/bad-O',
                    '/O must be a 32-byte Uint8Array');
            }
            if (!(idFirst instanceof Uint8Array)) {
                throw new EncryptionError('pdf/rc4/bad-id',
                    'first /ID element required');
            }
            const padded = padPassword(pw);
            // padded || O || P (4 bytes LE) || ID || (R>=4 ? FFFFFFFF if !encryptMetadata : nothing)
            const extra = revision >= 4 && encryptMetadata === false ? 4 : 0;
            const buf = new Uint8Array(32 + 32 + 4 + idFirst.length + extra);
            let p = 0;
            buf.set(padded, p); p += 32;
            buf.set(O, p);      p += 32;
            const dv = new DataView(buf.buffer);
            dv.setInt32(p, P | 0, true); p += 4;
            buf.set(idFirst, p); p += idFirst.length;
            if (extra) { buf[p++] = 0xFF; buf[p++] = 0xFF; buf[p++] = 0xFF; buf[p] = 0xFF; }
            let h = md5(buf);
            const nBytes = keyLength / 8;
            if (revision >= 3) {
                for (let i = 0; i < 50; i++) h = md5(h.subarray(0, nBytes));
            }
            return h.subarray(0, nBytes);
        }

        // §7.6.3.4 Algorithm 5 — compute /U for revision >= 3.
        function computeU(fileKey, idFirst, revision) {
            if (revision === 2) {
                return rc4(fileKey, PASSWORD_PADDING);
            }
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
            // Pad to 32 bytes (arbitrary content).
            const out = new Uint8Array(32);
            out.set(h, 0);
            return out;
        }

        function bytesEqual(a, b, n) {
            const len = n === undefined ? Math.min(a.length, b.length) : n;
            for (let i = 0; i < len; i++) if (a[i] !== b[i]) return false;
            return true;
        }

        function validateUserPassword(pw, params) {
            const fk = computeFileKey(pw, params);
            const u = computeU(fk, params.idFirst, params.revision);
            const ok = params.revision === 2
                ? bytesEqual(u, params.U, 32)
                : bytesEqual(u, params.U, 16);
            return ok ? { ok: true, fileKey: fk } : { ok: false };
        }

        // Per-object key for V <= 2, R 2/3: append the object id and gen
        // (low 3 + low 2 bytes LE) to the file key, MD5, truncate.
        function objectKey(fileKey, objNum, gen) {
            const buf = new Uint8Array(fileKey.length + 5);
            buf.set(fileKey, 0);
            buf[fileKey.length + 0] = objNum & 0xFF;
            buf[fileKey.length + 1] = (objNum >> 8) & 0xFF;
            buf[fileKey.length + 2] = (objNum >> 16) & 0xFF;
            buf[fileKey.length + 3] = gen & 0xFF;
            buf[fileKey.length + 4] = (gen >> 8) & 0xFF;
            const h = md5(buf);
            return h.subarray(0, Math.min(fileKey.length + 5, 16));
        }

        function decryptString(fileKey, objNum, gen, bytes) {
            return rc4(objectKey(fileKey, objNum, gen), bytes);
        }

        function decryptStream(fileKey, objNum, gen, bytes) {
            return rc4(objectKey(fileKey, objNum, gen), bytes);
        }

        return {
            rc4,
            md5,
            padPassword,
            computeFileKey,
            computeU,
            validateUserPassword,
            objectKey,
            decryptString,
            decryptStream,
            PASSWORD_PADDING
        };
    }
};
