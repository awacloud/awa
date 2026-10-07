// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Big-endian binary reader for SFNT / OpenType / WOFF /
 * TrueType byte streams.
 *
 * Thin font-specific facade over `@awacloud/fw` `binaryReader`. Preserves
 * the historical OpenType-oriented API (`readFixed`, `readF2Dot14`,
 * `readTag`, `readLongDateTime`, `readOffset16/32`, `peek(fn)`,
 * windowing `sub(start, len)` / `constructor(bytes, start, length)`)
 * while delegating low-level primitive reads to the framework module.
 *
 * Methods that decode multi-byte values are always big-endian, since
 * OpenType is big-endian throughout (head magicNumber, table offsets,
 * cmap entries, glyf coordinates, …).
 *
 * Strict factory body — top-level shims removed. Resolve `fontReader`
 * through your runtime to obtain `{ BinaryReader, reader, sliceTable }`.
 *
 * @module fonts/primitives/reader
 */

/**
 * Worker-safe strict factory: the body inlines `BinaryReader`,
 * `sliceTable`, the fw reader API resolution and the fixed-point helpers,
 * closing over no top-level state.
 */
import { fontErrors } from '../errors.js';
import { binaryReader } from '@awacloud/fw/io/binary/reader.js';
import { fontFixed } from './fixed.js';

export const fontReader = {
    name: 'fontReader',
    dependencies: ['fontErrors', 'binaryReader', 'fontFixed'],
    deps: [fontErrors, binaryReader, fontFixed],
    factory(errors, fwR, fixedMod) {
        const { ParseError } = errors;
        const fwApi = fwR; // fw `create(window, { endian })` API
        const { fixedFromInt32, f2dot14FromInt16 } = fixedMod;

        function _translate(e) {
            if (e && e.name === 'ContractError') {
                const code = (typeof e.code === 'string' && e.code.startsWith('binary/reader-'))
                    ? e.code.replace('binary/reader-', 'fonts/reader-')
                    : 'fonts/reader-error';
                return new ParseError(code, e.message, { context: e.context || {}, cause: e });
            }
            return e;
        }

        class BinaryReader {
            constructor(bytes, start, length) {
                if (!(bytes instanceof Uint8Array))
                    throw new ParseError('fonts/reader-input', 'BinaryReader expects Uint8Array', { context: { actual: typeof bytes } });
                const s = start || 0;
                const l = length == null ? bytes.length - s : length;
                if (s < 0 || l < 0 || s + l > bytes.length)
                    throw new ParseError('fonts/reader-range', 'BinaryReader range out of bounds', { context: { start: s, length: l, bufferLength: bytes.length } });
                const window = bytes.subarray(s, s + l);
                this._bytes = bytes;
                this._start = s;
                this._length = l;
                this._r = fwApi.create(window, { endian: 'be' });
            }
            get pos() { return this._r.pos; }
            get length() { return this._length; }
            get eof() { return this._r.eof(); }

            seek(p) {
                if (p < 0 || p > this._length)
                    throw new ParseError('fonts/reader-seek', 'seek out of bounds',
                        { context: { pos: p, length: this._length } });
                this._r.seek(p); return this;
            }
            skip(n) { this.seek(this._r.pos + n); return this; }
            readBytes(n)     { try { return this._r.bytes(n); } catch (e) { throw _translate(e); } }
            readBytesCopy(n) { return new Uint8Array(this.readBytes(n)); }
            readUint8()      { try { return this._r.u8();  } catch (e) { throw _translate(e); } }
            readInt8()       { try { return this._r.i8();  } catch (e) { throw _translate(e); } }
            readUint16()     { try { return this._r.u16(); } catch (e) { throw _translate(e); } }
            readInt16()      { try { return this._r.i16(); } catch (e) { throw _translate(e); } }
            readUint24()     { try { return this._r.u24(); } catch (e) { throw _translate(e); } }
            readUint32()     { try { return this._r.u32(); } catch (e) { throw _translate(e); } }
            readInt32()      { try { return this._r.i32(); } catch (e) { throw _translate(e); } }
            readFixed()      { return fixedFromInt32(this.readInt32()); }
            readF2Dot14()    { return f2dot14FromInt16(this.readInt16()); }
            readTag()        { return this.readUint32(); }
            readLongDateTime() {
                const hi = this.readInt32();
                const lo = this.readUint32();
                return hi * 0x100000000 + lo;
            }
            readOffset16() { return this.readUint16(); }
            readOffset32() { return this.readUint32(); }
            peek(fn) {
                const p = this._r.pos;
                try { return fn(this); } finally { this._r.seek(p); }
            }
            sub(start, length) {
                if (start < 0 || start + length > this._length)
                    throw new ParseError('fonts/reader-sub', 'sub-reader range out of bounds',
                        { context: { start, length, parentLength: this._length } });
                return new BinaryReader(this._bytes, this._start + start, length);
            }
        }

        function reader(bytes, start, length) { return new BinaryReader(bytes, start, length); }

        function sliceTable(bytes, offset, length) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/reader-input',
                    'sliceTable expects Uint8Array', { context: { actual: typeof bytes } });
            if (offset < 0 || length < 0 || offset + length > bytes.length)
                throw new ParseError('fonts/reader-sub',
                    `sliceTable range [${offset}..${offset + length}) out of bounds (length=${bytes.length})`,
                    { context: { offset, length, bufferLength: bytes.length } });
            return new Uint8Array(bytes.buffer, bytes.byteOffset + offset, length);
        }

        return { BinaryReader, reader, sliceTable };
    }
};
