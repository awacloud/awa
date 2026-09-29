// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Endianness-aware reader over Uint8Array. Built on top of DataView
 * with a position cursor and convenience methods for typed primitives,
 * fixed-length strings, and NUL-terminated strings.
 *
 * Use cases : binary file formats (TIFF, SFNT, PDF streams, BMP, WAV,
 * MIDI, MP4 atoms, ID3v2, …).
 *
 * @example
 * const reader = registry.resolve('binaryReader');
 * const r = reader.create(bytes, { endian: 'be' });
 * const magic = r.u32(); // big-endian magic number
 * r.skip(4);
 * const version = r.u16();
 */

/** @typedef {'be'|'le'} Endian */

/**
 * A cursor-based reader instance over a Uint8Array (returned by `create`).
 * @typedef {object} BinaryReaderInstance
 * @property {number} pos current cursor position (read-only getter)
 * @property {number} length total byte length (read-only getter)
 * @property {() => boolean} eof
 * @property {() => number} tell
 * @property {(offset: number) => BinaryReaderInstance} seek
 * @property {(n: number) => BinaryReaderInstance} skip
 * @property {(n: number) => Uint8Array} peek
 * @property {(e: Endian) => void} setEndian
 * @property {() => number} u8
 * @property {() => number} u16
 * @property {() => number} u24
 * @property {() => number} u32
 * @property {() => bigint} u64
 * @property {() => number} u64Safe
 * @property {() => number} i8
 * @property {() => number} i16
 * @property {() => number} i32
 * @property {() => bigint} i64
 * @property {() => number} f32
 * @property {() => number} f64
 * @property {(n: number) => Uint8Array} bytes
 * @property {(n: number) => string} utf8
 * @property {(n: number) => string} ascii
 * @property {() => string} cstring
 * @property {(offset: number, length: number) => BinaryReaderInstance} sub
 */

/**
 * Object returned by `binaryReader.factory()` - a namespace exposing `create`.
 * @typedef {object} BinaryReaderCtor
 * @property {(uint8: Uint8Array, opts?: { endian?: Endian }) => BinaryReaderInstance} create
 */

