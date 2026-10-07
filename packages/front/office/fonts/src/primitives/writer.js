// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Big-endian binary writer — symmetric counterpart of
 * {@link ./reader.js}. Used by SFNT writers, table encoders and the
 * subsetter.
 *
 * Thin font-specific facade over `@awacloud/fw` `binaryWriter`. Preserves
 * the historical OpenType-oriented API (`writeFixed`, `writeF2Dot14`,
 * `writeTag(string|uint32)`, `writeLongDateTime`, `padTo4`/`padTo`,
 * `patchUint16/32`) while delegating low-level primitive writes to the
 * framework module.
 *
 * Strict factory body — top-level shims removed. Resolve `fontWriter`
 * through your runtime to obtain `{ BinaryWriter, writer }`.
 *
 * @module fonts/primitives/writer
 */

/**
 * Worker-safe strict factory: the body inlines `BinaryWriter`, the
 * fw writer API resolution and the fixed-point helpers, closing over no
 * top-level state.
 */
import { fontErrors } from '../errors.js';
import { binaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { fontFixed } from './fixed.js';

export const fontWriter = {
    name: 'fontWriter',
    dependencies: ['fontErrors', 'binaryWriter', 'fontFixed'],
    deps: [fontErrors, binaryWriter, fontFixed],
    factory(errors, fwW, fixedMod) {
        const { ContractError } = errors;
        const fwApi = fwW;
        const { fixedToInt32, f2dot14ToInt16 } = fixedMod;

        class BinaryWriter {
            constructor(initialCapacity) {
                const cap = initialCapacity > 0 ? initialCapacity | 0 : 256;
                this._w = fwApi.create({ endian: 'be', initialSize: cap });
            }
            get pos()    { return this._w.pos; }
            get length() { return this._w.length; }
            writeUint8(v)  { this._w.u8(v); return this; }
            writeInt8(v)   { this._w.i8(v); return this; }
            writeUint16(v) { this._w.u16(v); return this; }
            writeInt16(v)  { this._w.i16(v); return this; }
            writeUint24(v) { this._w.u24(v); return this; }
            writeUint32(v) { this._w.u32(v); return this; }
            writeInt32(v)  { this._w.i32(v); return this; }
            writeFixed(v)  { return this.writeInt32(fixedToInt32(v)); }
            writeF2Dot14(v){ return this.writeInt16(f2dot14ToInt16(v)); }
            writeTag(v) {
                if (typeof v === 'string') {
                    if (v.length !== 4) throw new ContractError('fonts/bad-tag', 'tag must be a 4-char string', { context: { value: v } });
                    for (let i = 0; i < 4; i++) {
                        const c = v.charCodeAt(i);
                        if (c > 0x7F)
                            throw new ContractError('fonts/bad-tag',
                                `tag character ${i} out of ASCII range (got U+${c.toString(16)})`,
                                { context: { value: v, index: i, charCode: c } });
                        this.writeUint8(c);
                    }
                    return this;
                }
                return this.writeUint32(v);
            }
            writeLongDateTime(seconds) {
                const hi = Math.floor(seconds / 0x100000000) | 0;
                const lo = (seconds - hi * 0x100000000) >>> 0;
                this._w.i32(hi); this._w.u32(lo);
                return this;
            }
            writeBytes(u8) {
                if (!(u8 instanceof Uint8Array))
                    throw new ContractError('fonts/writer-input', 'writeBytes expects Uint8Array', { context: { actual: typeof u8 } });
                this._w.bytes(u8); return this;
            }
            padTo4() { while (this._w.pos & 3) this.writeUint8(0); return this; }
            padTo(align) { while (this._w.pos % align) this.writeUint8(0); return this; }
            seek(p) {
                if (p < 0 || p > this._w.length)
                    throw new ContractError('fonts/writer-seek', 'seek must stay within written area', { context: { pos: p, length: this._w.length } });
                this._w.seek(p); return this;
            }
            patchUint32(pos, value) {
                const len = this._w.length;
                if (pos < 0 || pos + 4 > len)
                    throw new ContractError('fonts/writer-patch', 'patch position out of bounds', { context: { pos, length: len } });
                const save = this._w.pos;
                this._w.seek(pos); this._w.u32(value); this._w.seek(save);
                return this;
            }
            patchUint16(pos, value) {
                const len = this._w.length;
                if (pos < 0 || pos + 2 > len)
                    throw new ContractError('fonts/writer-patch', 'patch position out of bounds', { context: { pos, length: len } });
                const save = this._w.pos;
                this._w.seek(pos); this._w.u16(value); this._w.seek(save);
                return this;
            }
            finalize() { return this._w.finalize(); }
        }

        function writer(cap) { return new BinaryWriter(cap); }
        return { BinaryWriter, writer };
    }
};
