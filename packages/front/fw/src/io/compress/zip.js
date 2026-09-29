// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview ZIP archive creation and extraction factory.
 *
 * Supports ZIP and ZIP64 format (for archives > 4 GB) with DEFLATE compression
 * (method 8) and store (method 0) ISO/IEC 21320-1. File entries can be plain `Uint8Array` or
 * `[Uint8Array, PerFileOptions]` tuples. Directory objects are flattened with
 * a trailing `/` path separator.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `zipSync(files, opts?)` | `Uint8Array` - synchronous archive creation |
 * | `unzipSync(data, opts?)` | `{ [path]: Uint8Array }` - synchronous extraction |
 * | `zip(files, opts?)` | `Promise<Uint8Array>` |
 * | `unzip(data, opts?)` | `Promise<{ [path]: Uint8Array }>` |
 *
 * ## Files argument
 *
 * ```js
 * {
 *   'file.txt': data,                            // Uint8Array
 *   'archive/big.bin': [data, { level: 0 }],     // with per-file options
 *   'subdir/': {},                               // directory entry
 * }
 * ```
 *
 * ## Per-file options
 *
 * `{ level?: 0–9, mtime?: number|Date, comment?: string, extra?: object }`
 *
 * Set `level: 0` to store without compression.
 *
 * ## Deterministic / reproducible archives (BL-28)
 *
 * `opts.mtime` (writer-level default) also accepts `number|Date`, on both
 * write paths: `zipSync`/`zip`'s `opts` argument and `ZipStream`'s
 * constructor `opts`. It seeds every entry that does not supply its own
 * `p.mtime` (per-entry `mtime` always wins). Fixing the writer-level
 * `mtime` makes two writes of an identical payload byte-identical —
 * without it, each entry's timestamp defaults to `Date.now()` and bytes
 * differ run to run. Valid range is 1980-2099 (MS-DOS date/time,
 * 2-second resolution); outside it throws error code 10, fixed mtime
 * included. This module only provides the option — a caller composing on
 * top of `zip` (e.g. a document-format writer) must thread its own fixed
 * `mtime` through to claim reproducible output.
 *
 * ## Extraction options
 *
 * `{ filter?: ({ name, size, originalSize, compression }) => boolean }`
 *
 */

/**
 * Writer returned by `ZipStream.openEntry(...)`.
 * @typedef {object} ZipEntryWriter
 * @property {(chunk: Uint8Array, final?: boolean) => void} push
 */

/**
 * Streaming ZIP archive writer instance shape.
 * @typedef {object} ZipStreamInstance
 * @property {((chunk: Uint8Array, isFinal: boolean) => void)|null} ondata
 * @property {(name: string, data: Uint8Array|[Uint8Array, object], opts?: object) => void} add
 * @property {(name: string, opts?: object) => ZipEntryWriter} openEntry
 * @property {() => void} finalize
 */

/**
 * Constructor for `ZipStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => ZipStreamInstance} ZipStreamCtor
 */

/**
 * Streaming ZIP reader instance shape.
 * @typedef {object} ZipStreamReaderInstance
 * @property {((name: string, data: Uint8Array, isFinal: boolean) => void)|null} onfile
 * @property {(chunk: Uint8Array, final?: boolean) => void} push
 */

/**
 * Constructor for `ZipStreamReader`.
 * @typedef {new (opts?: object|((name: string, data: Uint8Array, isFinal: boolean) => void), onfile?: (name: string, data: Uint8Array, isFinal: boolean) => void) => ZipStreamReaderInstance} ZipStreamReaderCtor
 */

/**
 * Public surface of `zip.factory(...)`.
 * @typedef {object} ZipApi
 * @property {(files: object, opts?: object) => Uint8Array} zipSync
 * @property {(data: Uint8Array, opts?: object) => Object<string, Uint8Array>} unzipSync
 * @property {(files: object, opts?: object) => Promise<Uint8Array>} zip
 * @property {(data: Uint8Array, opts?: object) => Promise<Object<string, Uint8Array>>} unzip
 * @property {ZipStreamCtor} ZipStream
 * @property {ZipStreamReaderCtor} ZipStreamReader
 */

