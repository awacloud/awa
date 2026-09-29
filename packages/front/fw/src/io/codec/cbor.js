// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * CBOR (Concise Binary Object Representation, RFC 8949) encoder/decoder -
 * conformance level: Basic Generic Encoder/Decoder (§3) + Preferred
 * Serialization (§4.1) + optional Core Deterministic Encoding (§4.2) via
 * the `{ deterministic: true }` option.
 *
 * Supports every major type, definite and indefinite length containers (decode
 * accepts both, encoder always emits definite length - preferred form), float16
 * / float32 / float64 reduced to the shortest exact representation, canonical
 * NaN, preservation of `-0`, tag passthrough (`Tagged`), simple values
 * (`Simple`), BigInt mapped to major 0/1 when 64-bit-clean or to bignum tag
 * 2/3 beyond.
 *
 * JS mapping - see README.
 *
 * @example
 * const cbor = registry.resolve('cbor');
 * const bytes = cbor.encode({ hello: 'world' });
 * const value = cbor.decode(bytes);
 *
 * // Deterministic encoding (COSE / dag-cbor / WebAuthn) :
 * const sig = cbor.encode({ b: 2, a: 1 }, { deterministic: true });
 *
 * // Preserve non-string keys on decode :
 * const m = cbor.decode(bytes, { useMap: true });
 */
import { utf8 } from './utf8.js';

/**
 * @typedef {object} CborTagged
 * @property {number} tag
 * @property {unknown} value
 */
/**
 * @typedef {object} CborSimple
 * @property {number} value
 */
/**
 * @typedef {object} CborAPI
 * @property {(value: unknown, options?: { deterministic?: boolean }) => Uint8Array} encode
 * @property {(bytes: Uint8Array, options?: { useMap?: boolean }) => unknown} decode
 * @property {new (tag: number, value: unknown) => CborTagged} Tagged
 * @property {new (value: number) => CborSimple} Simple
 */
