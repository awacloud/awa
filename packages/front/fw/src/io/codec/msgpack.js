// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * MessagePack encoder/decoder, full spec conformance
 * (https://github.com/msgpack/msgpack/blob/master/spec.md).
 *
 * Supports all core types : nil, bool, int (fixint/int/uint 8/16/32/64),
 * float32/64 (encoder emits shortest exact), str (fixstr/str8/16/32),
 * bin (bin8/16/32), array (fixarray/array16/32), map (fixmap/map16/32),
 * ext (fixext 1/2/4/8/16, ext8/16/32), and the standard **timestamp
 * extension** (type -1) - `Date` auto-encodes to timestamp 32/64/96 and
 * decodes back to `Date`.
 *
 * @example
 * const msgpack = registry.resolve('msgpack');
 * const bytes = msgpack.encode({ at: new Date(), n: 42 });
 * const value = msgpack.decode(bytes); // { at: Date, n: 42 }
 *
 * // Preserve non-string keys / ordering :
 * const m = msgpack.decode(bytes, { useMap: true });
 */
import { utf8 } from './utf8.js';

/**
 * @typedef {object} MsgpackExt
 * @property {number} type
 * @property {Uint8Array} data
 */
/**
 * @typedef {object} MsgpackAPI
 * @property {(value: unknown) => Uint8Array} encode
 * @property {(bytes: Uint8Array, options?: { useMap?: boolean }) => unknown} decode
 * @property {new (type: number, data: Uint8Array) => MsgpackExt} Ext
 */
export const msgpack = {
    name: 'msgpack',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: ['utf8'],
    deps: [utf8],

    /**
     * Factory function that creates a MessagePack encoder/decoder instance.
     * @param {Object} utf8 - UTF-8 codec dependency
     * @returns {MsgpackAPI}
     */
    factory(utf8) {
        /**
         * Extension type - wraps a type code (signed int8, -128..127) and a
         * payload (`Uint8Array`). Used both for application-defined types and
         * as passthrough for unknown ext on decode. Type -1 is reserved for
         * the standard timestamp extension (auto-handled via `Date`).
         */
        class Ext {
            constructor(type, data) {
                this.type = type;
                this.data = data;
            }
        }

        // ---------- helpers ----------

        function push1(out, b) { out.push(new Uint8Array([b])); }

        function isFloat32Exact(n) {
            const f32 = new Float32Array(1);
            f32[0] = n;
            return Object.is(f32[0], n);
        }

        // ---------- timestamp extension (type -1) ----------

        function encodeTimestamp(date, out) {
            const ms = date.getTime();
            let sec = Math.floor(ms / 1000);
            let ns = (ms - sec * 1000) * 1e6;
            if (ns < 0) { sec -= 1; ns += 1e9; }

            // timestamp 32 : fixext4, type -1, 32-bit unsigned seconds
            if (ns === 0 && sec >= 0 && sec <= 0xffffffff) {
                const b = new Uint8Array(6);
                b[0] = 0xd6;
                b[1] = 0xff; // -1
                new DataView(b.buffer).setUint32(2, sec, false);
                out.push(b);
                return;
            }
            // timestamp 64 : fixext8, type -1, 30-bit ns << 34 | 34-bit sec
            if (sec >= 0 && sec < 0x400000000) {
                const packed = (BigInt(ns) << 34n) | BigInt(sec);
                const b = new Uint8Array(10);
                b[0] = 0xd7;
                b[1] = 0xff;
                new DataView(b.buffer).setBigUint64(2, packed, false);
                out.push(b);
                return;
            }
            // timestamp 96 : ext8, len=12, type -1, 32-bit ns, 64-bit signed sec
            const b = new Uint8Array(15);
            b[0] = 0xc7;
            b[1] = 12;
            b[2] = 0xff;
            const view = new DataView(b.buffer);
            view.setUint32(3, ns, false);
            view.setBigInt64(7, BigInt(sec), false);
            out.push(b);
        }

        function decodeTimestamp(view, offset, len) {
            if (len === 4) {
                const sec = view.getUint32(offset, false);
                return new Date(sec * 1000);
            }
            if (len === 8) {
                const packed = view.getBigUint64(offset, false);
                const ns = Number(packed >> 34n);
                const sec = Number(packed & ((1n << 34n) - 1n));
                return new Date(sec * 1000 + Math.round(ns / 1e6));
            }
            if (len === 12) {
                const ns = view.getUint32(offset, false);
                const sec = view.getBigInt64(offset + 4, false);
                return new Date(Number(sec) * 1000 + Math.round(ns / 1e6));
            }
            return null; // not a valid timestamp length
        }

        // ---------- encoder ----------

        function encodeNumber(val, out) {
            // Preserve -0 : cannot go through the integer path.
            if (Object.is(val, -0)) {
                const b = new Uint8Array(5);
                b[0] = 0xca;
                new DataView(b.buffer).setFloat32(1, -0, false);
                out.push(b);
                return;
            }
            if (Number.isFinite(val) && Number.isInteger(val) &&
                val >= -0x80000000 && val <= 0xffffffff) {
                if (val >= 0) {
                    if (val <= 0x7f) { push1(out, val); return; }
                    if (val <= 0xff) { out.push(new Uint8Array([0xcc, val])); return; }
                    if (val <= 0xffff) {
                        const b = new Uint8Array(3);
                        b[0] = 0xcd;
                        new DataView(b.buffer).setUint16(1, val, false);
                        out.push(b); return;
                    }
                    const b = new Uint8Array(5);
                    b[0] = 0xce;
                    new DataView(b.buffer).setUint32(1, val, false);
                    out.push(b); return;
                }
                if (val >= -32) { push1(out, val & 0xff); return; }
                if (val >= -0x80) { out.push(new Uint8Array([0xd0, val & 0xff])); return; }
                if (val >= -0x8000) {
                    const b = new Uint8Array(3);
                    b[0] = 0xd1;
                    new DataView(b.buffer).setInt16(1, val, false);
                    out.push(b); return;
                }
                const b = new Uint8Array(5);
                b[0] = 0xd2;
                new DataView(b.buffer).setInt32(1, val, false);
                out.push(b); return;
            }
            // Float : emit float32 if exact, else float64.
            if (Number.isFinite(val) && isFloat32Exact(val)) {
                const b = new Uint8Array(5);
                b[0] = 0xca;
                new DataView(b.buffer).setFloat32(1, val, false);
                out.push(b);
                return;
            }
            const b = new Uint8Array(9);
            b[0] = 0xcb;
            new DataView(b.buffer).setFloat64(1, val, false);
            out.push(b);
        }

        function encodeBigInt(val, out) {
            if (val >= 0n && val <= 0xffffffffffffffffn) {
                const b = new Uint8Array(9);
                b[0] = 0xcf;
                new DataView(b.buffer).setBigUint64(1, val, false);
                out.push(b);
                return;
            }
            if (val < 0n && val >= -0x8000000000000000n) {
                const b = new Uint8Array(9);
                b[0] = 0xd3;
                new DataView(b.buffer).setBigInt64(1, val, false);
                out.push(b);
                return;
            }
            throw new Error(`msgpack: BigInt out of 64-bit range: ${val}`);
        }

        function encodeString(val, out) {
            const bytes = utf8.toBytes(val);
            const len = bytes.length;
            if (len <= 0x1f) {
                out.push(new Uint8Array([0xa0 | len]));
            } else if (len <= 0xff) {
                out.push(new Uint8Array([0xd9, len]));
            } else if (len <= 0xffff) {
                const b = new Uint8Array(3);
                b[0] = 0xda;
                new DataView(b.buffer).setUint16(1, len, false);
                out.push(b);
            } else {
                const b = new Uint8Array(5);
                b[0] = 0xdb;
                new DataView(b.buffer).setUint32(1, len, false);
                out.push(b);
            }
            out.push(bytes);
        }

        function encodeBinary(val, out) {
            const len = val.length;
            if (len <= 0xff) {
                out.push(new Uint8Array([0xc4, len]));
            } else if (len <= 0xffff) {
                const b = new Uint8Array(3);
                b[0] = 0xc5;
                new DataView(b.buffer).setUint16(1, len, false);
                out.push(b);
            } else {
                const b = new Uint8Array(5);
                b[0] = 0xc6;
                new DataView(b.buffer).setUint32(1, len, false);
                out.push(b);
            }
            out.push(val);
        }

        function encodeArrayHead(out, len) {
            if (len <= 0x0f) { push1(out, 0x90 | len); }
            else if (len <= 0xffff) {
                const b = new Uint8Array(3);
                b[0] = 0xdc;
                new DataView(b.buffer).setUint16(1, len, false);
                out.push(b);
            } else {
                const b = new Uint8Array(5);
                b[0] = 0xdd;
                new DataView(b.buffer).setUint32(1, len, false);
                out.push(b);
            }
        }

        function encodeMapHead(out, len) {
            if (len <= 0x0f) { push1(out, 0x80 | len); }
            else if (len <= 0xffff) {
                const b = new Uint8Array(3);
                b[0] = 0xde;
                new DataView(b.buffer).setUint16(1, len, false);
                out.push(b);
            } else {
                const b = new Uint8Array(5);
                b[0] = 0xdf;
                new DataView(b.buffer).setUint32(1, len, false);
                out.push(b);
            }
        }

        function encodeExt(ext, out) {
            const len = ext.data.length;
            const type = ext.type & 0xff;
            if (len === 1) { out.push(new Uint8Array([0xd4, type])); out.push(ext.data); return; }
            if (len === 2) { out.push(new Uint8Array([0xd5, type])); out.push(ext.data); return; }
            if (len === 4) { out.push(new Uint8Array([0xd6, type])); out.push(ext.data); return; }
            if (len === 8) { out.push(new Uint8Array([0xd7, type])); out.push(ext.data); return; }
            if (len === 16) { out.push(new Uint8Array([0xd8, type])); out.push(ext.data); return; }
            if (len <= 0xff) {
                out.push(new Uint8Array([0xc7, len, type]));
            } else if (len <= 0xffff) {
                const b = new Uint8Array(4);
                b[0] = 0xc8;
                new DataView(b.buffer).setUint16(1, len, false);
                b[3] = type;
                out.push(b);
            } else {
                const b = new Uint8Array(6);
                b[0] = 0xc9;
                new DataView(b.buffer).setUint32(1, len, false);
                b[5] = type;
                out.push(b);
            }
            out.push(ext.data);
        }

        function encodeValue(val, out) {
            if (val === null || val === undefined) { push1(out, 0xc0); return; }
            if (val === false) { push1(out, 0xc2); return; }
            if (val === true) { push1(out, 0xc3); return; }

            const t = typeof val;
            if (t === 'number') { encodeNumber(val, out); return; }
            if (t === 'bigint') { encodeBigInt(val, out); return; }
            if (t === 'string') { encodeString(val, out); return; }

            if (val instanceof Date) { encodeTimestamp(val, out); return; }
            if (val instanceof Uint8Array) { encodeBinary(val, out); return; }
            if (val instanceof Ext) { encodeExt(val, out); return; }

            if (Array.isArray(val)) {
                encodeArrayHead(out, val.length);
                for (let i = 0; i < val.length; i++) encodeValue(val[i], out);
                return;
            }

            if (val instanceof Map) {
                encodeMapHead(out, val.size);
                for (const [k, v] of val) { encodeValue(k, out); encodeValue(v, out); }
                return;
            }

            if (t === 'object') {
                const keys = Object.keys(val);
                encodeMapHead(out, keys.length);
                for (let i = 0; i < keys.length; i++) {
                    encodeValue(keys[i], out);
                    encodeValue(val[keys[i]], out);
                }
                return;
            }

            throw new Error(`msgpack: cannot encode value of type ${t}`);
        }

        /**
         * Encode a JS value to a MessagePack byte array.
         * @param {any} value
         * @returns {Uint8Array}
         */
        function encode(value) {
            const chunks = [];
            encodeValue(value, chunks);
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

        // ---------- decoder ----------

        function readBinary(ctx, len) {
            const out = ctx.bytes.slice(ctx.offset, ctx.offset + len);
            ctx.offset += len;
            return out;
        }

        function readString(ctx, len) {
            const s = utf8.fromBytes(ctx.bytes.subarray(ctx.offset, ctx.offset + len));
            ctx.offset += len;
            return s;
        }

        function readArray(ctx, len) {
            const arr = new Array(len);
            for (let i = 0; i < len; i++) arr[i] = decodeValue(ctx);
            return arr;
        }

        function readMap(ctx, len) {
            if (ctx.useMap) {
                const m = new Map();
                for (let i = 0; i < len; i++) {
                    const k = decodeValue(ctx);
                    m.set(k, decodeValue(ctx));
                }
                return m;
            }
            const obj = {};
            for (let i = 0; i < len; i++) {
                const k = decodeValue(ctx);
                obj[k] = decodeValue(ctx);
            }
            return obj;
        }

        function readExt(ctx, len) {
            const type = ctx.view.getInt8(ctx.offset); ctx.offset += 1;
            if (type === -1) {
                const date = decodeTimestamp(ctx.view, ctx.offset, len);
                if (date !== null) { ctx.offset += len; return date; }
            }
            const data = ctx.bytes.slice(ctx.offset, ctx.offset + len);
            ctx.offset += len;
            return new Ext(type, data);
        }

        function decodeValue(ctx) {
            const { view } = ctx;
            if (ctx.offset >= ctx.bytes.length) throw new Error('msgpack: unexpected end of input');
            const b = view.getUint8(ctx.offset++);

            if (b <= 0x7f) return b;
            if (b >= 0xe0) return b - 0x100;
            if (b >= 0x80 && b <= 0x8f) return readMap(ctx, b & 0x0f);
            if (b >= 0x90 && b <= 0x9f) return readArray(ctx, b & 0x0f);
            if (b >= 0xa0 && b <= 0xbf) return readString(ctx, b & 0x1f);

            switch (b) {
                case 0xc0: return null;
                case 0xc2: return false;
                case 0xc3: return true;

                case 0xc4: { const l = view.getUint8(ctx.offset); ctx.offset += 1; return readBinary(ctx, l); }
                case 0xc5: { const l = view.getUint16(ctx.offset, false); ctx.offset += 2; return readBinary(ctx, l); }
                case 0xc6: { const l = view.getUint32(ctx.offset, false); ctx.offset += 4; return readBinary(ctx, l); }

                case 0xc7: { const l = view.getUint8(ctx.offset); ctx.offset += 1; return readExt(ctx, l); }
                case 0xc8: { const l = view.getUint16(ctx.offset, false); ctx.offset += 2; return readExt(ctx, l); }
                case 0xc9: { const l = view.getUint32(ctx.offset, false); ctx.offset += 4; return readExt(ctx, l); }

                case 0xca: { const v = view.getFloat32(ctx.offset, false); ctx.offset += 4; return v; }
                case 0xcb: { const v = view.getFloat64(ctx.offset, false); ctx.offset += 8; return v; }

                case 0xcc: { const v = view.getUint8(ctx.offset); ctx.offset += 1; return v; }
                case 0xcd: { const v = view.getUint16(ctx.offset, false); ctx.offset += 2; return v; }
                case 0xce: { const v = view.getUint32(ctx.offset, false); ctx.offset += 4; return v; }
                case 0xcf: {
                    const hi = view.getUint32(ctx.offset, false);
                    const lo = view.getUint32(ctx.offset + 4, false);
                    ctx.offset += 8;
                    if (hi <= 0x1fffff) return hi * 0x100000000 + lo;
                    return (BigInt(hi) << 32n) | BigInt(lo);
                }

                case 0xd0: { const v = view.getInt8(ctx.offset); ctx.offset += 1; return v; }
                case 0xd1: { const v = view.getInt16(ctx.offset, false); ctx.offset += 2; return v; }
                case 0xd2: { const v = view.getInt32(ctx.offset, false); ctx.offset += 4; return v; }
                case 0xd3: {
                    const v = view.getBigInt64(ctx.offset, false);
                    ctx.offset += 8;
                    if (v >= -0x20000000000000n && v <= 0x20000000000000n) return Number(v);
                    return v;
                }

                case 0xd4: return readExt(ctx, 1);
                case 0xd5: return readExt(ctx, 2);
                case 0xd6: return readExt(ctx, 4);
                case 0xd7: return readExt(ctx, 8);
                case 0xd8: return readExt(ctx, 16);

                case 0xd9: { const l = view.getUint8(ctx.offset); ctx.offset += 1; return readString(ctx, l); }
                case 0xda: { const l = view.getUint16(ctx.offset, false); ctx.offset += 2; return readString(ctx, l); }
                case 0xdb: { const l = view.getUint32(ctx.offset, false); ctx.offset += 4; return readString(ctx, l); }

                case 0xdc: { const l = view.getUint16(ctx.offset, false); ctx.offset += 2; return readArray(ctx, l); }
                case 0xdd: { const l = view.getUint32(ctx.offset, false); ctx.offset += 4; return readArray(ctx, l); }

                case 0xde: { const l = view.getUint16(ctx.offset, false); ctx.offset += 2; return readMap(ctx, l); }
                case 0xdf: { const l = view.getUint32(ctx.offset, false); ctx.offset += 4; return readMap(ctx, l); }
            }
            throw new Error(`msgpack: unknown prefix 0x${b.toString(16)}`);
        }

        /**
         * Decode a MessagePack byte array into a JS value.
         * @param {Uint8Array} bytes
         * @param {{useMap?: boolean}} [options]
         *        `useMap` : return `Map` instances (preserves non-string keys
         *        and insertion order) instead of plain objects.
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

        return { encode, decode, Ext };
    }
};
