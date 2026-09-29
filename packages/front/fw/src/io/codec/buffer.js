// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Binary codec for "buffer" values in the awacloud data stream object notation.
 * Encodes values as: [block][length...][payload], where block stores type + length head size.
 *
 * Number payloads are dynamic and little-endian:
 * [numType][bytes...] with the smallest exact representation among
 * uint8/int8/uint16/int16/uint32/int32/float16/float32/float64.
 *
 */
import { valid } from '../utils/valid.js';
import { utf8 } from './utf8.js';

/**
 * Binary "buffer" codec surface returned by `factory()`.
 * @typedef {object} BufferAPI
 * @property {(data: Uint8Array) => any[]} consume - Decode a concatenated stream of buffer blocks into JS values.
 * @property {(data: any) => any} clone - Round-trip a value through encode/decode to produce a structural clone.
 * @property {(data: any) => Uint8Array} out - Encode a JS value into a typed buffer block.
 * @property {(data: Uint8Array) => any} in - Decode a single typed buffer block into a JS value.
 * @property {(len: number, arr: Uint8Array[], out?: Uint8Array, count?: number) => Uint8Array} concat - Concatenate Uint8Array blocks into a single Uint8Array.
 */

export const buffer = {
    // awacloud data stream object notation
    name: 'buffer',
    version: '1.0.0',
    type: 'fw.io.codec',
    dependencies: ['valid', 'utf8'],
    deps: [valid, utf8],

    /**
     * Build the codec with injected dependencies.
     *
     * @param {object} valid
     * @param {(value:any)=>string} valid.is Returns a type name matching TYPE_MAP.
     * @param {object} utf8
     * @param {(bytes:Uint8Array)=>string} utf8.fromBytes
     * @param {(text:string)=>Uint8Array} utf8.toBytes
     * @returns {BufferAPI}
     */
    factory(valid, utf8) {
        const m = {};
        const TYPE_MAP = [
            "-",
            "number",
            "string",
            "boolean",
            "array",
            "object",
            "uint8array",
            "uint8clampedarray"
        ];
        const TYPE_CODE = {
            number: 0x01,
            string: 0x02,
            boolean: 0x03,
            array: 0x04,
            object: 0x05,
            uint8array: 0x06,
            uint8clampedarray: 0x07
        };
        const EMPTY = new Uint8Array(2);
        const MAX_HEAD_BYTES = 4;
        const NUM_TYPE = {
            uint8: 0x01,
            int8: 0x02,
            uint16: 0x03,
            int16: 0x04,
            uint32: 0x05,
            int32: 0x06,
            float16: 0x07,
            float32: 0x08,
            float64: 0x09
        };

        m.const = {
            map: TYPE_MAP,
            type: TYPE_CODE,
            empty: EMPTY
        };

        /**
         * Compute the minimum number of bytes to store a length value (1..4).
         * @param {number} i
         * @returns {number}
         */
        function bytes_len(i) {
            if (i < 1 << 8) {
                return 1;
            } else if (i < 1 << 16) {
                return 2;
            } else if (i < 1 << 24) {
                return 3;
            } else {
                return 4;
            }
        }

        /**
         * Read length bytes from a header array.
         * @param {number} head
         * @param {Uint8Array} arr
         * @param {number} [len]
         * @returns {number}
         */
        m.get_len = function (head, arr, len = 0) {
            for (let i = 0; i < head; i++) {
                len += arr[i + 1] << (i * 8);
            }
            return len;
        };
        /**
         * Generate a little-endian length header.
         * @param {number} len
         * @param {number} head
         * @param {Uint8Array} [arr]
         * @returns {Uint8Array}
         */
        m.gen_len = function (len, head, arr) {
            arr = new Uint8Array(head);
            for (let i = 0; i < head; i++) {
                arr[i] = (len >> (i * 8)) & 0xff;
            }
            return arr;
        };

        /**
         * Concatenate Uint8Array blocks into a single Uint8Array.
         * @param {number} len
         * @param {Uint8Array[]} arr
         * @param {Uint8Array} [out]
         * @param {number} [count]
         * @returns {Uint8Array}
         */
        m.uint_concat = function (len, arr, out, count = 0) {
            out = new Uint8Array(len);
            for (let i = 0; i < arr.length; i++) {
                out.set(arr[i], count);
                count += arr[i].length;
            }
            return out;
        };

        /**
         * Build a typed block: [block][len...][payload].
         * @param {string} type
         * @param {Uint8Array} data
         * @param {number} [len]
         * @param {number} [head]
         * @param {number} [block]
         * @param {Uint8Array} [ui8a]
         * @returns {Uint8Array}
         */
        m.build_value = function (type, data, len = 0, head = 0, block = 0, ui8a) {
            len = data.length;
            // Hard cap: length field is 1..4 bytes little-endian → max 2^32 - 1.
            if (len > 0xffffffff) {
                throw new Error(`buffer: payload length ${len} exceeds 2^32 - 1 limit`);
            }
            head = bytes_len(len);
            block = ((head - 1) << 4) + m.const.type[type];

            ui8a = new Uint8Array(len + head + 1);
            ui8a[0] = block;
            if (head === 1) {
                ui8a[1] = len;
            } else {
                ui8a.set(m.gen_len(len, head), 1);
            }
            ui8a.set(data, head + 1);
            return ui8a;
        };

        /**
         * Read a little-endian length from a byte buffer.
         * @param {Uint8Array} data
         * @param {number} offset
         * @param {number} head
         * @param {number} [len]
         * @returns {number}
         */
        function read_len(data, offset, head, len = 0) {
            for (let i = 0; i < head; i++) {
                len += data[offset + i] << (i * 8);
            }
            return len;
        }

        /**
         * Read a block header and return metadata for payload extraction.
         * @param {Uint8Array} data
         * @param {number} [offset]
         * @returns {{type:number,len:number,head:number,start:number,end:number,next:number}|null}
         */
        function read_header(data, offset = 0) {
            if (offset >= data.length) return null;
            const block = data[offset];
            const type = block & 0x0f;
            if (type <= 0 || type >= m.const.map.length) return null;

            const head = (block >> 4) + 1;
            if (head < 1 || head > MAX_HEAD_BYTES) return null;
            if (offset + head >= data.length) return null;

            const len = (head === 1)
                ? data[offset + 1]
                : read_len(data, offset + 1, head);

            const total = 1 + head + len;
            if (offset + total > data.length) return null;

            return {
                type,
                len,
                head,
                start: offset + 1 + head,
                end: offset + 1 + head + len,
                next: offset + total
            };
        }

        /**
         * Convert an IEEE-754 binary16 to JS number.
         * @param {number} h
         * @returns {number}
         */
        function float16_to_float64(h) {
            const s = (h & 0x8000) ? -1 : 1;
            const e = (h >> 10) & 0x1f;
            const f = h & 0x03ff;
            if (e === 0) {
                if (f === 0) return s * 0;
                return s * Math.pow(2, -14) * (f / 1024);
            }
            if (e === 0x1f) return f ? NaN : s * Infinity;
            return s * Math.pow(2, e - 15) * (1 + f / 1024);
        }

        /**
         * Convert a JS number to IEEE-754 binary16 (rounded).
         * @param {number} val
         * @returns {number}
         */
        function float64_to_float16(val) {
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

            if (exp === 128) {
                return sign | 0x7c00 | (mant ? 0x200 : 0);
            }

            exp += 15;
            if (exp >= 31) {
                return sign | 0x7c00;
            }
            if (exp <= 0) {
                if (exp < -10) return sign;
                mant = (mant | 0x800000) >> (1 - exp);
                if (mant & 0x1000) mant += 0x2000;
                return sign | (mant >> 13);
            }

            if (mant & 0x1000) {
                mant += 0x2000;
                if (mant & 0x800000) {
                    mant = 0;
                    exp += 1;
                    if (exp >= 31) return sign | 0x7c00;
                }
            }

            return sign | (exp << 10) | (mant >> 13);
        }

        /**
         * Check if a number is exactly representable as float32.
         * @param {number} n
         * @returns {boolean}
         */
        function is_float32_exact(n) {
            const f32 = new Float32Array(1);
            f32[0] = n;
            return Object.is(f32[0], n);
        }

        /**
         * Check if a number is exactly representable as float16.
         * @param {number} n
         * @returns {boolean}
         */
        function is_float16_exact(n) {
            const h = float64_to_float16(n);
            const back = float16_to_float64(h);
            return Object.is(back, n);
        }

        /**
         * Encode a JS number to dynamic little-endian bytes:
         * [numType][payload].
         * @param {number} value
         * @returns {Uint8Array}
         */
        function number_to_bytes(value) {
            const n = Number(value);
            if (Number.isNaN(n) || !Number.isFinite(n)) {
                const buf = new ArrayBuffer(1 + 8);
                const u8 = new Uint8Array(buf);
                u8[0] = NUM_TYPE.float64;
                new DataView(buf, 1).setFloat64(0, n, true);
                return u8;
            }

            const isNegZero = Object.is(n, -0);
            if (!isNegZero && Number.isInteger(n)) {
                if (n >= 0) {
                    if (n <= 0xff) {
                        const buf = new ArrayBuffer(1 + 1);
                        const u8 = new Uint8Array(buf);
                        u8[0] = NUM_TYPE.uint8;
                        new DataView(buf, 1).setUint8(0, n);
                        return u8;
                    }
                    if (n <= 0xffff) {
                        const buf = new ArrayBuffer(1 + 2);
                        const u8 = new Uint8Array(buf);
                        u8[0] = NUM_TYPE.uint16;
                        new DataView(buf, 1).setUint16(0, n, true);
                        return u8;
                    }
                    if (n <= 0xffffffff) {
                        const buf = new ArrayBuffer(1 + 4);
                        const u8 = new Uint8Array(buf);
                        u8[0] = NUM_TYPE.uint32;
                        new DataView(buf, 1).setUint32(0, n, true);
                        return u8;
                    }
                } else {
                    if (n >= -0x80) {
                        const buf = new ArrayBuffer(1 + 1);
                        const u8 = new Uint8Array(buf);
                        u8[0] = NUM_TYPE.int8;
                        new DataView(buf, 1).setInt8(0, n);
                        return u8;
                    }
                    if (n >= -0x8000) {
                        const buf = new ArrayBuffer(1 + 2);
                        const u8 = new Uint8Array(buf);
                        u8[0] = NUM_TYPE.int16;
                        new DataView(buf, 1).setInt16(0, n, true);
                        return u8;
                    }
                    if (n >= -0x80000000) {
                        const buf = new ArrayBuffer(1 + 4);
                        const u8 = new Uint8Array(buf);
                        u8[0] = NUM_TYPE.int32;
                        new DataView(buf, 1).setInt32(0, n, true);
                        return u8;
                    }
                }
            }

            if (is_float16_exact(n)) {
                const buf = new ArrayBuffer(1 + 2);
                const u8 = new Uint8Array(buf);
                u8[0] = NUM_TYPE.float16;
                new DataView(buf, 1).setUint16(0, float64_to_float16(n), true);
                return u8;
            }

            if (is_float32_exact(n)) {
                const buf = new ArrayBuffer(1 + 4);
                const u8 = new Uint8Array(buf);
                u8[0] = NUM_TYPE.float32;
                new DataView(buf, 1).setFloat32(0, n, true);
                return u8;
            }

            const buf = new ArrayBuffer(1 + 8);
            const u8 = new Uint8Array(buf);
            u8[0] = NUM_TYPE.float64;
            new DataView(buf, 1).setFloat64(0, n, true);
            return u8;
        }

        /**
         * Decode a payload containing an array of encoded values.
         * @param {Uint8Array} data
         * @param {any[]} [arr]
         * @returns {any[]}
         */
        m.parse_array_in = function (data, arr = []) {
            let offset = 0;
            while (offset < data.length) {
                const info = read_header(data, offset);
                if (!info) break;
                arr.push(fn_in(info.type, info.len, data.subarray(info.start, info.end)));
                offset = info.next;
            }
            return arr;
        };
        /**
         * Encode an array of values into a payload.
         * @param {any[]} data
         * @param {Uint8Array[]} [arr]
         * @param {number} [len]
         * @returns {Uint8Array}
         */
        m.parse_array_out = function (data, arr = [], len = 0) {
            for (let i = 0; i < data.length; i++) {
                const buf = to_buffer(data[i]);
                arr.push(buf);
                len += buf.length;
            }

            return m.uint_concat(len, arr);
        };

        /**
         * Decode a payload containing a key/value object.
         * @param {Uint8Array} data
         * @param {any[]} [arr]
         * @param {object} [obj]
         * @param {number} [len]
         * @returns {object}
         */
        m.parse_object_in = function (data, arr = [], obj = {}, len) {
            arr = m.parse_array_in(data);
            if (arr.length === 2) {
                len = (arr[1].length === arr[0].length) ? arr[0].length : Math.min(arr[1].length, arr[0].length);
                for (let i = 0; i < len; i++) {
                    // The `> 2` guard distinguishes the EMPTY sentinel
                    // (`new Uint8Array(2)`, length 2, emitted by `fn_out` for
                    // "nullish" values via type 0) from a real encoded block.
                    // Any real block is at least 1 header byte + 1 head byte +
                    // 1+ payload byte = ≥ 3 bytes, so this threshold is correct
                    // even for the smallest legitimate values (e.g. uint8 0
                    // encodes to a 4-byte block). The fallback `[]` reflects
                    // the "nullish" decode (no payload available).
                    obj[arr[0][i]] = (arr[1][i].length > 2) ? from_buffer(arr[1][i]) : [];
                }
            }
            return obj;

        };
        /**
         * Encode an object into a payload.
         * @param {object} data
         * @param {Uint8Array[]} [arr]
         * @param {string[]} [map]
         * @returns {Uint8Array}
         */
        m.parse_object_out = function (data, arr = [], map = []) {
            for (const k in data) {
                if (Object.prototype.hasOwnProperty.call(data, k)) {
                    arr[map.push(k) - 1] = to_buffer(data[k]);
                }
            }

            return m.parse_array_out([map, arr]);
        };

        m.in = [
            false,
            function number(data) {
                if (!data.length) return 0;
                const t = data[0];
                const view = new DataView(data.buffer, data.byteOffset + 1, data.length - 1);
                switch (t) {
                    case NUM_TYPE.uint8:
                        return view.getUint8(0);
                    case NUM_TYPE.int8:
                        return view.getInt8(0);
                    case NUM_TYPE.uint16:
                        return view.getUint16(0, true);
                    case NUM_TYPE.int16:
                        return view.getInt16(0, true);
                    case NUM_TYPE.uint32:
                        return view.getUint32(0, true);
                    case NUM_TYPE.int32:
                        return view.getInt32(0, true);
                    case NUM_TYPE.float16: {
                        const h = view.getUint16(0, true);
                        return float16_to_float64(h);
                    }
                    case NUM_TYPE.float32:
                        return view.getFloat32(0, true);
                    case NUM_TYPE.float64:
                        return view.getFloat64(0, true);
                    default:
                        return 0;
                }
            },
            function string(data) {
                return utf8.fromBytes(data);
            },
            function boolean(data) {
                return (data[0] === 1);
            },
            function array(data) {
                return m.parse_array_in(data);
            },
            function object(data) {
                return m.parse_object_in(data);
            },
            function uint8array(data) {
                return data;
            },
            function uint8clampedarray(data) {
                return new Uint8ClampedArray(data);
            }
        ];
        m.out = [
            false,
            function number(data) {
                return m.build_value('number', number_to_bytes(data));
            },
            function string(data) {
                return m.build_value('string', utf8.toBytes(data));
            },
            function boolean(data) {
                return m.build_value('boolean', new Uint8Array([(data) ? 0x01 : 0x00]));
            },
            function array(data) {
                return m.build_value('array', m.parse_array_out(data));
            },
            function object(data) {
                return m.build_value('object', m.parse_object_out(data));
            },
            function uint8array(data) {
                return m.build_value('uint8array', data);
            },
            function uint8clampedarray(data) {
                return m.build_value('uint8clampedarray', data);
            }
        ];

        /**
         * Encode a value by internal type index.
         * @param {number} type
         * @param {any} data
         * @returns {Uint8Array}
         */
        function fn_out(type, data) {
            if (type > 0) {
                // @ts-ignore - dynamic method call on codec object; TS cannot verify callable type
                return m.out[type](data);
            } else {
                return m.const.empty;
            }
        }

        /**
         * Encode a JS value into a typed buffer block.
         * @param {any} data
         * @returns {Uint8Array}
         */
        function to_buffer(data) {
            return fn_out(m.const.map.indexOf(valid.is(data)), data);
        }

        /**
         * Decode a payload by internal type index.
         * @param {number} type
         * @param {number} len
         * @param {Uint8Array} data
         * @returns {any}
         */
        function fn_in(type, len, data) {
            // @ts-ignore - dynamic method call on codec object; TS cannot verify callable type
            return m.in[type](data.slice(0, len));
        }

        /**
         * Decode a single typed buffer block into a JS value.
         * @param {Uint8Array} data
         * @returns {any|null}
         */
        function from_buffer(data) {
            const info = read_header(data, 0);
            if (!info) return null;
            return fn_in(info.type, info.len, data.subarray(info.start, info.end));
        }

        /**
         * Decode a concatenated stream of buffer blocks.
         * @param {Uint8Array} data
         * @param {any[]} [arr]
         * @returns {any[]}
         */
        function consume(data, arr = []) {
            let offset = 0;
            while (offset < data.length) {
                const info = read_header(data, offset);
                if (!info) break;
                arr.push(fn_in(info.type, info.len, data.subarray(info.start, info.end)));
                offset = info.next;
            }
            return arr;
        }

        return {
            /** @type {(data:Uint8Array)=>any[]} */
            consume: consume,
            /** @type {(data:any)=>any} */
            clone: function (data) {
                return from_buffer(to_buffer(data));
            },
            /** @type {(data:any)=>Uint8Array} */
            out: to_buffer,
            /** @type {(data:Uint8Array)=>any} */
            in: from_buffer,
            /** @type {(len:number, arr:Uint8Array[], out?:Uint8Array, count?:number)=>Uint8Array} */
            concat: m.uint_concat
        };
    }
}
