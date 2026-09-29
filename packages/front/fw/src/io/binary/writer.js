// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Endianness-aware writer with auto-growing buffer. Built on top of
 * DataView with a position cursor and typed write methods for
 * primitives, strings and byte arrays.
 *
 * Use cases : binary file format generation (SFNT, BMP, WAV, MP4
 * atoms, PDF streams, custom protocols, …).
 *
 * @example
 * const writer = registry.resolve('binaryWriter');
 * const w = writer.create({ endian: 'be' });
 * w.u32(0x00010000); // OTF version
 * w.u16(12);         // numTables
 * const out = w.finalize();
 */

/** @typedef {'be'|'le'} Endian */

/**
 * A cursor-based writer instance with auto-growing buffer (returned by `create`).
 * Typed write methods return the instance for chaining.
 * @typedef {object} BinaryWriterInstance
 * @property {number} pos current cursor position (read-only getter)
 * @property {number} length logical length / highest written position (read-only getter)
 * @property {(offset: number) => BinaryWriterInstance} seek
 * @property {(n: number) => BinaryWriterInstance} align
 * @property {(v: number) => BinaryWriterInstance} u8
 * @property {(v: number) => BinaryWriterInstance} u16
 * @property {(v: number) => BinaryWriterInstance} u24
 * @property {(v: number) => BinaryWriterInstance} u32
 * @property {(v: bigint) => BinaryWriterInstance} u64
 * @property {(v: number) => BinaryWriterInstance} i8
 * @property {(v: number) => BinaryWriterInstance} i16
 * @property {(v: number) => BinaryWriterInstance} i32
 * @property {(v: bigint) => BinaryWriterInstance} i64
 * @property {(v: number) => BinaryWriterInstance} f32
 * @property {(v: number) => BinaryWriterInstance} f64
 * @property {(arr: Uint8Array) => BinaryWriterInstance} bytes
 * @property {(s: string) => BinaryWriterInstance} utf8
 * @property {(s: string) => BinaryWriterInstance} ascii
 * @property {(s: string) => BinaryWriterInstance} cstring
 * @property {() => Uint8Array} finalize
 */

/**
 * Object returned by `binaryWriter.factory()` - a namespace exposing `create`.
 * @typedef {object} BinaryWriterCtor
 * @property {(opts?: { endian?: Endian, initialSize?: number }) => BinaryWriterInstance} create
 */

