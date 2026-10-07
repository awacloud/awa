// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `pdfShared` — canonical source of PDF byte-level
 * constants and stateless helpers previously duplicated across many
 * `@awacloud/pdf` factories.
 *
 * Exposes :
 * - **Magic bytes** : `HEADER_PREFIX` (`%PDF-`), `EOF_MARKER` (`%%EOF`),
 *   `BINARY_MARKER` (the `%¡¢£¤\n` byte tail).
 * - **ASCII constants** : `ASCII` object grouping the byte values used
 *   by the tokenizer / parsers / writers — `SP`, `HT`, `LF`, `CR`, `FF`,
 *   `NUL`, `HASH`, `PERCENT`, `BACKSLASH`, `SLASH`, `LPAREN`, `RPAREN`,
 *   `LANGLE`, `RANGLE`, `LBRACK`, `RBRACK`, `LBRACE`, `RBRACE`, `PLUS`,
 *   `MINUS`, `DOT`, `ZERO`, `NINE`, `A_UP`, `F_UP`, `Z_UP`, `A_LO`,
 *   `F_LO`, `Z_LO`.
 * - **Character class predicates** (PDF 32000-2 §7.2) : `isWs`, `isEol`,
 *   `isDigit`, `isHex`, `isDelim`, `isRegular`, `hexNibble`. Each is a
 *   pure function over byte values.
 * - **Hex tables** : `HEX_LO` — 128-entry lookup `byte → nibble value`
 *   (`-1` for non-hex), used by `asciiHex` and serializer.
 * - **UTF-8 / latin1 codec singletons** : `te` (`TextEncoder`),
 *   `tdUtf8` (`TextDecoder('utf-8')`), `tdUtf8Lenient`
 *   (`TextDecoder('utf-8', { fatal: false })`), `tdLatin1`
 *   (`TextDecoder('latin1')`). Both `tdUtf8` and `tdUtf8Lenient` are
 *   non-fatal (`fatal: false` is the `TextDecoder` default). Available to
 *   `writer.js` and `serializer.js`.
 * - **Codec helpers** : `encodeAscii(s)` / `decodeLatin1(bytes)` /
 *   `decodeUtf8(bytes)` / `decodeUtf8Lenient(bytes)` — thin wrappers
 *   over the singletons.
 * - **Byte helpers** : `pad10(n)`, `hexLit(bytes)`, `bytesEqual(a, b, n)`,
 *   `concatBytes(arrays)` — available to modules; `writer.js` and
 *   `serializer.js` still carry their own copies.
 *
 * **Worker-safe** : every export is either a constant byte array, a
 * pure function, or a singleton instantiated inside the factory body
 * (so `factory.toString()` produces a self-contained closure).
 *
 * @module pdf/_shared
 */

