// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Lempel-Ziv-Welch - dynamic dictionary, variable-width codes.
 *
 * Classic LZW: maintains a dictionary that starts with all single-byte
 * sequences (codes 0..255 when `minCodeBits = 8`) and grows by one entry
 * per encoded symbol. Output codes are emitted at a width that itself
 * grows from `minCodeBits + 1` bits up to `maxBits` bits as the
 * dictionary fills. Compared to LZ77 (sliding window with backward
 * references), LZW is simpler to decode, has no "window" concept, and
 * tends to perform well on inputs with localised repetition.
 *
 * ## Wire-format families
 *
 * | Family | `bigEndian` | `useClearEnd` | `minCodeBits` | Used by |
 * |---|---|---|---|---|
 * | GIF | `false` (LSB-first) | `true` (CLEAR + END markers) | 8 (variable) | image/gif |
 * | TIFF | `true` (MSB-first) | `true` | 8 | image/tiff |
 * | `compress`/.Z | `false` | `false` (no markers, just dict reset on full) | 8 | unix |
 *
 * The defaults below match the GIF profile. Override `bigEndian: true`
 * for TIFF interop.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `encode(data, opts?)` | `Uint8Array` - compressed bytes |
 * | `decode(data, opts?)` | `Uint8Array` - original bytes |
 *
 * Options apply to both directions and **must match** between encode and
 * decode (the LZW container does not store its parameters in-band):
 *
 * | Option | Type | Default | Description |
 * |---|---|---|---|
 * | `minCodeBits` | `number` (2..12) | `8` | log2 of the initial alphabet (`1 << minCodeBits` initial codes) |
 * | `maxBits` | `number` (9..16) | `12` | Max code width before the dictionary stops growing (or resets) |
 * | `bigEndian` | `boolean` | `false` | `false` = LSB-first packing (GIF/Z), `true` = MSB-first (TIFF) |
 * | `useClearEnd` | `boolean` | `true` | Emit `CLEAR = 1 << minCodeBits` and `END = CLEAR + 1` markers |
 *
 */

/**
 * Public surface of `lzw.factory()`.
 * @typedef {object} LzwAPI
 * @property {(data: Uint8Array, opts?: { minCodeBits?: number, maxBits?: number, bigEndian?: boolean, useClearEnd?: boolean }) => Uint8Array} encode Compress `data` to LZW codes.
 * @property {(data: Uint8Array, opts?: { minCodeBits?: number, maxBits?: number, bigEndian?: boolean, useClearEnd?: boolean }) => Uint8Array} decode Decompress LZW codes back to the original bytes.
 */