export const binaryWriter = {
    name: 'binaryWriter',
    version: '1.0.0',
    type: 'fw.io.binary',
    dependencies: [],
    /** @returns {BinaryWriterCtor} */
    factory() {
        const DEFAULT_INITIAL_SIZE = 256;
        const GROWTH_FACTOR = 2;
        // Cached TextEncoder shared by all writers from this factory.
        const _encoder = new TextEncoder();

        /**
         * @param {string} code
         * @param {string} msg
         * @param {object} [ctx]
         * @returns {Error}
         */
        function contractError(code, msg, ctx) {
            const err = new Error(msg);
            err.name = 'ContractError';
            // @ts-ignore - Error.code/context is a non-standard but widely-used extension
            err.code = code;
            // @ts-ignore - Error.code/context is a non-standard but widely-used extension
            if (ctx) err.context = ctx;
            return err;
        }

        /**
         * Create a binary writer.
         * @param {{ endian?: Endian, initialSize?: number }} [opts]
         * @returns {object}
         */
        function create(opts) {
            const options = opts || {};
            let _endian = options.endian === 'le' ? 'le' : 'be';
            let _cap = (options.initialSize && options.initialSize > 0) ? options.initialSize : DEFAULT_INITIAL_SIZE;
            let _buf = new ArrayBuffer(_cap);
            let _u8 = new Uint8Array(_buf);
            let _dv = new DataView(_buf);
            let _pos = 0;
            let _len = 0; // logical length (highest written pos)

            const le = () => _endian === 'le';

            /**
             * Ensure at least `needed` more bytes from current _pos.
             * @param {number} needed
             */
            function _ensure(needed) {
                const required = _pos + needed;
                if (required <= _cap) return;
                let newCap = _cap * GROWTH_FACTOR;
                while (newCap < required) newCap *= GROWTH_FACTOR;
                const newBuf = new ArrayBuffer(newCap);
                const newU8 = new Uint8Array(newBuf);
                newU8.set(_u8.subarray(0, _len));
                _cap = newCap;
                _buf = newBuf;
                _u8 = newU8;
                _dv = new DataView(newBuf);
            }

            /**
             * Update logical length after a write at _pos with n bytes.
             * @param {number} n
             */
            function _advance(n) {
                _pos += n;
                if (_pos > _len) _len = _pos;
            }

            const w = {
                /** @returns {number} */
                get pos() { return _pos; },
                /** @returns {number} */
                get length() { return _len; },

                /**
                 * Absolute seek - can overwrite previously written data.
                 * Note: seeking forward past the logical length without writing
                 * does NOT extend `length`; the logical end is only updated on write.
                 * @param {number} offset
                 * @returns {object} this
                 */
                seek(offset) {
                    if (offset < 0) {
                        throw contractError('binary/writer-seek', 'seek offset must be >= 0', { offset });
                    }
                    _pos = offset;
                    return w;
                },

                /**
                 * Pad with 0x00 bytes until pos is a multiple of n.
                 * @param {number} n alignment boundary
                 * @returns {object} this
                 */
                align(n) {
                    if (n <= 0) {
                        throw contractError('binary/writer-align', 'align argument must be > 0', { n });
                    }
                    const rem = _pos % n;
                    if (rem === 0) return w;
                    const pad = n - rem;
                    _ensure(pad);
                    for (let i = 0; i < pad; i++) {
                        _u8[_pos + i] = 0;
                    }
                    _advance(pad);
                    return w;
                },

                // ── Unsigned integers ──────────────────────────────────────────

                /** @param {number} v @returns {object} this */
                u8(v) {
                    _ensure(1);
                    _dv.setUint8(_pos, v & 0xFF);
                    _advance(1);
                    return w;
                },

                /** @param {number} v @returns {object} this */
                u16(v) {
                    _ensure(2);
                    _dv.setUint16(_pos, v & 0xFFFF, le());
                    _advance(2);
                    return w;
                },

                /** @param {number} v @returns {object} this */
                u24(v) {
                    _ensure(3);
                    if (le()) {
                        _u8[_pos]     = v & 0xFF;
                        _u8[_pos + 1] = (v >>> 8) & 0xFF;
                        _u8[_pos + 2] = (v >>> 16) & 0xFF;
                    } else {
                        _u8[_pos]     = (v >>> 16) & 0xFF;
                        _u8[_pos + 1] = (v >>> 8) & 0xFF;
                        _u8[_pos + 2] = v & 0xFF;
                    }
                    _advance(3);
                    return w;
                },

                /** @param {number} v @returns {object} this */
                u32(v) {
                    _ensure(4);
                    _dv.setUint32(_pos, v >>> 0, le());
                    _advance(4);
                    return w;
                },

                /** @param {bigint} v @returns {object} this */
                u64(v) {
                    _ensure(8);
                    _dv.setBigUint64(_pos, v, le());
                    _advance(8);
                    return w;
                },

                // ── Signed integers ────────────────────────────────────────────

                /** @param {number} v @returns {object} this */
                i8(v) {
                    _ensure(1);
                    _dv.setInt8(_pos, v);
                    _advance(1);
                    return w;
                },

                /** @param {number} v @returns {object} this */
                i16(v) {
                    _ensure(2);
                    _dv.setInt16(_pos, v, le());
                    _advance(2);
                    return w;
                },

                /** @param {number} v @returns {object} this */
                i32(v) {
                    _ensure(4);
                    _dv.setInt32(_pos, v, le());
                    _advance(4);
                    return w;
                },

                /** @param {bigint} v @returns {object} this */
                i64(v) {
                    _ensure(8);
                    _dv.setBigInt64(_pos, v, le());
                    _advance(8);
                    return w;
                },

                // ── Floats ─────────────────────────────────────────────────────

                /** @param {number} v @returns {object} this */
                f32(v) {
                    _ensure(4);
                    _dv.setFloat32(_pos, v, le());
                    _advance(4);
                    return w;
                },

                /** @param {number} v @returns {object} this */
                f64(v) {
                    _ensure(8);
                    _dv.setFloat64(_pos, v, le());
                    _advance(8);
                    return w;
                },

                // ── Bytes / strings ────────────────────────────────────────────

                /**
                 * Write a Uint8Array.
                 * @param {Uint8Array} arr
                 * @returns {object} this
                 */
                bytes(arr) {
                    if (!(arr instanceof Uint8Array)) {
                        throw contractError('binary/writer-bytes', 'bytes() expects Uint8Array', { actual: typeof arr });
                    }
                    _ensure(arr.byteLength);
                    _u8.set(arr, _pos);
                    _advance(arr.byteLength);
                    return w;
                },

                /**
                 * Encode string as UTF-8 and write bytes.
                 * @param {string} s
                 * @returns {object} this
                 */
                utf8(s) {
                    if (typeof s !== 'string') {
                        throw contractError('binary/writer-utf8', 'utf8() expects string', { actual: typeof s });
                    }
                    const encoded = _encoder.encode(s);
                    return w.bytes(encoded);
                },

                /**
                 * Write ASCII string. Throws if any char code > 127.
                 * @param {string} s
                 * @returns {object} this
                 */
                ascii(s) {
                    if (typeof s !== 'string') {
                        throw contractError('binary/writer-ascii', 'ascii() expects string', { actual: typeof s });
                    }
                    _ensure(s.length);
                    for (let i = 0; i < s.length; i++) {
                        const code = s.charCodeAt(i);
                        if (code > 127) {
                            throw contractError('binary/writer-ascii', 'non-ASCII character encountered', { char: s[i], code, index: i });
                        }
                        _u8[_pos + i] = code;
                    }
                    _advance(s.length);
                    return w;
                },

                /**
                 * Write NUL-terminated UTF-8 string.
                 * @param {string} s
                 * @returns {object} this
                 */
                cstring(s) {
                    if (typeof s !== 'string') {
                        throw contractError('binary/writer-cstring', 'cstring() expects string', { actual: typeof s });
                    }
                    w.utf8(s);
                    w.u8(0x00);
                    return w;
                },

                /**
                 * Finalize: return exact-length Uint8Array of written bytes.
                 * @returns {Uint8Array}
                 */
                finalize() {
                    // Return a copy truncated to logical length
                    return new Uint8Array(_buf.slice(0, _len));
                }
            };

            return w;
        }

        return { create };
    }
};
