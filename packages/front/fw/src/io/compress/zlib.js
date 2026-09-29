// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Zlib compression/decompression factory.
 *
 * Wraps raw DEFLATE with Zlib framing (RFC 1950):
 * 2-byte CMF/FLG header + optional 4-byte DICTID + DEFLATE payload + 4-byte Adler32 footer.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `zlibSync(data, opts?)` | `Uint8Array` - synchronous compress |
 * | `unzlibSync(data, opts?)` | `Uint8Array` - synchronous decompress |
 * | `zlib(data, opts?)` | `Promise<Uint8Array>` - async compress |
 * | `unzlib(data, opts?)` | `Promise<Uint8Array>` - async decompress |
 *
 * ## Options (compress)
 *
 * `{ level?: 0–9, dictionary?: Uint8Array }`
 *
 * ## Options (decompress)
 *
 * `{ out?: Uint8Array, dictionary?: Uint8Array }`
 *
 */

/**
 * Streaming Zlib compressor instance shape.
 * @typedef {object} ZlibStreamInstance
 * @property {((chunk: Uint8Array, isFinal: boolean) => void)|null} ondata
 * @property {(chunk: Uint8Array, final?: boolean) => void} push
 */

/**
 * Constructor for `ZlibStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => ZlibStreamInstance} ZlibStreamCtor
 */

/**
 * Streaming Zlib decompressor instance shape.
 * @typedef {object} UnzlibStreamInstance
 * @property {((chunk: Uint8Array, isFinal: boolean) => void)|null} ondata
 * @property {(chunk: Uint8Array, final?: boolean) => void} push
 */

/**
 * Constructor for `UnzlibStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => UnzlibStreamInstance} UnzlibStreamCtor
 */

/**
 * Public surface of `zlib.factory(...)`.
 * @typedef {object} ZlibApi
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} zlibSync
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} unzlibSync
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} zlib
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} unzlib
 * @property {ZlibStreamCtor} ZlibStream
 * @property {UnzlibStreamCtor} UnzlibStream
 */

import { deflate } from './deflate.js';
import { adler32 } from '../calc/adler32.js';

