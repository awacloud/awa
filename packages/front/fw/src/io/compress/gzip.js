// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Gzip compression/decompression factory.
 *
 * Wraps raw DEFLATE with Gzip framing (RFC 1952):
 * 10-byte header + DEFLATE payload + CRC32 + original-size footer (8 bytes).
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `gzipSync(data, opts?)` | `Uint8Array` - synchronous compress |
 * | `gunzipSync(data, opts?)` | `Uint8Array` - synchronous decompress |
 * | `gzip(data, opts?)` | `Promise<Uint8Array>` - async compress |
 * | `gunzip(data, opts?)` | `Promise<Uint8Array>` - async decompress |
 *
 * ## Options (compress)
 *
 * `{ level?: 0–9, filename?: string, mtime?: number|Date }`
 *
 * ## Options (decompress)
 *
 * `{ out?: Uint8Array }` - pre-allocated output buffer (perf optimisation)
 *
 */

/**
 * Streaming Gzip compressor instance shape.
 * @typedef {object} GzipStreamInstance
 * @property {((chunk: Uint8Array, isFinal: boolean) => void)|null} ondata
 * @property {(chunk: Uint8Array, final?: boolean) => void} push
 */

/**
 * Constructor for `GzipStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => GzipStreamInstance} GzipStreamCtor
 */

/**
 * Streaming Gzip decompressor instance shape.
 * @typedef {object} GunzipStreamInstance
 * @property {((chunk: Uint8Array, isFinal: boolean) => void)|null} ondata
 * @property {(chunk: Uint8Array, final?: boolean) => void} push
 */

/**
 * Constructor for `GunzipStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => GunzipStreamInstance} GunzipStreamCtor
 */

/**
 * Public surface of `gzip.factory(...)`.
 * @typedef {object} GzipApi
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} gzipSync
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} gunzipSync
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} gzip
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} gunzip
 * @property {GzipStreamCtor} GzipStream
 * @property {GunzipStreamCtor} GunzipStream
 */

import { deflate } from './deflate.js';
import { crc32 } from '../calc/crc32.js';