export const binaryReader = {
    name: 'binaryReader',
    version: '1.0.0',
    type: 'fw.io.binary',
    dependencies: [],
    /** @returns {BinaryReaderCtor} */
    factory() {
        // ── Shared TextDecoder (1 instance per factory call) ──────────────
        const _decoder = new TextDecoder('utf-8');

        /**
         * Creates a ContractError with a typed code.
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
         * Create a binary reader over a Uint8Array.
         * @param {Uint8Array} uint8
         * @param {{ endian?: Endian }} [opts]
         * @returns {object}
         */
        function create(uint8, opts) {
            if (!(uint8 instanceof Uint8Array)) {
                throw contractError('binary/reader-input', 'binaryReader.create expects Uint8Array', { actual: typeof uint8 });
            }
            const options = opts || {};
            let _endian = options.endian === 'le' ? 'le' : 'be';
            const _bytes = uint8;
            const _dv = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
            const _len = uint8.byteLength;
            let _pos = 0;

            /**
             * @param {number} n bytes needed
             */
            function _need(n) {
                if (_pos + n > _len) {
                    throw contractError('binary/reader-eof', 'unexpected end of stream', {
                        needed: n, pos: _pos, length: _len
                    });
                }
            }

            const le = () => _endian === 'le';

            const r = {
                /** @returns {number} */
                get pos() { return _pos; },
                /** @returns {number} */
                get length() { return _len; },

                /** @returns {boolean} */
                eof() { return _pos >= _len; },

                /** Alias of pos for symmetry. @returns {number} */
                tell() { return _pos; },

                /**
                 * Absolute seek.
                 * @param {number} offset
                 * @returns {object} this
                 */
                seek(offset) {
                    if (offset < 0 || offset > _len) {
                        throw contractError('binary/reader-seek', 'seek out of bounds', { offset, length: _len });
                    }
                    _pos = offset;
                    return r;
                },

                /**
                 * Relative skip.
                 * @param {number} n
                 * @returns {object} this
                 */
                skip(n) {
                    return r.seek(_pos + n);
                },

                /**
                 * Read n bytes without advancing pos. The returned Uint8Array is a
                 * zero-copy view aliasing the source buffer - mutations to it will
                 * mutate the underlying data.
                 * @param {number} n
                 * @returns {Uint8Array} view sharing the source buffer
                 */
                peek(n) {
                    _need(n);
                    return new Uint8Array(_bytes.buffer, _bytes.byteOffset + _pos, n);
                },

                /**
                 * Switch endianness mid-stream.
                 * @param {Endian} e
                 */
                setEndian(e) {
                    if (e !== 'be' && e !== 'le') {
                        throw contractError('binary/reader-endian', 'endian must be "be" or "le"', { actual: e });
                    }
                    _endian = e;
                },

                // ── Unsigned integers ──────────────────────────────────────────

                /** @returns {number} uint8 */
                u8() {
                    _need(1);
                    const v = _dv.getUint8(_pos);
                    _pos += 1;
                    return v;
                },

                /** @returns {number} uint16 */
                u16() {
                    _need(2);
                    const v = _dv.getUint16(_pos, le());
                    _pos += 2;
                    return v;
                },

                /** @returns {number} uint24 */
                u24() {
                    _need(3);
                    let v;
                    if (le()) {
                        v = _dv.getUint8(_pos)
                          | (_dv.getUint8(_pos + 1) << 8)
                          | (_dv.getUint8(_pos + 2) << 16);
                    } else {
                        v = (_dv.getUint8(_pos) << 16)
                          | (_dv.getUint8(_pos + 1) << 8)
                          |  _dv.getUint8(_pos + 2);
                    }
                    _pos += 3;
                    return v >>> 0;
                },

                /** @returns {number} uint32 */
                u32() {
                    _need(4);
                    const v = _dv.getUint32(_pos, le());
                    _pos += 4;
                    return v >>> 0;
                },

                /** @returns {bigint} uint64 */
                u64() {
                    _need(8);
                    const v = _dv.getBigUint64(_pos, le());
                    _pos += 8;
                    return v;
                },

                /**
                 * u64 safe - returns Number, throws if > Number.MAX_SAFE_INTEGER.
                 * @returns {number}
                 */
                u64Safe() {
                    const v = r.u64();
                    if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
                        throw contractError('binary/reader-u64safe', 'u64 value exceeds Number.MAX_SAFE_INTEGER', { value: v.toString() });
                    }
                    return Number(v);
                },

                // ── Signed integers ────────────────────────────────────────────

                /** @returns {number} int8 */
                i8() {
                    _need(1);
                    const v = _dv.getInt8(_pos);
                    _pos += 1;
                    return v;
                },

                /** @returns {number} int16 */
                i16() {
                    _need(2);
                    const v = _dv.getInt16(_pos, le());
                    _pos += 2;
                    return v;
                },

                /** @returns {number} int32 */
                i32() {
                    _need(4);
                    const v = _dv.getInt32(_pos, le());
                    _pos += 4;
                    return v;
                },

                /** @returns {bigint} int64 */
                i64() {
                    _need(8);
                    const v = _dv.getBigInt64(_pos, le());
                    _pos += 8;
                    return v;
                },

                // ── Floats ─────────────────────────────────────────────────────

                /** @returns {number} float32 */
                f32() {
                    _need(4);
                    const v = _dv.getFloat32(_pos, le());
                    _pos += 4;
                    return v;
                },

                /** @returns {number} float64 */
                f64() {
                    _need(8);
                    const v = _dv.getFloat64(_pos, le());
                    _pos += 8;
                    return v;
                },

                // ── Bytes / strings ────────────────────────────────────────────

                /**
                 * Read n bytes as a zero-copy Uint8Array subarray. The returned view
                 * aliases the source buffer (no copy is made).
                 * @param {number} n
                 * @returns {Uint8Array} view sharing the source buffer
                 */
                bytes(n) {
                    _need(n);
                    const v = new Uint8Array(_bytes.buffer, _bytes.byteOffset + _pos, n);
                    _pos += n;
                    return v;
                },

                /**
                 * Read n bytes and decode as UTF-8 string.
                 * @param {number} n
                 * @returns {string}
                 */
                utf8(n) {
                    const slice = r.bytes(n);
                    return _decoder.decode(slice);
                },

                /**
                 * Read n bytes and decode as ASCII string.
                 * Throws ContractError if any byte > 127.
                 * @param {number} n
                 * @returns {string}
                 */
                ascii(n) {
                    _need(n);
                    let s = '';
                    for (let i = 0; i < n; i++) {
                        const b = _dv.getUint8(_pos + i);
                        if (b > 127) {
                            throw contractError('binary/reader-ascii', 'non-ASCII byte encountered', { byte: b, pos: _pos + i });
                        }
                        s += String.fromCharCode(b);
                    }
                    _pos += n;
                    return s;
                },

                /**
                 * Read NUL-terminated string. Advances past the NUL byte.
                 * @returns {string}
                 */
                cstring() {
                    let end = _pos;
                    while (end < _len && _dv.getUint8(end) !== 0) end++;
                    if (end >= _len) {
                        throw contractError('binary/reader-cstring', 'NUL terminator not found before end of buffer', { pos: _pos, length: _len });
                    }
                    const slice = new Uint8Array(_bytes.buffer, _bytes.byteOffset + _pos, end - _pos);
                    const s = _decoder.decode(slice);
                    _pos = end + 1; // advance past NUL
                    return s;
                },

                /**
                 * Create a sub-reader over a slice (zero-copy, shares buffer).
                 * Parent cursor is unaffected.
                 * @param {number} offset  absolute offset within this reader's window
                 * @param {number} length
                 * @returns {object} new reader
                 */
                sub(offset, length) {
                    if (offset < 0 || length < 0 || offset + length > _len) {
                        throw contractError('binary/reader-sub', 'sub-reader range out of bounds', {
                            offset, length, parentLength: _len
                        });
                    }
                    // Zero-copy: use subarray which shares the same underlying buffer
                    const slice = _bytes.subarray(offset, offset + length);
                    return create(slice, { endian: /** @type {Endian} */ (_endian) });
                }
            };

            return r;
        }

        return { create };
    }
};
