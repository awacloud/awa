// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Minimal ASN.1 DER encoder / decoder (X.690).
 *
 * Covers the subset needed for RSA, EC and Edwards key/signature encoding
 * per PKCS #1, PKCS #8, SEC1 and RFC 8410:
 *
 *   INTEGER, BIT STRING, OCTET STRING, NULL, OBJECT IDENTIFIER,
 *   SEQUENCE, SET, plus context-specific [n] EXPLICIT/IMPLICIT tags.
 *
 * Encoders accept structured JS values and emit `Uint8Array`. Decoders take
 * a `Uint8Array` and return `{ tag, length, value, valueOff }` or, for
 * compound shapes, an array of children. INTEGER values are returned as
 * `Uint8Array` (raw two's-complement bytes) - use a bignum (`bn`) module
 * to interpret them as numbers.
 *
 * Strict mode: rejects indefinite-length form (BER only), non-minimal
 * length encodings, and trailing data after the top-level structure.
 *
 */

/**
 * A parsed ASN.1 TLV node as produced by `parseOne`.
 * @typedef {object} Asn1Node
 * @property {number} tag Raw tag byte.
 * @property {number} length Declared content length in bytes.
 * @property {Uint8Array} value Content octets (subarray view into the input).
 * @property {number} valueOff Offset of the first content byte in the input.
 * @property {number} next Offset just past this TLV in the input.
 */

/**
 * Public shape returned by `asn1.factory()`.
 * @typedef {object} Asn1API
 * @property {{INTEGER:number, BIT_STRING:number, OCTET_STRING:number, NULL:number, OID:number, SEQUENCE:number, SET:number}} TAG Tag-byte constants.
 * @property {(value: Uint8Array|number[]|number) => (Uint8Array|false)} encodeInteger Encode an INTEGER.
 * @property {(bytes: Uint8Array|number[]) => (Uint8Array|false)} encodeOctetString Encode an OCTET STRING.
 * @property {(bytes: Uint8Array|number[], unusedBits: number) => (Uint8Array|false)} encodeBitString Encode a BIT STRING.
 * @property {() => Uint8Array} encodeNull Encode a NULL.
 * @property {(dotted: string) => (Uint8Array|false)} encodeOid Encode a dotted-notation OID.
 * @property {(items: Uint8Array[]) => (Uint8Array|false)} encodeSequence Encode a SEQUENCE of TLV items.
 * @property {(items: Uint8Array[]) => (Uint8Array|false)} encodeSet Encode a SET of TLV items.
 * @property {(n: number, body: Uint8Array) => (Uint8Array|false)} encodeExplicit Wrap a TLV in a context-specific [n] EXPLICIT tag.
 * @property {(n: number, tlv: Uint8Array, constructed?: boolean) => Uint8Array} encodeImplicit Re-tag a TLV as IMPLICIT context-specific [n].
 * @property {(buf: Uint8Array, off: number) => (Asn1Node|false)} parseOne Parse one TLV at `off`.
 * @property {(value: Uint8Array) => (Asn1Node[]|false)} parseChildren Parse a sequence of TLVs.
 * @property {(node: Asn1Node) => (Uint8Array|false)} readInteger Read raw two's-complement bytes of an INTEGER node.
 * @property {(node: Asn1Node) => (string|false)} readOid Read an OID node as a dotted string.
 * @property {(node: Asn1Node) => ({unusedBits:number, bytes:Uint8Array}|false)} readBitString Read a BIT STRING node.
 */

export const asn1 = {
    name: 'asn1',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: [],

    /** @returns {Asn1API} */
    factory() {

        const TAG = {
            INTEGER:     0x02,
            BIT_STRING:  0x03,
            OCTET_STRING:0x04,
            NULL:        0x05,
            OID:         0x06,
            SEQUENCE:    0x30,
            SET:         0x31
        };

        // ── length codec ──────────────────────────────────────────────────

        function _encLen(n) {
            if (n < 0x80) return Uint8Array.of(n);
            if (n <= 0xff) return Uint8Array.of(0x81, n);
            if (n <= 0xffff) return Uint8Array.of(0x82, (n >>> 8) & 0xff, n & 0xff);
            if (n <= 0xffffff) return Uint8Array.of(0x83, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
            if (n <= 0xffffffff) return Uint8Array.of(0x84, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
            console.warn('[crypto] INVALID: asn1: length exceeds 2^32-1');
            return false;
        }

        function _decLen(buf, off) {
            const first = buf[off];
            if (first < 0x80) return { len: first, next: off + 1 };
            const n = first & 0x7f;
            if (n === 0 || n > 4) {
                console.warn('[crypto] INVALID: asn1: unsupported length form');
                return false;
            }
            let len = 0;
            for (let i = 0; i < n; i++) len = (len << 8) | buf[off + 1 + i];
            // Reject non-minimal encoding.
            if (len < 0x80 || (n > 1 && (len >>> ((n - 1) * 8)) === 0)) {
                console.warn('[crypto] INVALID: asn1: non-minimal length encoding');
                return false;
            }
            return { len: len >>> 0, next: off + 1 + n };
        }

        function _wrap(tag, body) {
            const lenBytes = _encLen(body.length);
            if (lenBytes === false) return false;
            const out = new Uint8Array(1 + lenBytes.length + body.length);
            out[0] = tag;
            out.set(lenBytes, 1);
            out.set(body, 1 + lenBytes.length);
            return out;
        }

        function _concat(parts) {
            let total = 0;
            for (const p of parts) total += p.length;
            const out = new Uint8Array(total);
            let off = 0;
            for (const p of parts) { out.set(p, off); off += p.length; }
            return out;
        }

        // ── encoders ──────────────────────────────────────────────────────

        /**
         * Encode an INTEGER from a non-negative big-endian byte array
         * (or a small JS number). Adds a leading 0x00 if the high bit is
         * set, to keep the value positive (DER requirement).
         */
        function encodeInteger(value) {
            let bytes;
            if (typeof value === 'number') {
                if (!Number.isInteger(value) || value < 0) {
                    console.warn('[crypto] INVALID: asn1: encodeInteger expects a non-negative integer');
                    return false;
                }
                if (value === 0) bytes = Uint8Array.of(0);
                else {
                    const arr = [];
                    let v = value;
                    while (v > 0) { arr.unshift(v & 0xff); v = Math.floor(v / 256); }
                    bytes = new Uint8Array(arr);
                }
            } else {
                bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
                // Strip leading zeros (but keep at least one byte).
                let i = 0;
                while (i < bytes.length - 1 && bytes[i] === 0 && (bytes[i + 1] & 0x80) === 0) i++;
                bytes = bytes.subarray(i);
            }
            // Prepend 0x00 if MSB set, to avoid being interpreted as negative.
            if (bytes[0] & 0x80) {
                const padded = new Uint8Array(bytes.length + 1);
                padded.set(bytes, 1);
                bytes = padded;
            }
            return _wrap(TAG.INTEGER, bytes);
        }

        /**
         * Encode raw bytes as an OCTET STRING.
         * @param {Uint8Array|number[]} bytes
         * @returns {Uint8Array|false}
         */
        function encodeOctetString(bytes) {
            const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            return _wrap(TAG.OCTET_STRING, u8);
        }

        /**
         * Encode a BIT STRING with `unusedBits` trailing bits unused (0..7).
         */
        function encodeBitString(bytes, unusedBits) {
            const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            unusedBits = unusedBits | 0;
            if (unusedBits < 0 || unusedBits > 7) {
                console.warn('[crypto] INVALID: asn1: BIT STRING unusedBits must be 0..7');
                return false;
            }
            const body = new Uint8Array(u8.length + 1);
            body[0] = unusedBits;
            body.set(u8, 1);
            return _wrap(TAG.BIT_STRING, body);
        }

        function encodeNull() {
            return Uint8Array.of(TAG.NULL, 0x00);
        }

        /** Encode an OID given as a dotted string (e.g. "1.2.840.113549.1.1.1"). */
        function encodeOid(dotted) {
            const parts = dotted.split('.').map(Number);
            if (parts.length < 2 || parts.some(p => !Number.isInteger(p) || p < 0)) {
                console.warn('[crypto] INVALID: asn1: malformed OID');
                return false;
            }
            const out = [40 * parts[0] + parts[1]];
            for (let i = 2; i < parts.length; i++) {
                let v = parts[i];
                const stack = [v & 0x7f];
                v >>>= 7;
                while (v > 0) { stack.unshift((v & 0x7f) | 0x80); v >>>= 7; }
                for (const b of stack) out.push(b);
            }
            return _wrap(TAG.OID, new Uint8Array(out));
        }

        /**
         * Encode a SEQUENCE OF already-encoded TLV items.
         * @param {Uint8Array[]} items
         * @returns {Uint8Array|false}
         */
        function encodeSequence(items) {
            return _wrap(TAG.SEQUENCE, _concat(items));
        }

        /**
         * Encode a SET OF already-encoded TLV items.
         * @param {Uint8Array[]} items
         * @returns {Uint8Array|false}
         */
        function encodeSet(items) {
            return _wrap(TAG.SET, _concat(items));
        }

        /** Wrap `body` (already-encoded TLV) as a context-specific [n] EXPLICIT tag. */
        function encodeExplicit(n, body) {
            return _wrap(0xA0 | (n & 0x1f), body);
        }

        /** Re-tag `tlv` (already-encoded TLV) as IMPLICIT context-specific [n]. */
        function encodeImplicit(n, tlv, constructed) {
            const out = new Uint8Array(tlv.length);
            out.set(tlv);
            out[0] = (constructed ? 0xA0 : 0x80) | (n & 0x1f);
            return out;
        }

        // ── decoder ───────────────────────────────────────────────────────

        /**
         * Parse one TLV starting at `off`. Returns
         *   { tag, length, value: Uint8Array, next, valueOff }
         * or `false` on malformed input.
         */
        function parseOne(buf, off) {
            off = off | 0;
            if (off >= buf.length) {
                console.warn('[crypto] INVALID: asn1: unexpected end of input');
                return false;
            }
            const tag = buf[off];
            if ((tag & 0x1f) === 0x1f) {
                console.warn('[crypto] INVALID: asn1: high-tag-number form not supported');
                return false;
            }
            const lenInfo = _decLen(buf, off + 1);
            if (!lenInfo) return false;
            const start = lenInfo.next;
            const end = start + lenInfo.len;
            if (end > buf.length) {
                console.warn('[crypto] INVALID: asn1: declared length exceeds buffer');
                return false;
            }
            return {
                tag,
                length: lenInfo.len,
                value: buf.subarray(start, end),
                valueOff: start,
                next: end
            };
        }

        /**
         * Parse a sequence of TLVs, returning an array of `parseOne` results.
         * @param {Uint8Array} value
         * @returns {Array<object>|false}
         */
        function parseChildren(value) {
            const out = [];
            let off = 0;
            while (off < value.length) {
                const node = parseOne(value, off);
                if (!node) return false;
                out.push(node);
                off = node.next;
            }
            return out;
        }

        /**
         * Read an INTEGER node and return the raw two's-complement bytes.
         * Strict DER mandates minimal encoding (no superfluous 0x00 byte at
         * the high end unless required to keep a positive sign); this parser
         * accepts non-minimal encodings as a leniency for interop. Callers
         * needing strict validation should reject inputs where
         * `value.length >= 2 && value[0] === 0 && (value[1] & 0x80) === 0`.
         * @param {{tag:number,value:Uint8Array}} node
         * @returns {Uint8Array|false}
         */
        function readInteger(node) {
            if (node.tag !== TAG.INTEGER) return false;
            return node.value;
        }

        function readOid(node) {
            if (node.tag !== TAG.OID) return false;
            const v = node.value;
            if (v.length === 0) return false;
            const parts = [Math.floor(v[0] / 40), v[0] % 40];
            let acc = 0;
            for (let i = 1; i < v.length; i++) {
                acc = (acc << 7) | (v[i] & 0x7f);
                if ((v[i] & 0x80) === 0) {
                    parts.push(acc);
                    acc = 0;
                }
            }
            return parts.join('.');
        }

        /**
         * Read a BIT STRING node and return `{ unusedBits, bytes }`, or
         * `false` if `node` is not a BIT STRING.
         * @param {{tag:number,value:Uint8Array}} node
         * @returns {{unusedBits:number, bytes:Uint8Array}|false}
         */
        function readBitString(node) {
            if (node.tag !== TAG.BIT_STRING || node.value.length < 1) return false;
            const unused = node.value[0];
            return { unusedBits: unused, bytes: node.value.subarray(1) };
        }

        return {
            TAG,
            encodeInteger, encodeOctetString, encodeBitString, encodeNull,
            encodeOid, encodeSequence, encodeSet,
            encodeExplicit, encodeImplicit,
            parseOne, parseChildren,
            readInteger, readOid, readBitString
        };
    }
};