export const gzip = {
    name: 'gzip',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: ['deflate', 'crc32'],
    deps: [deflate, crc32],

    /**
     * @param {{ deflateSync, inflateSync, deflate, inflate, DeflateStream, InflateStream }} deflateModule
     * @param {new() => {append: function(Uint8Array): void, get: function(): number}} Crc32 - constructor returned by crc32.factory()
     * @returns {GzipApi}
     */
    factory(deflateModule, Crc32) {

        const { deflateSync, inflateSync, DeflateStream, InflateStream } = deflateModule;

        // UTF-8 encoder reused across header writes for non-ASCII filenames.
        const _te = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

        // Encode a gzip filename. RFC 1952 §2.3.1.4 specifies ISO 8859-1 but
        // most modern readers (gzip, libarchive, browsers) accept UTF-8 too.
        // We encode UTF-8 to avoid silently mangling non-ASCII characters
        // through the previous `c & 0xFF` truncation. Throw if the resulting
        // FNAME would not fit in the spec-bounded header field.
        function _encodeFilename(fn) {
            const bytes = _te
                ? _te.encode(fn)
                : (() => {
                    // Conservative fallback: ASCII-only acceptance.
                    const out = new Uint8Array(fn.length);
                    for (let i = 0; i < fn.length; ++i) {
                        const c = fn.charCodeAt(i);
                        if (c > 0x7F) {
                            const e = new Error('gzip filename contains non-ASCII characters but TextEncoder is unavailable');
                            // @ts-ignore - Error.code is a non-standard but widely-used extension
                            e.code = 12;
                            throw e;
                        }
                        out[i] = c;
                    }
                    return out;
                })();
            // FNAME is null-terminated and the LEN/header layout assumes the
            // name fits in a 16-bit-addressable region - cap conservatively.
            if (bytes.length > 65535) {
                const e = new Error('gzip filename too long');
                // @ts-ignore - Error.code is a non-standard but widely-used extension
                e.code = 12;
                throw e;
            }
            // The encoded bytes themselves must not contain NUL (would short-
            // circuit the null terminator).
            for (let i = 0; i < bytes.length; ++i) {
                if (bytes[i] === 0) {
                    const e = new Error('gzip filename contains NUL byte');
                    // @ts-ignore - Error.code is a non-standard but widely-used extension
                    e.code = 12;
                    throw e;
                }
            }
            return bytes;
        }

        // --- Internal helpers ---

        // Write a 32-bit little-endian unsigned integer at offset
        function _w32(d, off, v) {
            d[off]     =  v         & 0xFF;
            d[off + 1] = (v >>>  8) & 0xFF;
            d[off + 2] = (v >>> 16) & 0xFF;
            d[off + 3] = (v >>> 24) & 0xFF;
        }

        // Byte length of the gzip header for these options
        function _headerLen(opts) {
            if (!opts.filename) return 10;
            // Cache the encoded bytes so we don't encode twice.
            if (!opts._fnBytes) opts._fnBytes = _encodeFilename(opts.filename);
            return 10 + opts._fnBytes.length + 1;
        }

        // Write gzip header into `out` starting at offset 0
        function _writeHeader(out, opts) {
            out[0] = 0x1F; out[1] = 0x8B; out[2] = 0x08;
            // XFL: 4 = max speed, 2 = max compression, 0 = default
            out[8] = opts.level < 2 ? 4 : opts.level === 9 ? 2 : 0;
            out[9] = 3; // OS = Unix
            if (opts.mtime != null && opts.mtime !== 0) {
                const t = Math.floor(new Date(opts.mtime).getTime() / 1000);
                _w32(out, 4, t);
            }
            if (opts.filename) {
                out[3] = 0x08; // FNAME flag
                const fnBytes = opts._fnBytes || _encodeFilename(opts.filename);
                out.set(fnBytes, 10);
                out[10 + fnBytes.length] = 0; // null-terminate
            }
        }

        // Find the byte offset of the DEFLATE payload within a gzip buffer
        function _payloadStart(d) {
            if (d[0] !== 0x1F || d[1] !== 0x8B || d[2] !== 0x08) {
                const e = new Error('invalid gzip data');
                // @ts-ignore - Error.code is a non-standard but widely-used extension
                e.code = 6;
                throw e;
            }
            const flg = d[3];
            let st = 10;
            if (flg & 0x04) st += (d[10] | (d[11] << 8)) + 2; // FEXTRA
            // Skip FNAME (bit 3) and FCOMMENT (bit 4) - both are null-terminated
            // @ts-ignore - boolean !d[st++] is coerced to 0/1 in arithmetic: intentional compact idiom
            for (let zs = ((flg >> 3) & 1) + ((flg >> 4) & 1); zs > 0; zs -= /** @type {number} */ (/** @type {*} */ (!d[st++])));
            if (flg & 0x02) st += 2; // FHCRC
            return st;
        }

        // Read original (uncompressed) size from the gzip footer
        function _originalSize(d) {
            const l = d.length;
            return (d[l - 4] | (d[l - 3] << 8) | (d[l - 2] << 16) | (d[l - 1] << 24)) >>> 0;
        }

        // --- Public API ---

        /**
         * Compress data as Gzip.
         *
         * @param {Uint8Array} data
         * @param {object} [opts] - `{ level?, filename?, mtime? }`
         * @returns {Uint8Array}
         */
        function gzipSync(data, opts = {}) {
            const c = new Crc32();
            c.append(data);

            const compressed = deflateSync(data, opts);
            const hl = _headerLen(opts);
            const out = new Uint8Array(hl + compressed.length + 8);

            _writeHeader(out, opts);
            out.set(compressed, hl);
            _w32(out, hl + compressed.length,     c.get());          // CRC32
            _w32(out, hl + compressed.length + 4, data.length >>> 0); // ISIZE
            return out;
        }

        /**
         * Decompress Gzip data.
         *
         * @param {Uint8Array} data
         * @param {object} [opts] - `{ out?: Uint8Array }`
         * @returns {Uint8Array}
         */
        function gunzipSync(data, opts = {}) {
            const st = _payloadStart(data);
            if (st + 8 > data.length) {
                const e = new Error('invalid gzip data');
                // @ts-ignore - Error.code is a non-standard but widely-used extension
                e.code = 6;
                throw e;
            }
            return inflateSync(data.subarray(st, -8), {
                out: opts.out ?? new Uint8Array(_originalSize(data)),
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
         * Streaming Gzip compressor.
         *
         * Wraps `DeflateStream` with Gzip framing: writes the header on the first
         * output chunk and appends the CRC32 + ISIZE footer on the final chunk.
         *
         * @param {object|function} [opts] - `{ level?, filename?, mtime? }` or `ondata`
         * @param {function} [ondata] - callback(chunk: Uint8Array, isFinal: boolean)
         */
        function GzipStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata || null;
            this._opts = opts || {};
            this._crc = new Crc32();
            this._size = 0;
            this._first = true;
            const self = this;
            this._ds = new DeflateStream(this._opts, function(chunk, final) {
                let out;
                if (self._first) {
                    const hl = _headerLen(self._opts);
                    const hdr = new Uint8Array(hl);
                    _writeHeader(hdr, self._opts);
                    out = _concat2(hdr, chunk);
                    self._first = false;
                } else {
                    out = chunk;
                }
                if (final) {
                    const footer = new Uint8Array(8);
                    _w32(footer, 0, self._crc.get());
                    _w32(footer, 4, self._size >>> 0);
                    out = _concat2(out, footer);
                }
                if (self.ondata) self.ondata(out, final);
            });
        }

        /**
         * @param {Uint8Array} chunk
         * @param {boolean} [final=false]
         */
        GzipStream.prototype.push = function(chunk, final) {
            this._crc.append(chunk);
            this._size += chunk.length;
            this._ds.push(chunk, !!final);
        };

        /**
         * Streaming Gzip decompressor.
         *
         * Buffers input until the Gzip header is parsed, then feeds the DEFLATE
         * payload to `InflateStream` while holding back the 8-byte footer.
         *
         * @param {object|function} [opts]
         * @param {function} [ondata] - callback(chunk: Uint8Array, isFinal: boolean)
         */
        function GunzipStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata || null;
            this._opts = opts || {};
            this._buf = [];         // input chunks before header is resolved
            this._bufLen = 0;
            this._hdr = -1;         // payload start offset (-1 = not yet parsed)
            this._inf = null;
            this._tail = new Uint8Array(8);  // held-back footer bytes
            this._tailLen = 0;
        }

        GunzipStream.prototype.push = function(chunk, final) {
            if (this._hdr === -1) {
                this._buf.push(chunk);
                this._bufLen += chunk.length;

                // Reconstruct buffer to attempt header parse
                const combined = new Uint8Array(this._bufLen);
                let off = 0;
                for (const c of this._buf) { combined.set(c, off); off += c.length; }

                let hdrEnd;
                try { hdrEnd = _payloadStart(combined); } catch (e) {
                    if (final) throw e;
                    return; // need more bytes
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

        GunzipStream.prototype._feedPayload = function(chunk, final) {
            const FOOTER = 8;
            // Merge currently held tail bytes with the new chunk
            const total = new Uint8Array(this._tailLen + chunk.length);
            total.set(this._tail.subarray(0, this._tailLen));
            total.set(chunk, this._tailLen);

            if (!final) {
                // Feed everything except the last FOOTER bytes to inflate
                const feedLen = total.length > FOOTER ? total.length - FOOTER : 0;
                if (feedLen > 0) this._inf.push(total.subarray(0, feedLen), false);
                const newTailLen = total.length - feedLen;
                this._tailLen = newTailLen;
                this._tail.set(total.subarray(feedLen));
            } else {
                // Strip the 8-byte footer and close the inflate stream
                const feedLen = Math.max(0, total.length - FOOTER);
                this._inf.push(total.subarray(0, feedLen), true);
            }
        };

        // Async wrappers (microtask-deferred)
        const _mt = typeof queueMicrotask === 'function'
            ? queueMicrotask
            : fn => Promise.resolve().then(fn);

        /**
         * Asynchronously compress data as Gzip.
         *
         * @param {Uint8Array} data
         * @param {object} [opts]
         * @returns {Promise<Uint8Array>}
         */
        function gzipAsync(data, opts = {}) {
            return new Promise((resolve, reject) => {
                _mt(() => { try { resolve(gzipSync(data, opts)); } catch (e) { reject(e); } });
            });
        }

        /**
         * Asynchronously decompress Gzip data.
         *
         * @param {Uint8Array} data
         * @param {object} [opts]
         * @returns {Promise<Uint8Array>}
         */
        function gunzipAsync(data, opts = {}) {
            return new Promise((resolve, reject) => {
                _mt(() => { try { resolve(gunzipSync(data, opts)); } catch (e) { reject(e); } });
            });
        }

        return {
            gzipSync,
            gunzipSync,
            gzip: gzipAsync,
            gunzip: gunzipAsync,
            // @ts-ignore - GzipStream is a constructor function matching GzipStreamCtor; TS can't verify function-as-constructor
            GzipStream,
            // @ts-ignore - GunzipStream is a constructor function matching GunzipStreamCtor; TS can't verify function-as-constructor
            GunzipStream,
        };
    }
};
