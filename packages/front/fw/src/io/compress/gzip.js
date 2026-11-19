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
 * @property {() => void} flush End the stream without a trailer: decode and emit the held-back bytes.
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
                            e.code = 'ENOENCODER'; e.errno = 12;
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
                e.code = 'ENOENCODER'; e.errno = 12;
                throw e;
            }
            // The encoded bytes themselves must not contain NUL (would short-
            // circuit the null terminator).
            for (let i = 0; i < bytes.length; ++i) {
                if (bytes[i] === 0) {
                    const e = new Error('gzip filename contains NUL byte');
                    // @ts-ignore - Error.code is a non-standard but widely-used extension
                    e.code = 'ENOENCODER'; e.errno = 12;
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
                e.code = 'EBADFORMAT'; e.errno = 6;
                throw e;
            }
            const flg = d[3];
            // A header that runs past the bytes at hand is reported, never
            // guessed: a stream waits for more bytes, a one-shot call fails.
            const truncated = () => {
                const e = new Error('invalid gzip data: truncated header');
                // @ts-ignore - Error.code is a non-standard but widely-used extension
                e.code = 'EBADFORMAT'; e.errno = 6;
                return e;
            };
            if (d.length < 10) throw truncated();
            let st = 10;
            if (flg & 0x04) {                                   // FEXTRA
                if (d.length < 12) throw truncated();
                st += (d[10] | (d[11] << 8)) + 2;
            }
            // FNAME (bit 3) then FCOMMENT (bit 4), each null-terminated.
            for (const bit of [0x08, 0x10]) {
                if (!(flg & bit)) continue;
                while (st < d.length && d[st] !== 0) st++;
                if (st >= d.length) throw truncated();
                st++;
            }
            if (flg & 0x02) st += 2;                            // FHCRC
            if (st > d.length) throw truncated();
            return st;
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
        // The typed string `code` of the compressor family (D9 G6); the
        // number of the earlier convention stays in `errno`.
        const CODE_NAMES = { 0: 'EEOF', 1: 'EBADBLOCK', 2: 'EBADSYMBOL', 3: 'EBADDISTANCE', 4: 'ESTREAMEND', 5: 'ENOHANDLER', 6: 'EBADFORMAT', 7: 'EMAXOUT', 8: 'EBADSTREAM', 9: 'EEXTRATOOLONG', 10: 'EBADDATE', 11: 'ENAMETOOLONG', 12: 'ENOENCODER', 13: 'EBADFORMAT', 14: 'EBADMETHOD', 15: 'EUNSAFEPATH', 16: 'ECHECKSUM' };
        /** An `Error` carrying the family's string `code` and numeric `errno`. */
        function _codeErr(code, message) {
            const e = new Error(message);
            // @ts-ignore - Error.code / errno are non-standard but widely-used extensions
            e.code = CODE_NAMES[code]; e.errno = code;
            return e;
        }

        /** Are all bytes of `d` from `at` on zero (padding after the last member)? */
        function _zerosFrom(d, at) {
            for (let k = at; k < d.length; k++) if (d[k] !== 0) return false;
            return true;
        }

        /**
         * Decompress Gzip data: every member (RFC 1952 § 2.2), concatenated.
         * Trailing zero bytes after the last member are ignored. Each
         * member's CRC-32 and ISIZE are checked (code 16 on a mismatch);
         * `verify: false` skips the check.
         *
         * @param {Uint8Array} data
         * @param {object} [opts] - `{ out?: Uint8Array, dictionary?: Uint8Array, verify?: boolean, maxOutput?: number }`
         *   (`maxOutput`: cap on the bytes decoded over every member, code 7 past it)
         * @returns {Uint8Array}
         */
        function gunzipSync(data, opts = {}) {
            const st0 = _payloadStart(data);
            if (st0 + 8 > data.length) throw _codeErr(6, 'invalid gzip data');
            const parts = [];
            let total = 0;
            let off = 0;
            let first = true;
            while (first || (off < data.length && !_zerosFrom(data, off))) {
                const st = first ? st0 : off + _payloadStart(data.subarray(off));
                let used = -1;
                const out = inflateSync(data.subarray(st), {
                    // a caller buffer receives the members one after the other
                    out: opts.out ? opts.out.subarray(total) : undefined,
                    dictionary: opts.dictionary,
                    // the cap holds over the members: each gets what is left
                    maxOutput: opts.maxOutput === undefined || opts.maxOutput === null ? undefined : opts.maxOutput - total,
                    onEnd: (n) => { used = n; },
                });
                const trailer = st + used;
                if (used < 0 || trailer + 8 > data.length) throw _codeErr(0, 'gzip: unexpected EOF (member without its trailer)');
                if (opts.verify !== false) _checkTrailer(out, out.length, data, trailer);
                parts.push(out);
                total += out.length;
                off = trailer + 8;
                first = false;
            }
            if (opts.out) return opts.out.subarray(0, total);
            if (parts.length === 1) return parts[0];
            const all = new Uint8Array(total);
            let o = 0;
            for (const part of parts) { all.set(part, o); o += part.length; }
            return all;
        }

        /** Read a little-endian 32-bit trailer field at `at`. */
        function _r32le(d, at) {
            return (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0;
        }

        /**
         * Unless `verify: false`: throw code 16 unless the 8-byte trailer at `at`
         * holds the CRC-32 of `out` and its size mod 2^32 (`size`).
         */
        function _checkTrailer(out, size, d, at, crc) {
            let sum = crc;
            if (sum === undefined) { const c = new Crc32(); c.append(out); sum = c.get(); }
            if (sum !== _r32le(d, at) || (size >>> 0) !== _r32le(d, at + 4)) {
                const e = new Error('gzip: incorrect data check (CRC-32 or ISIZE mismatch)');
                // @ts-ignore - Error.code is a non-standard but widely-used extension
                e.code = 'ECHECKSUM'; e.errno = 16;
                throw e;
            }
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
         * Reads every member (RFC 1952 § 2.2): a header (which may arrive in
         * pieces), the DEFLATE payload — fed to `InflateStream`, which knows
         * where the final block ends — then the 8-byte trailer, and so on.
         * Trailing zero bytes after the last member are ignored.
         *
         * @param {object|function} [opts] - `{ dictionary?, verify? }` or `ondata`
         * @param {function} [ondata] - callback(chunk: Uint8Array, isFinal: boolean)
         */
        function GunzipStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata || null;
            this._opts = opts || {};
            this._phase = 'header';   // 'header' | 'body' | 'trailer'
            this._pending = new Uint8Array(0);  // header or trailer bytes so far
            this._inf = null;
            this._members = 0;
            // Unless `verify: false`: CRC-32 and size of the current member, checked
            // against its trailer.
            this._crc = null;
            this._size = 0;
            this._ended = false;
            // `maxOutput` holds over every member: bytes emitted so far.
            this._produced = 0;
        }

        /** Append `b` to the pending header / trailer bytes. */
        GunzipStream.prototype._take = function(b) {
            if (!this._pending.length) { this._pending = b; return; }
            const m = new Uint8Array(this._pending.length + b.length);
            m.set(this._pending);
            m.set(b, this._pending.length);
            this._pending = m;
        };

        GunzipStream.prototype.push = function(chunk, final) {
            if (this._ended) throw _codeErr(4, 'stream finished');
            if (final) this._ended = true;
            let data = chunk;
            for (;;) {
                if (this._phase === 'header') {
                    this._take(data);
                    if (this._members > 0 && _zerosFrom(this._pending, 0)) break;   // padding
                    let hdrEnd;
                    try { hdrEnd = _payloadStart(this._pending); } catch (e) {
                        if (final) throw e;
                        return; // need more bytes
                    }
                    const self = this;
                    this._crc = this._opts.verify !== false ? new Crc32() : null;
                    this._size = 0;
                    const cap = this._opts.maxOutput;
                    const memberOpts = cap === undefined || cap === null
                        ? this._opts
                        : Object.assign({}, this._opts, { maxOutput: cap - this._produced });
                    this._inf = new InflateStream(memberOpts, function(out) {
                        self._produced += out.length;
                        if (self._crc) { self._crc.append(out); self._size += out.length; }
                        if (self.ondata && out.length) self.ondata(out, false);
                    });
                    data = this._pending.subarray(hdrEnd);
                    this._pending = new Uint8Array(0);
                    this._phase = 'body';
                }
                if (this._phase === 'body') {
                    this._inf.push(data, false);
                    if (!this._inf.ended) {
                        if (final) throw _codeErr(0, 'gzip: unexpected EOF (inside a member)');
                        return;
                    }
                    data = this._inf.rest();
                    this._phase = 'trailer';
                }
                // trailer
                this._take(data);
                if (this._pending.length < 8) {
                    if (final) throw _codeErr(0, 'gzip: unexpected EOF (member without its trailer)');
                    return;
                }
                if (this._crc) _checkTrailer(null, this._size, this._pending, 0, this._crc.get());
                data = this._pending.subarray(8);
                this._pending = new Uint8Array(0);
                this._members++;
                this._phase = 'header';
                if (!data.length) break;
            }
            if (final && this.ondata) this.ondata(new Uint8Array(0), true);
        };

        /**
         * End the stream WITHOUT a trailer: for a source that may be truncated.
         * Every byte pushed so far has been decoded and emitted; this marks
         * the end (`ondata(empty, true)`) without requiring a trailer. A later
         * `push` throws code 4.
         */
        GunzipStream.prototype.flush = function() {
            if (this._ended) throw _codeErr(4, 'stream finished');
            this._ended = true;
            if (this.ondata) this.ondata(new Uint8Array(0), true);
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