export const lzw = {
    name: 'lzw',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: [],

    /** @returns {LzwAPI} */
    factory() {

        const u8 = Uint8Array;

        function _resolveOpts(opts) {
            opts = opts || {};
            const minCodeBits = opts.minCodeBits ?? 8;
            const maxBits     = opts.maxBits     ?? 12;
            const bigEndian   = !!opts.bigEndian;
            const useClearEnd = opts.useClearEnd ?? true;
            if (minCodeBits < 2 || minCodeBits > 12) {
                throw new Error('lzw: minCodeBits must be in [2, 12]');
            }
            if (maxBits < minCodeBits + 1 || maxBits > 16) {
                throw new Error('lzw: maxBits must be in [minCodeBits+1, 16]');
            }
            return { minCodeBits, maxBits, bigEndian, useClearEnd };
        }

        // --- Bit writer ---
        //
        // Packs codes either LSB-first (bit 0 of code → low bit of next
        // byte) or MSB-first (bit nbits-1 → high bit of next byte).
        // Buffer grows on demand.

        function _makeBitWriter(bigEndian) {
            let buf = new u8(256);
            let len = 0;        // bytes written
            let acc = 0;        // pending bits accumulator
            let nAcc = 0;       // number of pending bits

            function ensure(n) {
                if (len + n > buf.length) {
                    let cap = buf.length;
                    while (cap < len + n) cap *= 2;
                    const g = new u8(cap);
                    g.set(buf.subarray(0, len));
                    buf = g;
                }
            }

            function writeCode(code, nbits) {
                if (bigEndian) {
                    acc = (acc << nbits) | code;
                    nAcc += nbits;
                    while (nAcc >= 8) {
                        nAcc -= 8;
                        ensure(1);
                        buf[len++] = (acc >>> nAcc) & 0xFF;
                    }
                } else {
                    acc |= code << nAcc;
                    nAcc += nbits;
                    while (nAcc >= 8) {
                        ensure(1);
                        buf[len++] = acc & 0xFF;
                        acc >>>= 8;
                        nAcc -= 8;
                    }
                }
            }

            function flush() {
                if (nAcc > 0) {
                    ensure(1);
                    if (bigEndian) {
                        buf[len++] = (acc << (8 - nAcc)) & 0xFF;
                    } else {
                        buf[len++] = acc & 0xFF;
                    }
                    acc = 0;
                    nAcc = 0;
                }
            }

            function bytes() {
                return buf.slice(0, len);
            }

            return { writeCode, flush, bytes };
        }

        // --- Bit reader ---
        //
        // Yields codes of varying widths. `more` indicates whether enough
        // input remains for another read.

        function _makeBitReader(data, bigEndian) {
            let pos = 0;        // byte position
            let acc = 0;        // pending bits accumulator
            let nAcc = 0;       // number of pending bits

            function readCode(nbits) {
                if (bigEndian) {
                    while (nAcc < nbits) {
                        if (pos >= data.length) return -1;
                        acc = (acc << 8) | data[pos++];
                        nAcc += 8;
                    }
                    nAcc -= nbits;
                    const code = (acc >>> nAcc) & ((1 << nbits) - 1);
                    return code;
                }
                while (nAcc < nbits) {
                    if (pos >= data.length) return -1;
                    acc |= data[pos++] << nAcc;
                    nAcc += 8;
                }
                const code = acc & ((1 << nbits) - 1);
                acc >>>= nbits;
                nAcc -= nbits;
                return code;
            }

            return { readCode };
        }

        // --- Encoder ---

        function encode(data, opts) {
            if (!(data instanceof u8)) throw new Error('lzw.encode: data must be Uint8Array');
            const o = _resolveOpts(opts);

            const initialSize = 1 << o.minCodeBits;
            const clearCode = o.useClearEnd ? initialSize : -1;
            const endCode = o.useClearEnd ? initialSize + 1 : -1;
            const firstFree = o.useClearEnd ? initialSize + 2 : initialSize;

            const w = _makeBitWriter(o.bigEndian);
            let codeBits = o.minCodeBits + 1;
            let nextCode = firstFree;
            const maxCode = (1 << o.maxBits) - 1;

            // Dictionary mapping byte sequences to codes. Keys are byte
            // strings produced via String.fromCharCode - packed tightly so
            // a Map lookup is O(1) amortised.
            const dict = new Map();
            // Seed with single bytes
            for (let i = 0; i < initialSize; ++i) {
                dict.set(String.fromCharCode(i), i);
            }

            if (o.useClearEnd) w.writeCode(clearCode, codeBits);

            if (data.length === 0) {
                if (o.useClearEnd) w.writeCode(endCode, codeBits);
                w.flush();
                return w.bytes();
            }

            let cur = String.fromCharCode(data[0]);
            for (let i = 1; i < data.length; ++i) {
                const nextChar = String.fromCharCode(data[i]);
                const candidate = cur + nextChar;
                if (dict.has(candidate)) {
                    cur = candidate;
                } else {
                    w.writeCode(dict.get(cur), codeBits);
                    if (nextCode <= maxCode) {
                        dict.set(candidate, nextCode++);
                        // After adding `nextCode-1`, the next *future* code
                        // (= nextCode) might no longer fit in `codeBits`.
                        // The decoder side widens its code BEFORE reading
                        // a code that would require the wider width - to
                        // match, widen here when `nextCode === (1<<codeBits)`.
                        if (nextCode === (1 << codeBits) && codeBits < o.maxBits) {
                            codeBits++;
                        }
                    }
                    cur = nextChar;
                }
            }
            w.writeCode(dict.get(cur), codeBits);
            if (o.useClearEnd) w.writeCode(endCode, codeBits);
            w.flush();
            return w.bytes();
        }

        // --- Decoder ---

        function decode(data, opts) {
            if (!(data instanceof u8)) throw new Error('lzw.decode: data must be Uint8Array');
            const o = _resolveOpts(opts);

            const initialSize = 1 << o.minCodeBits;
            const clearCode = o.useClearEnd ? initialSize : -1;
            const endCode = o.useClearEnd ? initialSize + 1 : -1;
            const firstFree = o.useClearEnd ? initialSize + 2 : initialSize;

            const r = _makeBitReader(data, o.bigEndian);

            // Output buffer grows on demand.
            let out = new u8(Math.max(data.length * 2, 256));
            let outLen = 0;
            function append(arr) {
                if (outLen + arr.length > out.length) {
                    let cap = out.length;
                    while (cap < outLen + arr.length) cap *= 2;
                    const g = new u8(cap);
                    g.set(out.subarray(0, outLen));
                    out = g;
                }
                out.set(arr, outLen);
                outLen += arr.length;
            }

            // Dictionary: array indexed by code. Each entry is a Uint8Array.
            const dict = new Array(1 << o.maxBits);
            function resetDict() {
                for (let i = 0; i < initialSize; ++i) dict[i] = new u8([i]);
                // CLEAR / END entries are reserved (codes equal to them
                // never decode to a sequence).
                return firstFree;
            }
            let nextCode = resetDict();
            let codeBits = o.minCodeBits + 1;
            let prevSeq = null;
            const maxCode = (1 << o.maxBits) - 1;

            for (;;) {
                const code = r.readCode(codeBits);
                if (code < 0) break;
                if (code === endCode) break;
                if (code === clearCode) {
                    nextCode = resetDict();
                    codeBits = o.minCodeBits + 1;
                    prevSeq = null;
                    continue;
                }

                let seq;
                if (code < nextCode) {
                    seq = dict[code];
                    if (!seq) {
                        throw new Error('lzw.decode: invalid code ' + code + ' (unassigned)');
                    }
                } else if (code === nextCode && prevSeq) {
                    // "KwKwK" case - code refers to the entry currently
                    // being created. Build it as prev + prev[0].
                    seq = new u8(prevSeq.length + 1);
                    seq.set(prevSeq, 0);
                    seq[prevSeq.length] = prevSeq[0];
                } else {
                    throw new Error('lzw.decode: code ' + code + ' out of range (nextCode=' + nextCode + ')');
                }

                append(seq);

                if (prevSeq && nextCode <= maxCode) {
                    const ent = new u8(prevSeq.length + 1);
                    ent.set(prevSeq, 0);
                    ent[prevSeq.length] = seq[0];
                    dict[nextCode++] = ent;
                    // Classic LZW desync compensation: the decoder lags
                    // the encoder by one entry (it skipped adding on the
                    // very first read). Widen one iteration EARLIER than
                    // the encoder so we're aligned at the next read.
                    if (nextCode === (1 << codeBits) - 1 && codeBits < o.maxBits) {
                        codeBits++;
                    }
                }
                prevSeq = seq;
            }

            return outLen === out.length ? out : out.slice(0, outLen);
        }

        return {
            encode,
            decode,
        };
    }
};