import { deflate } from './deflate.js';
import { crc32 } from '../calc/crc32.js';

export const zip = {
    name: 'zip',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: ['deflate', 'crc32'],
    deps: [deflate, crc32],

    /**
     * @param {{ deflateSync, inflateSync, deflate, inflate, DeflateStream, InflateStream }} deflateModule
     * @param {new() => {append: function(Uint8Array): void, get: function(): number}} Crc32 - constructor returned by crc32.factory()
     * @returns {ZipApi}
     */
    factory(deflateModule, Crc32) {

        const { deflateSync, inflateSync, DeflateStream } = deflateModule;

        // --- String ↔ Uint8Array helpers ---

        // Native encoder/decoder (universal in modern environments)
        const _te = typeof TextEncoder !== 'undefined' && new TextEncoder();
        const _td = typeof TextDecoder !== 'undefined' && new TextDecoder();

        function _strToU8(str) {
            if (_te) return _te.encode(str);
            // Fallback: manual UTF-8 for non-ASCII
            const a = [];
            for (let i = 0; i < str.length; ++i) {
                let c = str.charCodeAt(i);
                if (c < 0x80) {
                    a.push(c);
                } else if (c < 0x800) {
                    a.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
                } else if (c > 0xD7FF && c < 0xE000) {
                    c = 0x10000 + (((c & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF));
                    a.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
                } else {
                    a.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
                }
            }
            return new Uint8Array(a);
        }

        // Decode bytes as UTF-8 (utf8=true) or Latin-1 (utf8=false)
        function _u8ToStr(d, utf8) {
            if (!utf8) {
                // Latin-1: one char per byte
                let r = '';
                for (let i = 0; i < d.length; i += 16384)
                    r += String.fromCharCode(...d.subarray(i, i + 16384));
                return r;
            }
            if (_td) return _td.decode(d);
            // Fallback manual decode
            let r = '';
            for (let i = 0; i < d.length;) {
                const b = d[i++];
                if (b < 0x80) { r += String.fromCharCode(b); }
                else if (b < 0xE0) { r += String.fromCharCode(((b & 0x1F) << 6) | (d[i++] & 0x3F)); }
                else if (b < 0xF0) { r += String.fromCharCode(((b & 0x0F) << 12) | ((d[i++] & 0x3F) << 6) | (d[i++] & 0x3F)); }
                else {
                    let cp = ((b & 0x07) << 18) | ((d[i++] & 0x3F) << 12) | ((d[i++] & 0x3F) << 6) | (d[i++] & 0x3F);
                    cp -= 0x10000;
                    r += String.fromCharCode(0xD800 | (cp >> 10), 0xDC00 | (cp & 0x3FF));
                }
            }
            return r;
        }

        // True when the string contains no characters outside Latin-1
        function _isUTF8(str) {
            for (let i = 0; i < str.length; ++i) if (str.charCodeAt(i) > 127) return true;
            return false;
        }

        // --- Byte-level helpers ---

        function _r16(d, b) { return d[b] | (d[b + 1] << 8); }
        function _r32(d, b) { return (d[b] | (d[b + 1] << 8) | (d[b + 2] << 16) | (d[b + 3] << 24)) >>> 0; }
        function _r64(d, b) { return _r32(d, b) + _r32(d, b + 4) * 4294967296; }

        function _w16(d, b, v) { d[b] = v & 0xFF; d[b + 1] = (v >> 8) & 0xFF; }
        function _w32(d, b, v) { d[b] = v & 0xFF; d[b + 1] = (v >> 8) & 0xFF; d[b + 2] = (v >> 16) & 0xFF; d[b + 3] = (v >>> 24) & 0xFF; }

        // --- MS-DOS date/time encoding ---

        function _dosDateTime(mtime) {
            const d = new Date(mtime ?? Date.now());
            const y = d.getFullYear() - 1980;
            if (y < 0 || y > 119) {
                const e = new Error('date not in range 1980-2099');
                // @ts-ignore - Error.code is a non-standard but widely-used extension
                e.code = 10;
                throw e;
            }
            return (y << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16)
                 | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        }

        // Deflate bit flag from level
        function _dbf(l) { return l === 1 ? 3 : l < 6 ? 2 : l === 9 ? 1 : 0; }

        // --- Extra field helpers ---

        function _exfl(ex) {
            let le = 0;
            if (ex) for (const k in ex) {
                const l = ex[k].length;
                // @ts-ignore - Error.code is a non-standard but widely-used extension
                if (l > 65535) { const e = new Error('extra field too long'); e.code = 9; throw e; }
                le += l + 4;
            }
            return le;
        }

        function _writeExtra(d, b, ex) {
            if (!ex) return b;
            for (const k in ex) {
                const exf = ex[k];
                _w16(d, b, +k); _w16(d, b + 2, exf.length);
                d.set(exf, b + 4);
                b += 4 + exf.length;
            }
            return b;
        }

        // --- Local file header (PK\x03\x04) ---

        function _localHeaderSize(fnLen, exLen) {
            return 30 + fnLen + exLen;
        }

        function _writeLocalHeader(d, b, fn, fnBytes, u, compression, dosTime, crc, cSize, uSize, ex) {
            _w32(d, b, 0x04034B50); b += 4;           // signature
            d[b] = 20; b += 2;                         // version needed
            d[b] = (compression < 0 && 8); d[b + 1] = u && 8; b += 2; // flags: data descriptor, UTF-8
            _w16(d, b, compression & 0xFFFF); b += 2;  // compression method
            _w32(d, b, dosTime); b += 4;               // last mod
            if (compression >= 0) {
                _w32(d, b, crc);   b += 4;             // CRC-32
                _w32(d, b, cSize); b += 4;             // compressed size
                _w32(d, b, uSize); b += 4;             // uncompressed size
            } else {
                b += 12;                                // will be filled by data descriptor
            }
            _w16(d, b, fnBytes.length); b += 2;        // filename length
            _w16(d, b, _exfl(ex)); b += 2;             // extra length
            d.set(fnBytes, b); b += fnBytes.length;
            return _writeExtra(d, b, ex);
        }

        // --- Central directory entry (PK\x01\x02) ---

        function _centralEntrySize(fnLen, exLen, comLen) {
            return 46 + fnLen + exLen + comLen;
        }

        function _writeCentralEntry(d, b, fnBytes, u, compression, dosTime, crc, cSize, uSize, localOffset, ex, comment) {
            _w32(d, b, 0x02014B50); b += 4;            // signature
            d[b] = 20; d[b + 1] = 0; b += 2;          // version made by
            d[b] = 20; b += 2;                         // version needed
            d[b] = _dbf(compression) << 1; d[b + 1] = u && 8; b += 2; // flags
            _w16(d, b, compression < 0 ? 0 : compression & 0xFFFF); b += 2;
            _w32(d, b, dosTime); b += 4;
            _w32(d, b, crc);     b += 4;
            _w32(d, b, compression < 0 ? (-compression - 2) : cSize); b += 4;
            _w32(d, b, uSize);   b += 4;
            _w16(d, b, fnBytes.length); b += 2;
            const exl = _exfl(ex);
            _w16(d, b, exl); b += 2;
            const coml = comment ? comment.length : 0;
            _w16(d, b, coml); b += 2;
            b += 2;                                    // disk number start
            b += 2;                                    // internal attributes
            b += 4;                                    // external attributes
            _w32(d, b, localOffset); b += 4;
            d.set(fnBytes, b); b += fnBytes.length;
            b = _writeExtra(d, b, ex);
            if (comment) { d.set(comment, b); b += coml; }
            return b;
        }

        // --- End of central directory (PK\x05\x06) ---

        function _writeEOCD(o, b, entryCount, cdSize, cdOffset) {
            _w32(o, b, 0x06054B50); b += 4;
            b += 4;                                    // disk number + start disk
            _w16(o, b, entryCount); b += 2;
            _w16(o, b, entryCount); b += 2;
            _w32(o, b, cdSize); b += 4;
            _w32(o, b, cdOffset);
            // comment length field (2 bytes, value 0): implicitly zero in output buffer
        }

        // --- ZIP64 extra field reader ---

        function _z64e(d, b) {
            while (_r16(d, b) !== 1) b += 4 + _r16(d, b + 2);
            return [_r64(d, b + 12), _r64(d, b + 4), _r64(d, b + 20)];
        }

        // Local file header data offset (skip local header)
        function _slzh(d, b) {
            return b + 30 + _r16(d, b + 26) + _r16(d, b + 28);
        }

        // Read central directory entry, return [compression, cSize, uSize, name, nextOffset, localOffset]
        function _readCDE(d, b, zip64) {
            const fnl  = _r16(d, b + 28);
            const utf8 = (_r16(d, b + 8) & 0x800) !== 0;
            const fn   = _u8ToStr(d.subarray(b + 46, b + 46 + fnl), utf8);
            const es   = b + 46 + fnl;
            const bs   = _r32(d, b + 20);
            const [sc, su, off] = zip64 && bs === 0xFFFFFFFF
                ? _z64e(d, es)
                : [bs, _r32(d, b + 24), _r32(d, b + 42)];
            return [_r16(d, b + 10), sc, su, fn, es + _r16(d, b + 30) + _r16(d, b + 32), off];
        }

        // --- Flatten nested directory structure ---

        function _flatten(d, prefix, out, defaultOpts) {
            for (const k in d) {
                const val = d[k];
                const name = prefix + k;
                let data = val, opts = defaultOpts;
                if (Array.isArray(val)) { opts = Object.assign({}, defaultOpts, val[1]); data = val[0]; }
                if (data instanceof Uint8Array) {
                    out[name] = [data, opts];
                } else {
                    out[name + '/'] = [new Uint8Array(0), opts];
                    _flatten(data, name + '/', out, defaultOpts);
                }
            }
        }

        // --- Synchronous API ---

        /**
         * Create a ZIP archive synchronously.
         *
         * @param {object} files - `{ path: Uint8Array | [Uint8Array, opts] | object }`
         * @param {object} [opts] - default per-file options
         * @returns {Uint8Array}
         */
        function zipSync(files, opts = {}) {
            const flat = {};
            _flatten(files, '', flat, opts);

            const entries = [];
            let dataLen = 0;
            let cdLen = 0;

            for (const fn in flat) {
                const [file, p] = flat[fn];
                const compression = (p.level === 0) ? 0 : 8;
                const fnBytes = _strToU8(fn);
                const fnLen = fnBytes.length;
                // @ts-ignore - Error.code is a non-standard but widely-used extension
                if (fnLen > 65535) { const e = new Error('filename too long'); e.code = 11; throw e; }
                const comBytes = p.comment ? _strToU8(p.comment) : null;
                const exl = _exfl(p.extra);
                const u = _isUTF8(fn) || (comBytes && _isUTF8(p.comment));
                const dosTime = _dosDateTime(p.mtime);

                const crc = new Crc32();
                crc.append(file);

                const compressed = compression ? deflateSync(file, p) : file;
                const cSize = compressed.length;
                const uSize = file.length;
                const crcVal = crc.get();

                const localHdrLen = _localHeaderSize(fnLen, exl);
                entries.push({ fnBytes, u, compression, dosTime, crcVal, cSize, uSize,
                                compressed, localHdrLen, p, comBytes, exl, localOffset: dataLen });

                dataLen += localHdrLen + cSize;
                cdLen += _centralEntrySize(fnLen, exl, comBytes ? comBytes.length : 0);
            }

            const out = new Uint8Array(dataLen + cdLen + 22);
            let pos = 0, cdPos = dataLen;

            for (const e of entries) {
                // Write local header + data
                pos = _writeLocalHeader(out, pos, null, e.fnBytes, e.u, e.compression,
                    e.dosTime, e.crcVal, e.cSize, e.uSize, e.p.extra);
                out.set(e.compressed, pos); pos += e.cSize;

                // Write central directory entry
                cdPos = _writeCentralEntry(out, cdPos, e.fnBytes, e.u, e.compression,
                    e.dosTime, e.crcVal, e.cSize, e.uSize, e.localOffset, e.p.extra, e.comBytes);
            }

            _writeEOCD(out, cdPos, entries.length, cdLen, dataLen);
            return out;
        }

        // Reject paths that would escape the extraction root: any `..`
        // segment or an absolute path (POSIX `/`, Windows drive letter, or
        // Windows UNC `\\`). Default-on per ZIP-slip mitigation; callers can
        // opt out with `{ safe: false }`.
        function _isUnsafePath(name) {
            if (!name) return false;
            // Absolute POSIX
            if (name.charCodeAt(0) === 0x2F) return true;
            // Absolute Windows: `C:` or `\\server`
            if (/^[A-Za-z]:[\\/]/.test(name)) return true;
            if (name.startsWith('\\\\')) return true;
            // Normalise separators then look for `..` segments.
            const segs = name.split(/[\\/]/);
            for (const s of segs) if (s === '..') return true;
            return false;
        }

        /**
         * Extract a ZIP archive synchronously.
         *
         * @param {Uint8Array} data
         * @param {object} [opts] - `{ filter?: fn }`
         * @returns {{ [path: string]: Uint8Array }}
         */
        function unzipSync(data, opts = {}) {
            /** @type {{ [path: string]: Uint8Array }} */
            const result = {};
            const safe = opts.safe !== false;

            // Locate end-of-central-directory record
            let e = data.length - 22;
            while (_r32(data, e) !== 0x06054B50) {
                if (!e || data.length - e > 65558) {
                    const err = new Error('invalid zip data');
                    // @ts-ignore - Error.code is a non-standard but widely-used extension
                    err.code = 13;
                    throw err;
                }
                --e;
            }

            let entryCount = _r16(data, e + 8);
            if (!entryCount) return result;

            let cdOffset = _r32(data, e + 16);
            let zip64 = cdOffset === 0xFFFFFFFF || entryCount === 0xFFFF;

            if (zip64) {
                // ZIP64 end-of-central-directory locator at e-12
                const ze = _r32(data, e - 12);
                if (_r32(data, ze) === 0x06064B50) {
                    entryCount = _r32(data, ze + 32);
                    cdOffset   = _r64(data, ze + 48);
                }
            }

            const fltr = opts.filter;
            let o = cdOffset;

            for (let i = 0; i < entryCount; ++i) {
                const [cmp, cSize, uSize, fn, nextOff, localOff] = _readCDE(data, o, zip64);
                o = nextOff;
                const dataStart = _slzh(data, localOff);

                if (safe && _isUnsafePath(fn)) {
                    const err = new Error('zip-slip: unsafe entry path "' + fn + '"');
                    // @ts-ignore - Error.code is a non-standard but widely-used extension
                    err.code = 15;
                    throw err;
                }

                if (fltr && !fltr({ name: fn, size: cSize, originalSize: uSize, compression: cmp })) continue;

                if (cmp === 0) {
                    result[fn] = new Uint8Array(data.subarray(dataStart, dataStart + cSize));
                } else if (cmp === 8) {
                    result[fn] = inflateSync(data.subarray(dataStart, dataStart + cSize), {
                        out: new Uint8Array(uSize),
                    });
                } else {
                    const err = new Error('unknown compression type ' + cmp);
                    // @ts-ignore - Error.code is a non-standard but widely-used extension
                    err.code = 14;
                    throw err;
                }
            }

            return result;
        }

        // === Streaming ZIP writer helpers ===

        // Local file header written with data descriptor flag (bit 3).
        // CRC32 / cSize / uSize are 0 - the data descriptor record after the
        // compressed data carries the real values.
        function _writeLocalHeaderDD(d, b, fnBytes, u, method, dosTime, ex) {
            _w32(d, b, 0x04034B50); b += 4;
            d[b] = 20; b += 2;                            // version needed: 2.0
            d[b] = 8; d[b + 1] = (u ? 8 : 0); b += 2;   // flags: bit3=DD, bit11=UTF-8
            _w16(d, b, method); b += 2;                   // compression method (0 or 8)
            _w32(d, b, dosTime); b += 4;                  // last mod date/time
            b += 12;                                       // CRC32=0, cSize=0, uSize=0
            _w16(d, b, fnBytes.length); b += 2;
            _w16(d, b, _exfl(ex)); b += 2;
            d.set(fnBytes, b); b += fnBytes.length;
            return _writeExtra(d, b, ex);
        }

        // Data descriptor record (PK\x07\x08 + CRC32 + cSize + uSize).
        // Written immediately after the compressed data for streaming entries.
        function _writeDataDescriptor(d, b, crc, cSize, uSize) {
            _w32(d, b, 0x08074B50); b += 4;
            _w32(d, b, crc);   b += 4;
            _w32(d, b, cSize); b += 4;
            _w32(d, b, uSize); b += 4;
            return b;
        }

        // === Streaming ZIP Writer ===

        /**
         * Streaming ZIP archive writer.
         *
         * Emits archive bytes progressively as files are added, enabling
         * download-while-creating use cases without buffering the whole archive.
         * Each file entry (whether added via `add` or `openEntry`) is written as
         * it arrives; the Central Directory and EOCD are emitted by `finalize()`.
         *
         * For entries added via `openEntry`, a data descriptor record
         * (PK\x07\x08) is written after the compressed data so that CRC32 and
         * sizes do not need to be known in advance.
         *
         * ## Usage
         *
         * ```js
         * const zs = new ZipStream({ level: 6 }, (chunk, final) => send(chunk));
         *
         * // Complete file (all bytes available now)
         * zs.add('readme.txt', textBytes);
         *
         * // Large file streamed in chunks
         * const entry = zs.openEntry('big.bin');
         * entry.push(chunk1, false);
         * entry.push(chunk2, true);   // ← final chunk of this file
         *
         * zs.finalize();              // emits Central Directory + EOCD
         * ```
         *
         * Only one entry may be open at a time. Do not call `add`, `openEntry`,
         * or `finalize` while an `openEntry` writer is still active.
         *
         * @param {object|function} [opts] - default per-entry options, or `ondata`
         * @param {function} [ondata] - callback(chunk: Uint8Array, isFinal: boolean)
         */
        function ZipStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata || null;
            this._opts = opts || {};
            this._off = 0;       // bytes emitted to the consumer so far
            this._entries = [];  // metadata for the Central Directory
            this._active = null; // non-null while an openEntry writer is live
        }

        ZipStream.prototype._emit = function(chunk, final) {
            this._off += chunk.length;
            if (this.ondata) this.ondata(chunk, !!final);
        };

        /**
         * Add a complete file entry synchronously.
         *
         * All of the file's bytes must be available at call time.
         *
         * @param {string} name
         * @param {Uint8Array|[Uint8Array, object]} data - file content or `[content, perFileOpts]`
         * @param {object} [opts] - per-entry options (merged with constructor opts)
         */
        ZipStream.prototype.add = function(name, data, opts) {
            if (this._active) throw new Error('ZipStream: an entry is still open');
            if (Array.isArray(data)) { opts = Object.assign({}, data[1], opts); data = data[0]; }
            const p = Object.assign({}, this._opts, opts);
            const fnBytes = _strToU8(name);
            // @ts-ignore - Error.code is a non-standard but widely-used extension
            if (fnBytes.length > 65535) { const e = new Error('filename too long'); e.code = 11; throw e; }
            const u = _isUTF8(name);
            const method = p.level === 0 ? 0 : 8;
            const dosTime = _dosDateTime(p.mtime);
            const exl = _exfl(p.extra);
            const localHdrLen = _localHeaderSize(fnBytes.length, exl);
            const localOffset = this._off;

            const crc = new Crc32(); crc.append(data);
            const crcVal = crc.get();
            const compressed = method ? deflateSync(data, p) : data;
            const cSize = compressed.length;
            const uSize = data.length;

            const out = new Uint8Array(localHdrLen + cSize);
            _writeLocalHeader(out, 0, null, fnBytes, u, method, dosTime, crcVal, cSize, uSize, p.extra);
            out.set(compressed, localHdrLen);
            this._emit(out, false);

            const comBytes = p.comment ? _strToU8(p.comment) : null;
            this._entries.push({ fnBytes, u, method, dosTime, crcVal, cSize, uSize, localOffset, extra: p.extra, comBytes });
        };

        /**
         * Begin a streaming file entry.
         *
         * Returns a writer whose `push(chunk, final)` method accepts file content
         * chunks. The archive stream receives compressed bytes as they are produced.
         * Call `push(lastChunk, true)` to close the entry before using the `ZipStream`
         * again.
         *
         * Because sizes are unknown at header-write time, the local file header has
         * zeros for CRC32/sizes and a data descriptor record is emitted after the
         * compressed data.
         *
         * @param {string} name
         * @param {object} [opts] - per-entry options (merged with constructor opts)
         * @returns {{ push(chunk: Uint8Array, final?: boolean): void }}
         */
        ZipStream.prototype.openEntry = function(name, opts) {
            if (this._active) throw new Error('ZipStream: an entry is still open');
            const p = Object.assign({}, this._opts, opts);
            const fnBytes = _strToU8(name);
            // @ts-ignore - Error.code is a non-standard but widely-used extension
            if (fnBytes.length > 65535) { const e = new Error('filename too long'); e.code = 11; throw e; }
            const u = _isUTF8(name);
            const method = p.level === 0 ? 0 : 8;
            const dosTime = _dosDateTime(p.mtime);
            const exl = _exfl(p.extra);
            const localHdrLen = _localHeaderSize(fnBytes.length, exl);
            const localOffset = this._off;

            // Emit local file header immediately (DD mode - sizes are 0 for now)
            const hdr = new Uint8Array(localHdrLen);
            _writeLocalHeaderDD(hdr, 0, fnBytes, u, method, dosTime, p.extra);
            this._emit(hdr, false);

            const crc = new Crc32();
            let cSize = 0;
            let uSize = 0;
            const self = this;
            const comBytes = p.comment ? _strToU8(p.comment) : null;

            // Set up DeflateStream for DEFLATE entries. Called synchronously per push.
            let ds = null;
            if (method === 8) {
                ds = new DeflateStream(p, function(chunk, dfinal) {
                    cSize += chunk.length;
                    self._emit(chunk, false);
                    if (dfinal) {
                        // Emit data descriptor (PK\x07\x08) then record the CD entry
                        const dd = new Uint8Array(16);
                        _writeDataDescriptor(dd, 0, crc.get(), cSize, uSize);
                        self._emit(dd, false);
                        self._entries.push({ fnBytes, u, method, dosTime, crcVal: crc.get(), cSize, uSize, localOffset, extra: p.extra, comBytes });
                        self._active = null;
                    }
                });
            }

            const state = { done: false };
            this._active = state;

            return {
                /**
                 * @param {Uint8Array} chunk
                 * @param {boolean} [final=false]
                 */
                push(chunk, final) {
                    if (state.done) throw new Error('ZipStream entry already finalized');
                    final = !!final;
                    crc.append(chunk);
                    uSize += chunk.length;
                    if (method === 0) {
                        // Store mode: emit raw bytes directly
                        cSize += chunk.length;
                        self._emit(chunk, false);
                        if (final) {
                            const dd = new Uint8Array(16);
                            _writeDataDescriptor(dd, 0, crc.get(), cSize, uSize);
                            self._emit(dd, false);
                            self._entries.push({ fnBytes, u, method, dosTime, crcVal: crc.get(), cSize, uSize, localOffset, extra: p.extra, comBytes });
                            self._active = null;
                            state.done = true;
                        }
                    } else {
                        // DEFLATE mode: feed chunk to DeflateStream
                        // The DeflateStream callback handles emit + DD + CD entry registration
                        ds.push(chunk, final);
                        if (final) state.done = true;
                    }
                }
            };
        };

        /**
         * Finalise the archive.
         *
         * Emits the Central Directory and End-of-Central-Directory record.
         * `ondata` is called with `isFinal = true` on this last chunk.
         *
         * Must be called after all entries have been added and any open `openEntry`
         * writer has received its final `push`.
         */
        ZipStream.prototype.finalize = function() {
            if (this._active) throw new Error('ZipStream: an entry is still open');
            const cdOffset = this._off;
            let cdLen = 0;
            for (const e of this._entries) {
                cdLen += _centralEntrySize(e.fnBytes.length, _exfl(e.extra), e.comBytes ? e.comBytes.length : 0);
            }
            const out = new Uint8Array(cdLen + 22);
            let pos = 0;
            for (const e of this._entries) {
                pos = _writeCentralEntry(out, pos, e.fnBytes, e.u, e.method, e.dosTime, e.crcVal, e.cSize, e.uSize, e.localOffset, e.extra, e.comBytes);
            }
            _writeEOCD(out, pos, this._entries.length, cdLen, cdOffset);
            this._emit(out, true);
        };

        // === Streaming ZIP Reader ===

        /**
         * Streaming ZIP reader.
         *
         * Buffers all pushed chunks and extracts the archive when `push(chunk, true)`
         * is called. The `onfile` callback receives each extracted file.
         *
         * Note: ZIP's Central Directory is at the end of the archive, so extraction
         * cannot begin before the final byte arrives. This class provides a
         * push-based interface consistent with the other streaming APIs while
         * absorbing that constraint internally.
         *
         * @param {object|function} [opts] - extraction options or `onfile` callback
         * @param {function} [onfile] - callback(name: string, data: Uint8Array, isFinal: boolean)
         */
        function ZipStreamReader(opts, onfile) {
            if (typeof opts === 'function') { onfile = opts; opts = {}; }
            this.onfile = onfile || null;
            this._opts = opts || {};
            this._buf = [];
            this._bufLen = 0;
        }

        /**
         * @param {Uint8Array} chunk
         * @param {boolean} [final=false]
         */
        ZipStreamReader.prototype.push = function(chunk, final) {
            this._buf.push(chunk);
            this._bufLen += chunk.length;
            if (!final) return;

            // Reassemble and extract
            const combined = new Uint8Array(this._bufLen);
            let off = 0;
            for (const c of this._buf) { combined.set(c, off); off += c.length; }
            this._buf = null;

            const files = unzipSync(combined, this._opts);
            if (this.onfile) {
                const names = Object.keys(files);
                for (let i = 0; i < names.length; ++i) {
                    this.onfile(names[i], files[names[i]], i === names.length - 1);
                }
            }
        };

        // Async wrappers (microtask-deferred)
        const _mt = typeof queueMicrotask === 'function'
            ? queueMicrotask
            : fn => Promise.resolve().then(fn);

        /**
         * Asynchronously create a ZIP archive.
         *
         * @param {object} files
         * @param {object} [opts]
         * @returns {Promise<Uint8Array>}
         */
        function zipAsync(files, opts = {}) {
            return new Promise((resolve, reject) => {
                _mt(() => { try { resolve(zipSync(files, opts)); } catch (e) { reject(e); } });
            });
        }

        /**
         * Asynchronously extract a ZIP archive.
         *
         * @param {Uint8Array} data
         * @param {object} [opts]
         * @returns {Promise<{ [path: string]: Uint8Array }>}
         */
        function unzipAsync(data, opts = {}) {
            return new Promise((resolve, reject) => {
                _mt(() => { try { resolve(unzipSync(data, opts)); } catch (e) { reject(e); } });
            });
        }

        return {
            zipSync,
            unzipSync,
            zip: zipAsync,
            unzip: unzipAsync,
            // @ts-ignore - ZipStream is a constructor function matching ZipStreamCtor; TS can't verify function-as-constructor
            ZipStream,
            // @ts-ignore - ZipStreamReader is a constructor function matching ZipStreamReaderCtor; TS can't verify function-as-constructor
            ZipStreamReader,
        };
    }
};