export const cbor = {
    name: 'cbor',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: ['utf8'],
    deps: [utf8],

    /**
     * Factory function that creates a CBOR encoder/decoder instance.
     *
     * @param {Object} utf8 - UTF-8 codec dependency
     * @returns {CborAPI}
     */
    factory(utf8) {
        /**
         * CBOR tag (major type 6). Passthrough for encode/decode of tags
         * other than the known bignum tags 2 (positive) and 3 (negative),
         * which are converted to/from BigInt automatically.
         */
        class Tagged {
            constructor(tag, value) {
                this.tag = tag;
                this.value = value;
            }
        }

        /**
         * CBOR simple value (major type 7, additional info 0..19 or 32..255).
         * Values 20..23 are aliases for false/true/null/undefined and SHOULD
         * use the JS primitives directly. Values 24..31 are reserved and MUST
         * NOT be emitted (encoder throws).
         */
        class Simple {
            constructor(value) {
                if (!Number.isInteger(value) || value < 0 || value > 255) {
                    throw new Error(`CBOR Simple: value must be 0..255, got ${value}`);
                }
                this.value = value;
            }
        }

        const BREAK = Symbol('cbor/break');

        // ---------- float16 helpers ----------

        function float16ToFloat64(h) {
            const s = (h & 0x8000) ? -1 : 1;
            const e = (h >> 10) & 0x1f;
            const f = h & 0x03ff;
            if (e === 0) return f === 0 ? s * 0 : s * Math.pow(2, -14) * (f / 1024);
            if (e === 0x1f) return f ? NaN : s * Infinity;
            return s * Math.pow(2, e - 15) * (1 + f / 1024);
        }

        function float64ToFloat16(val) {
            if (Number.isNaN(val)) return 0x7e00;
            if (val === Infinity) return 0x7c00;
            if (val === -Infinity) return 0xfc00;
            const f32 = new Float32Array(1);
            const u32 = new Uint32Array(f32.buffer);
            f32[0] = val;
            const x = u32[0];
            const sign = (x >> 16) & 0x8000;
            let exp = ((x >> 23) & 0xff) - 127;
            let mant = x & 0x7fffff;
            if (exp === 128) return sign | 0x7c00 | (mant ? 0x200 : 0);
            exp += 15;
            if (exp >= 31) return sign | 0x7c00;
            if (exp <= 0) {
                if (exp < -10) return sign;
                mant = (mant | 0x800000) >> (1 - exp);
                if (mant & 0x1000) mant += 0x2000;
                return sign | (mant >> 13);
            }
            if (mant & 0x1000) {
                mant += 0x2000;
                if (mant & 0x800000) { mant = 0; exp += 1; if (exp >= 31) return sign | 0x7c00; }
            }
            return sign | (exp << 10) | (mant >> 13);
        }

        function isFloat16Exact(n) {
            return Object.is(float16ToFloat64(float64ToFloat16(n)), n);
        }

        function isFloat32Exact(n) {
            const f32 = new Float32Array(1);
            f32[0] = n;
            return Object.is(f32[0], n);
        }

        // ---------- byte helpers ----------

        function push1(out, b) { out.push(new Uint8Array([b])); }

        function concatChunks(chunks) {
            let total = 0;
            for (let i = 0; i < chunks.length; i++) total += chunks[i].length;
            const out = new Uint8Array(total);
            let offset = 0;
            for (let i = 0; i < chunks.length; i++) {
                out.set(chunks[i], offset);
                offset += chunks[i].length;
            }
            return out;
        }

        function compareBytes(a, b) {
            const n = a.length < b.length ? a.length : b.length;
            for (let i = 0; i < n; i++) {
                if (a[i] !== b[i]) return a[i] - b[i];
            }
            return a.length - b.length;
        }

        // ---------- encoder ----------

        /**
         * Writes a CBOR type/length header (major in high 3 bits, length in low 5).
         * Accepts `n` as Number (≤ 2^53) or BigInt.
         * @private
         */
        function writeHead(out, major, n) {
            const m = major << 5;
            if (typeof n === 'bigint') {
                if (n < 24n) out.push(new Uint8Array([m | Number(n)]));
                else if (n < 0x100n) out.push(new Uint8Array([m | 24, Number(n)]));
                else if (n < 0x10000n) {
                    const b = new Uint8Array(3);
                    b[0] = m | 25;
                    const v = Number(n);
                    b[1] = (v >> 8) & 0xff; b[2] = v & 0xff;
                    out.push(b);
                } else if (n < 0x100000000n) {
                    const b = new Uint8Array(5);
                    b[0] = m | 26;
                    new DataView(b.buffer).setUint32(1, Number(n), false);
                    out.push(b);
                } else {
                    const b = new Uint8Array(9);
                    b[0] = m | 27;
                    new DataView(b.buffer).setBigUint64(1, n, false);
                    out.push(b);
                }
                return;
            }
            if (n < 24) out.push(new Uint8Array([m | n]));
            else if (n < 0x100) out.push(new Uint8Array([m | 24, n]));
            else if (n < 0x10000) {
                const b = new Uint8Array(3);
                b[0] = m | 25;
                b[1] = (n >> 8) & 0xff; b[2] = n & 0xff;
                out.push(b);
            } else if (n < 0x100000000) {
                const b = new Uint8Array(5);
                b[0] = m | 26;
                new DataView(b.buffer).setUint32(1, n, false);
                out.push(b);
            } else {
                const b = new Uint8Array(9);
                b[0] = m | 27;
                new DataView(b.buffer).setBigUint64(1, BigInt(n), false);
                out.push(b);
            }
        }

        function bigintToBytes(n) {
            const hex = n.toString(16);
            const padded = hex.length % 2 ? '0' + hex : hex;
            const len = padded.length / 2;
            const out = new Uint8Array(len);
            for (let i = 0; i < len; i++) out[i] = parseInt(padded.substr(i * 2, 2), 16);
            return out;
        }

        function encodeFloatShortest(val, out) {
            if (Number.isNaN(val) || !Number.isFinite(val) || isFloat16Exact(val)) {
                const b = new Uint8Array(3);
                b[0] = 0xf9;
                const h = Number.isNaN(val) ? 0x7e00 : float64ToFloat16(val);
                b[1] = (h >> 8) & 0xff; b[2] = h & 0xff;
                out.push(b);
                return;
            }
            if (isFloat32Exact(val)) {
                const b = new Uint8Array(5);
                b[0] = 0xfa;
                new DataView(b.buffer).setFloat32(1, val, false);
                out.push(b);
                return;
            }
            const b = new Uint8Array(9);
            b[0] = 0xfb;
            new DataView(b.buffer).setFloat64(1, val, false);
            out.push(b);
        }

        function encodeSimple(n, out) {
            if (n >= 24 && n <= 31) {
                throw new Error(`CBOR: simple(${n}) is reserved and MUST NOT be emitted`);
            }
            if (n < 24) { push1(out, 0xe0 | n); return; }
            // 32..255
            out.push(new Uint8Array([0xf8, n]));
        }

        function encodeMapEntries(entries, out, det) {
            if (det) {
                const items = new Array(entries.length);
                for (let i = 0; i < entries.length; i++) {
                    const [k, v] = entries[i];
                    const keyChunks = [];
                    encodeValue(k, keyChunks, true);
                    items[i] = { keyBytes: concatChunks(keyChunks), keyChunks, v };
                }
                items.sort((a, b) => compareBytes(a.keyBytes, b.keyBytes));
                writeHead(out, 5, items.length);
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    for (let j = 0; j < it.keyChunks.length; j++) out.push(it.keyChunks[j]);
                    encodeValue(it.v, out, true);
                }
            } else {
                writeHead(out, 5, entries.length);
                for (let i = 0; i < entries.length; i++) {
                    encodeValue(entries[i][0], out, false);
                    encodeValue(entries[i][1], out, false);
                }
            }
        }

        function encodeValue(val, out, det) {
            if (val === false) { push1(out, 0xf4); return; }
            if (val === true) { push1(out, 0xf5); return; }
            if (val === null) { push1(out, 0xf6); return; }
            if (val === undefined) { push1(out, 0xf7); return; }

            if (typeof val === 'number') {
                // Preserve -0 : encode as float16 0x8000 (preferred shortest form).
                if (Object.is(val, -0)) {
                    out.push(new Uint8Array([0xf9, 0x80, 0x00]));
                    return;
                }
                if (Number.isInteger(val) && val >= -0x100000000 && val <= 0xffffffff) {
                    if (val >= 0) writeHead(out, 0, val);
                    else writeHead(out, 1, -1 - val);
                    return;
                }
                encodeFloatShortest(val, out);
                return;
            }

            if (typeof val === 'bigint') {
                if (val >= 0n && val <= 0xffffffffffffffffn) { writeHead(out, 0, val); return; }
                if (val < 0n && val >= -0x10000000000000000n) { writeHead(out, 1, -1n - val); return; }
                if (val >= 0n) {
                    writeHead(out, 6, 2);
                    const bytes = bigintToBytes(val);
                    writeHead(out, 2, bytes.length);
                    out.push(bytes);
                } else {
                    writeHead(out, 6, 3);
                    const bytes = bigintToBytes(-1n - val);
                    writeHead(out, 2, bytes.length);
                    out.push(bytes);
                }
                return;
            }

            if (typeof val === 'string') {
                const bytes = utf8.toBytes(val);
                writeHead(out, 3, bytes.length);
                out.push(bytes);
                return;
            }

            if (val instanceof Uint8Array) {
                writeHead(out, 2, val.length);
                out.push(val);
                return;
            }

            if (val instanceof Simple) { encodeSimple(val.value, out); return; }

            if (val instanceof Tagged) {
                writeHead(out, 6, val.tag);
                encodeValue(val.value, out, det);
                return;
            }

            if (Array.isArray(val)) {
                writeHead(out, 4, val.length);
                for (let i = 0; i < val.length; i++) encodeValue(val[i], out, det);
                return;
            }

            if (val instanceof Map) {
                encodeMapEntries([...val], out, det);
                return;
            }

            if (typeof val === 'object') {
                const keys = Object.keys(val);
                const entries = new Array(keys.length);
                for (let i = 0; i < keys.length; i++) entries[i] = [keys[i], val[keys[i]]];
                encodeMapEntries(entries, out, det);
                return;
            }

            throw new Error(`CBOR: cannot encode value of type ${typeof val}`);
        }

        /**
         * Encode a JS value to a CBOR byte array.
         * @param {any} value
         * @param {{deterministic?: boolean}} [options]
         *        `deterministic` : emit §4.2 core deterministic encoding (sort
         *        map keys by bytewise lex of their encoded form). Required for
         *        COSE / WebAuthn / dag-cbor.
         * @returns {Uint8Array}
         */
        function encode(value, options) {
            const det = !!(options && options.deterministic);
            const chunks = [];
            encodeValue(value, chunks, det);
            return concatChunks(chunks);
        }

        // ---------- decoder ----------

        function readArgument(ctx, info) {
            const { view } = ctx;
            if (info < 24) return info;
            if (info === 24) { const v = view.getUint8(ctx.offset); ctx.offset += 1; return v; }
            if (info === 25) { const v = view.getUint16(ctx.offset, false); ctx.offset += 2; return v; }
            if (info === 26) { const v = view.getUint32(ctx.offset, false); ctx.offset += 4; return v; }
            if (info === 27) {
                const hi = view.getUint32(ctx.offset, false);
                const lo = view.getUint32(ctx.offset + 4, false);
                ctx.offset += 8;
                if (hi <= 0x1fffff) return hi * 0x100000000 + lo;
                return (BigInt(hi) << 32n) | BigInt(lo);
            }
            throw new Error(`CBOR: invalid additional info ${info}`);
        }

        function decodeMap(ctx, n) {
            if (ctx.useMap) {
                const m = new Map();
                for (let i = 0; i < n; i++) {
                    const k = decodeValue(ctx);
                    m.set(k, decodeValue(ctx));
                }
                return m;
            }
            const obj = {};
            for (let i = 0; i < n; i++) {
                const k = decodeValue(ctx);
                obj[k] = decodeValue(ctx);
            }
            return obj;
        }

        function decodeValue(ctx) {
            const { view, bytes } = ctx;
            if (ctx.offset >= bytes.length) throw new Error('CBOR: unexpected end of input');
            const initial = view.getUint8(ctx.offset++);
            const major = initial >> 5;
            const info = initial & 0x1f;

            if (major === 7) {
                if (info === 20) return false;
                if (info === 21) return true;
                if (info === 22) return null;
                if (info === 23) return undefined;
                if (info < 24) return new Simple(info);
                if (info === 24) { const v = view.getUint8(ctx.offset); ctx.offset += 1; return new Simple(v); }
                if (info === 25) { const h = view.getUint16(ctx.offset, false); ctx.offset += 2; return float16ToFloat64(h); }
                if (info === 26) { const f = view.getFloat32(ctx.offset, false); ctx.offset += 4; return f; }
                if (info === 27) { const f = view.getFloat64(ctx.offset, false); ctx.offset += 8; return f; }
                if (info === 31) return BREAK;
                throw new Error(`CBOR: invalid info ${info} for major 7`);
            }

            if (info === 31) {
                if (major === 2) {
                    const parts = [];
                    for (; ;) {
                        const next = decodeValue(ctx);
                        if (next === BREAK) break;
                        if (!(next instanceof Uint8Array)) throw new Error('CBOR: expected byte string chunk');
                        parts.push(next);
                    }
                    return concatChunks(parts);
                }
                if (major === 3) {
                    let s = '';
                    for (; ;) {
                        const next = decodeValue(ctx);
                        if (next === BREAK) break;
                        if (typeof next !== 'string') throw new Error('CBOR: expected text string chunk');
                        s += next;
                    }
                    return s;
                }
                if (major === 4) {
                    const arr = [];
                    for (; ;) {
                        const next = decodeValue(ctx);
                        if (next === BREAK) break;
                        arr.push(next);
                    }
                    return arr;
                }
                if (major === 5) {
                    if (ctx.useMap) {
                        const m = new Map();
                        for (; ;) {
                            const k = decodeValue(ctx);
                            if (k === BREAK) break;
                            m.set(k, decodeValue(ctx));
                        }
                        return m;
                    }
                    const obj = {};
                    for (; ;) {
                        const k = decodeValue(ctx);
                        if (k === BREAK) break;
                        obj[k] = decodeValue(ctx);
                    }
                    return obj;
                }
                throw new Error(`CBOR: indefinite length not allowed for major ${major}`);
            }

            const arg = readArgument(ctx, info);

            switch (major) {
                case 0: return arg;
                case 1:
                    if (typeof arg === 'bigint') return -1n - arg;
                    return -1 - arg;
                case 2: {
                    const n = Number(arg);
                    const out = bytes.slice(ctx.offset, ctx.offset + n);
                    ctx.offset += n;
                    return out;
                }
                case 3: {
                    const n = Number(arg);
                    const s = utf8.fromBytes(bytes.subarray(ctx.offset, ctx.offset + n));
                    ctx.offset += n;
                    return s;
                }
                case 4: {
                    const n = Number(arg);
                    const arr = new Array(n);
                    for (let i = 0; i < n; i++) arr[i] = decodeValue(ctx);
                    return arr;
                }
                case 5: return decodeMap(ctx, Number(arg));
                case 6: {
                    const inner = decodeValue(ctx);
                    const tag = typeof arg === 'bigint' ? Number(arg) : arg;
                    if (tag === 2 && inner instanceof Uint8Array) {
                        let n = 0n;
                        for (let i = 0; i < inner.length; i++) n = (n << 8n) | BigInt(inner[i]);
                        return n;
                    }
                    if (tag === 3 && inner instanceof Uint8Array) {
                        let n = 0n;
                        for (let i = 0; i < inner.length; i++) n = (n << 8n) | BigInt(inner[i]);
                        return -1n - n;
                    }
                    return new Tagged(tag, inner);
                }
            }
            throw new Error(`CBOR: invalid major type ${major}`);
        }

        /**
         * Decode a CBOR byte array into a JS value.
         * @param {Uint8Array} bytes
         * @param {{useMap?: boolean}} [options]
         *        `useMap` : return `Map` instances instead of plain objects
         *        (preserves non-string keys and insertion order).
         * @returns {any}
         */
        function decode(bytes, options) {
            const ctx = {
                bytes,
                view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
                offset: 0,
                useMap: !!(options && options.useMap)
            };
            return decodeValue(ctx);
        }

        return { encode, decode, Tagged, Simple };
    }
};