export const pdfShared = {
    name: 'pdfShared',
    dependencies: [],

    factory() {
        // --- Magic bytes -----------------------------------------------
        const HEADER_PREFIX  = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
        const EOF_MARKER     = new Uint8Array([0x25, 0x25, 0x45, 0x4F, 0x46]); // %%EOF
        // Binary marker line emitted right after the version header so
        // transports treat the file as binary (per PDF 32000-2 §7.5.2).
        const BINARY_MARKER  = new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]);

        // --- ASCII byte constants --------------------------------------
        const ASCII = Object.freeze({
            NUL: 0x00, HT: 0x09, LF: 0x0A, FF: 0x0C, CR: 0x0D, SP: 0x20,
            HASH: 0x23, PERCENT: 0x25, LPAREN: 0x28, RPAREN: 0x29,
            PLUS: 0x2B, MINUS: 0x2D, DOT: 0x2E, SLASH: 0x2F,
            ZERO: 0x30, NINE: 0x39,
            LANGLE: 0x3C, RANGLE: 0x3E,
            A_UP: 0x41, F_UP: 0x46, Z_UP: 0x5A,
            LBRACK: 0x5B, BACKSLASH: 0x5C, RBRACK: 0x5D,
            A_LO: 0x61, F_LO: 0x66, Z_LO: 0x7A,
            LBRACE: 0x7B, RBRACE: 0x7D
        });

        // --- Character class predicates (PDF 32000-2 §7.2) -------------
        function isWs(b) {
            return b === 0x20 || b === 0x09 || b === 0x0A
                || b === 0x0D || b === 0x0C || b === 0x00;
        }
        function isEol(b) { return b === 0x0A || b === 0x0D; }
        function isDigit(b) { return b >= 0x30 && b <= 0x39; }
        function isHex(b) {
            return (b >= 0x30 && b <= 0x39)
                || (b >= 0x41 && b <= 0x46)
                || (b >= 0x61 && b <= 0x66);
        }
        function isDelim(b) {
            return b === 0x28 || b === 0x29   // ( )
                || b === 0x3C || b === 0x3E   // < >
                || b === 0x5B || b === 0x5D   // [ ]
                || b === 0x2F || b === 0x25   // / %
                || b === 0x7B || b === 0x7D;  // { }
        }
        function isRegular(b) { return !isWs(b) && !isDelim(b); }

        function hexNibble(b) {
            if (b >= 0x30 && b <= 0x39) return b - 0x30;
            if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
            if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
            return -1;
        }

        // --- Hex lookup table (byte → nibble value, -1 if non-hex) -----
        // 128 entries, indexable by ASCII byte. Identical semantics to
        // hexNibble() but O(1) without branches.
        const HEX_LO = (function buildHexLo() {
            const t = new Int8Array(128);
            t.fill(-1);
            for (let c = 0x30; c <= 0x39; c++) t[c] = c - 0x30;
            for (let c = 0x41; c <= 0x46; c++) t[c] = c - 0x41 + 10;
            for (let c = 0x61; c <= 0x66; c++) t[c] = c - 0x61 + 10;
            return t;
        })();

        // --- UTF-8 / latin1 codec singletons ---------------------------
        const te             = new TextEncoder();
        const tdUtf8         = new TextDecoder('utf-8');
        const tdUtf8Lenient  = new TextDecoder('utf-8', { fatal: false });
        const tdLatin1       = new TextDecoder('latin1');

        function encodeAscii(s)         { return te.encode(s); }
        function decodeUtf8(bytes)      { return tdUtf8.decode(bytes); }
        function decodeUtf8Lenient(b)   { return tdUtf8Lenient.decode(b); }
        function decodeLatin1(bytes)    { return tdLatin1.decode(bytes); }

        // --- Byte helpers ----------------------------------------------
        function pad10(n) { return String(n).padStart(10, '0'); }

        function hexLit(bytes) {
            const H = '0123456789ABCDEF';
            let s = '<';
            for (let i = 0; i < bytes.length; i++) {
                s += H[bytes[i] >> 4] + H[bytes[i] & 0xF];
            }
            return s + '>';
        }

        /**
         * Constant-time-ish equality of two byte arrays.
         *
         * @param {Uint8Array} a
         * @param {Uint8Array} b
         * @param {number} [n] — optional prefix length to compare;
         *        defaults to `min(a.length, b.length)` and requires both
         *        arrays to be that length exactly.
         */
        function bytesEqual(a, b, n) {
            if (!a || !b) return false;
            if (n == null) {
                if (a.length !== b.length) return false;
                n = a.length;
            } else {
                if (a.length < n || b.length < n) return false;
            }
            let diff = 0;
            for (let i = 0; i < n; i++) diff |= (a[i] ^ b[i]);
            return diff === 0;
        }

        function concatBytes(arrays) {
            let total = 0;
            for (const a of arrays) total += a.length;
            const out = new Uint8Array(total);
            let o = 0;
            for (const a of arrays) { out.set(a, o); o += a.length; }
            return out;
        }

        return {
            // magic
            HEADER_PREFIX, EOF_MARKER, BINARY_MARKER,
            // ASCII constants
            ASCII,
            // char classes
            isWs, isEol, isDigit, isHex, isDelim, isRegular, hexNibble,
            HEX_LO,
            // codec singletons
            te, tdUtf8, tdUtf8Lenient, tdLatin1,
            encodeAscii, decodeUtf8, decodeUtf8Lenient, decodeLatin1,
            // byte helpers
            pad10, hexLit, bytesEqual, concatBytes
        };
    }
};