export const zlib = {
    name: 'zlib',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: ['deflate', 'adler32'],
    deps: [deflate, adler32],

    /**
     * @param {{ deflateSync, inflateSync, deflate, inflate, DeflateStream, InflateStream }} deflateModule
     * @param {Function} Adler32 - constructor returned by adler32.factory()
     * @returns {ZlibApi}
     */
    factory(deflateModule, Adler32) {

        const { deflateSync, inflateSync, DeflateStream, InflateStream } = deflateModule;

        // --- Internal helpers ---

        // Write a 32-bit big-endian unsigned integer at offset
        // (Adler32 is stored big-endian in the Zlib footer)
        function _w32be(d, off, v) {
            d[off]     = (v >>> 24) & 0xFF;
            d[off + 1] = (v >>> 16) & 0xFF;
            d[off + 2] = (v >>>  8) & 0xFF;
            d[off + 3] =  v         & 0xFF;
        }

        // Length of zlib header in bytes (2 + optional 4-byte DICTID)
        function _headerLen(opts) {
            return opts.dictionary ? 6 : 2;
        }

        // Write zlib CMF/FLG header and optional DICTID into `out`
        function _writeHeader(out, opts, adlerCtor) {
            const lv = opts.level ?? 6;
            // FLEVEL: 0=fast, 1=<6, 2=default, 3=max
            const fl = lv === 0 ? 0 : lv < 6 ? 1 : lv === 9 ? 3 : 2;
            // CMF = 0x78 (CM=8 deflate, CINFO=7 for 32K window)
            out[0] = 0x78;
            out[1] = (fl << 6) | (opts.dictionary ? 32 : 0);
            // FCHECK: ensure (CMF * 256 + FLG) % 31 === 0
            out[1] |= 31 - ((out[0] << 8 | out[1]) % 31);
            if (opts.dictionary) {
                // DICTID: Adler32 of the dictionary
                const a = new adlerCtor();
                a.append(opts.dictionary);
                _w32be(out, 2, a.get());
            }
        }

        // Find the byte offset of the DEFLATE payload within a zlib buffer
        function _payloadStart(d, dict) {
            if ((d[0] & 0x0F) !== 8 || (d[0] >> 4) > 7 || ((d[0] << 8 | d[1]) % 31)) {
                const e = new Error('invalid zlib data');
                // @ts-ignore - Error.code/context is a non-standard but widely-used extension
                e.code = 6;
                throw e;
            }
            const hasDict = (d[1] >> 5) & 1;
            if (hasDict === +!dict) {
                const e = new Error('invalid zlib data: ' + (hasDict ? 'need' : 'unexpected') + ' dictionary');
                // @ts-ignore - Error.code/context is a non-standard but widely-used extension
                e.code = 6;
                throw e;
            }
            // 2 bytes header + optional 4 bytes DICTID
            return ((d[1] >> 3) & 4) + 2;
        }

        // --- Public API ---

        /**
         * Compress data using Zlib (DEFLATE + Adler32).
         *
         * @param {Uint8Array} data
         * @param {object} [opts] - `{ level?, dictionary? }`
         * @returns {Uint8Array}
         */
        function zlibSync(data, opts = {}) {
            // @ts-ignore - function-as-constructor; TS cannot verify constructability
            const a = new Adler32();
            a.append(data);

            const hl = _headerLen(opts);
            const compressed = deflateSync(data, opts);
            const out = new Uint8Array(hl + compressed.length + 4);

            _writeHeader(out, opts, Adler32);
            out.set(compressed, hl);
            _w32be(out, hl + compressed.length, a.get()); // Adler32 footer (big-endian)
            return out;
        }

        /**
         * Decompress Zlib data.
         *
         * @param {Uint8Array} data
         * @param {object} [opts] - `{ out?: Uint8Array, dictionary?: Uint8Array }`
         * @returns {Uint8Array}
         */
        function unzlibSync(data, opts = {}) {
            const start = _payloadStart(data, opts.dictionary);
            return inflateSync(data.subarray(start, -4), {
                out: opts.out,
                dictionary: opts.dictionary,
            });
        }

        // Concatenate two Uint8Arrays
        function _concat2(a, b) {
            const out = new Uint8Array(a.length + b.length);
            out.set(a);
            out.set(b, a.length);
            return out;
        }

        // --- Streaming API ---

        /**
         * Streaming Zlib compressor.
         *
         * Writes the 2-byte CMF/FLG header with the first output chunk and appends
         * the big-endian Adler32 footer on the final chunk.
         *
         * @param {object|function} [opts] - `{ level?, dictionary? }` or `ondata`
         * @param {function} [ondata] - callback(chunk: Uint8Array, isFinal: boolean)
         */
        function ZlibStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata || null;
            this._opts = opts || {};
            // @ts-ignore - function-as-constructor; TS cannot verify constructability
            this._adler = new Adler32();
            this._first = true;
            const self = this;
            this._ds = new DeflateStream(this._opts, function(chunk, final) {
                let out;
                if (self._first) {
                    const hl = _headerLen(self._opts);
                    const hdr = new Uint8Array(hl);
                    _writeHeader(hdr, self._opts, Adler32);
                    out = _concat2(hdr, chunk);
                    self._first = false;
                } else {
                    out = chunk;
                }
                if (final) {
                    const footer = new Uint8Array(4);
                    _w32be(footer, 0, self._adler.get());
                    out = _concat2(out, footer);
                }
                if (self.ondata) self.ondata(out, final);
            });
        }

        /**
         * @param {Uint8Array} chunk
         * @param {boolean} [final=false]
         */
        ZlibStream.prototype.push = function(chunk, final) {
            this._adler.append(chunk);
            this._ds.push(chunk, !!final);
        };

        /**
         * Streaming Zlib decompressor.
         *
         * Buffers input until the 2-byte Zlib header is consumed, then feeds the
         * DEFLATE payload to `InflateStream` while holding back the 4-byte Adler32 footer.
         *
         * @param {object|function} [opts]
         * @param {function} [ondata] - callback(chunk: Uint8Array, isFinal: boolean)
         */
        function UnzlibStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata || null;
            this._opts = opts || {};
            this._buf = [];
            this._bufLen = 0;
            this._hdr = -1;
            this._inf = null;
            this._tail = new Uint8Array(4);
            this._tailLen = 0;
        }

        UnzlibStream.prototype.push = function(chunk, final) {
            if (this._hdr === -1) {
                this._buf.push(chunk);
                this._bufLen += chunk.length;

                const combined = new Uint8Array(this._bufLen);
                let off = 0;
                for (const c of this._buf) { combined.set(c, off); off += c.length; }

                let hdrEnd;
                try { hdrEnd = _payloadStart(combined, this._opts.dictionary); } catch (e) {
                    if (final) throw e;
                    return;
                }

                this._hdr = hdrEnd;
                this._buf = null;
                const self = this;
                this._inf = new InflateStream(this._opts, function(data, fin) {
                    if (self.ondata) self.ondata(data, fin);
                });
                this._feedPayload(combined.subarray(hdrEnd), !!final);
            } else {
                this._feedPayload(chunk, !!final);
            }
        };

        UnzlibStream.prototype._feedPayload = function(chunk, final) {
            const FOOTER = 4;
            const total = new Uint8Array(this._tailLen + chunk.length);
            total.set(this._tail.subarray(0, this._tailLen));
            total.set(chunk, this._tailLen);

            if (!final) {
                const feedLen = total.length > FOOTER ? total.length - FOOTER : 0;
                if (feedLen > 0) this._inf.push(total.subarray(0, feedLen), false);
                const newTailLen = total.length - feedLen;
                this._tailLen = newTailLen;
                this._tail.set(total.subarray(feedLen));
            } else {
                const feedLen = Math.max(0, total.length - FOOTER);
                this._inf.push(total.subarray(0, feedLen), true);
            }
        };

        // Async wrappers (microtask-deferred)
        const _mt = typeof queueMicrotask === 'function'
            ? queueMicrotask
            : fn => Promise.resolve().then(fn);

        /**
         * Asynchronously compress data using Zlib.
         *
         * @param {Uint8Array} data
         * @param {object} [opts]
         * @returns {Promise<Uint8Array>}
         */
        function zlibAsync(data, opts = {}) {
            return new Promise((resolve, reject) => {
                _mt(() => { try { resolve(zlibSync(data, opts)); } catch (e) { reject(e); } });
            });
        }

        /**
         * Asynchronously decompress Zlib data.
         *
         * @param {Uint8Array} data
         * @param {object} [opts]
         * @returns {Promise<Uint8Array>}
         */
        function unzlibAsync(data, opts = {}) {
            return new Promise((resolve, reject) => {
                _mt(() => { try { resolve(unzlibSync(data, opts)); } catch (e) { reject(e); } });
            });
        }

        return {
            zlibSync,
            unzlibSync,
            zlib: zlibAsync,
            unzlib: unzlibAsync,
            // @ts-ignore - function-as-constructor; TS cannot verify compatibility with StreamCtor typedef
            ZlibStream,
            // @ts-ignore - function-as-constructor; TS cannot verify compatibility with StreamCtor typedef
            UnzlibStream,
        };
    }
};
