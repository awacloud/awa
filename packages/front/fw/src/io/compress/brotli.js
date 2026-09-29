// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Brotli codec - RFC 7932 (Brotli Compressed Data Format).
 *
 * Decoder **100% RFC 7932** + dynamic encoder (LZ77 + Huffman + adaptive
 * context modeling + block splitting `NBLTYPES_L ∈ {1, 2}` KL-driven +
 * static-dict refs 121/121 transforms + quality levels 0..11).
 *
 * For the RFC 9841 extensions (large window, shared dictionary, §5 parser),
 * use the companion module [`brotliShared`](./brotli_shared.md) which
 * depends on this one. The private `opts._ext` channel is consumed by
 * `brotliShared` to inject the RFC 9841 hooks:
 *
 *   - `_ext.allowLargeWindow` - accept the §6 large-window WBITS prefix
 *   - `_ext.lz77Dict` / `_ext.lz77Prefix` - virtual prefix prepended to the
 *     output (decoder) or input (encoder) per §3.2
 *   - `_ext.resolveStaticDictRef` - callback replacing the RFC 7932 dict-ref
 *     path with the §3.1 custom dictionaries
 *
 * No user caller should touch `_ext` directly - use `brotliShared` instead.
 *
 * ## Public API
 *
 * | Method | Returns |
 * |---|---|
 * | `brotliCompressSync(data, opts?)` | `Uint8Array` - sync compression |
 * | `brotliDecompressSync(data, opts?)` | `Uint8Array` - sync decompression |
 * | `brotliCompress(data, opts?)` | `Promise<Uint8Array>` - async variant |
 * | `brotliDecompress(data, opts?)` | `Promise<Uint8Array>` - async variant |
 * | `new BrotliCompressStream(opts?, ondata)` | streaming compressor (buffered) |
 * | `new BrotliDecompressStream(opts?, ondata)` | streaming decompressor (EAGAIN-incremental) |
 *
 * One public option: `opts.quality ∈ [0, 11]` (default `6`) - speed/ratio
 * profile (`0` = trivial uncompressed, `1..3` chainDepth 2..4 lazy off,
 * `4..7` lazy on, `8..11` block splitting + chainDepth 16..32).
 *
 * ## Static dictionary
 *
 * Streams that reference the static dictionary (RFC 7932 §8) require the
 * 122,784-byte blob vendored in
 * [`brotliDictWords`](./brotli_dict_words.md). The decoder wires
 * `brotliDict.setWords(brotliDictWords.blob)` on the first dict-ref if and
 * only if `brotliDictWords.isLoaded === true`. On the browser side, call
 * `await brotliDictWords.load(url)` once at boot; on Node/Bun, call
 * `brotliDictWords.setBlob(fs.readFileSync(...))`. Streams that never use
 * the dictionary (short text fully resolved by LZ77) decode without the blob.
 *
 */

/**
 * Streaming Brotli compressor instance shape.
 * @typedef {object} BrotliCompressStreamInstance
 * @property {(chunk: Uint8Array, isFinal: boolean) => void} ondata
 * @property {(chunk: Uint8Array, final?: boolean) => void} push
 */

/**
 * Constructor for `BrotliCompressStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => BrotliCompressStreamInstance} BrotliCompressStreamCtor
 */

/**
 * Streaming Brotli decompressor instance shape.
 * @typedef {object} BrotliDecompressStreamInstance
 * @property {(chunk: Uint8Array, isFinal: boolean) => void} ondata
 * @property {(chunk: Uint8Array, final?: boolean) => void} push
 */

/**
 * Constructor for `BrotliDecompressStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => BrotliDecompressStreamInstance} BrotliDecompressStreamCtor
 */

/**
 * Public surface of `brotli.factory(...)`.
 * @typedef {object} BrotliApi
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} brotliCompressSync
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} brotliDecompressSync
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} brotliCompress
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} brotliDecompress
 * @property {BrotliCompressStreamCtor} BrotliCompressStream
 * @property {BrotliDecompressStreamCtor} BrotliDecompressStream
 * @property {object} _internal
 */

import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';
import { brotliDict } from './brotli_dict.js';
import { brotliDictWords } from './brotli_dict_words.js';

export const brotli = {
    name: 'brotli',
    version: '2.4.0',
    type: 'fw.io.compress',
    dependencies: ['bitstream', 'huffman', 'lz77', 'brotliDict', 'brotliDictWords'],
    deps: [bitstream, huffman, lz77, brotliDict, brotliDictWords],

    /** @returns {BrotliApi} */
    factory(bitstream, huffman, lz77, brotliDict, brotliDictWords) {

        const u8 = Uint8Array;

        // --- Error helper ---

        function _err(code, msg, bitPos) {
            const e = new Error(
                'brotli: ' + msg + (bitPos != null ? ' @ bit ' + bitPos : '')
            );
            // @ts-ignore - Error.code is a non-standard but widely-used extension
            e.code = code;
            throw e;
        }

        // --- Bit reader over input data ---
        //
        // The brotli wire format reads bits LSB-first within each byte. We
        // wrap the input in a small reader object that owns a bit cursor `p`
        // and a padded buffer (4 extra zero bytes) so that bit reads can
        // safely fetch up to 32 bits past the cursor without bounds checks.

        function _makeReader(data, canExpectMore) {
            const padded = new u8(data.length + 4);
            padded.set(data);
            // padded[data.length..] already zero
            const state = {
                d: padded,
                p: 0,                // bit position
                eb: data.length * 8, // exclusive bit end of real data
                rb: data.length,     // real byte length
                eofBits: data.length * 8,
                canExpectMore: !!canExpectMore,
            };
            return state;
        }

        function _eofThrow(r) {
            const e = new Error(r.canExpectMore
                ? 'EAGAIN: input exhausted, more bytes expected'
                : 'EBADSTREAM: unexpected end of input');
            // @ts-ignore - Error.code is a non-standard but widely-used extension
            e.code = r.canExpectMore ? 'EAGAIN' : 'EBADSTREAM';
            throw e;
        }

        // Read 1 bit
        function _readBit(r) {
            if (r.p >= r.eofBits) _eofThrow(r);
            const v = (r.d[r.p >> 3] >> (r.p & 7)) & 1;
            r.p += 1;
            return v;
        }

        // Read 1–24 bits at the cursor and advance.
        //
        // Note: `bitstream.readBits` only loads 2 bytes and is therefore
        // safe only for `n + shift ≤ 16`. Brotli reads up to 24-bit fields
        // (MLEN, MSKIPLEN, INSERT/COPY extras) at any byte offset, so we
        // load 4 bytes from the padded reader buffer here. `_readBitsBig`
        // is kept as a synonym for callsites that document an intent to
        // read more than 16 bits.
        function _readBits(r, n) {
            if (r.p + n > r.eofBits) _eofThrow(r);
            const o = r.p >> 3;
            const shift = r.p & 7;
            const v = ((r.d[o] | (r.d[o + 1] << 8) | (r.d[o + 2] << 16) | (r.d[o + 3] << 24)) >>> shift)
                    & ((1 << n) - 1);
            r.p += n;
            return v;
        }

        // Read 1..50 bits into a Number. For n ≤ 24, defers to _readBits.
        // Beyond 24 bits, splits into a low 24-bit chunk + high (n-24) chunk
        // and combines via Math.pow(2, 24) - exact as long as the assembled
        // value stays under 2^53 (n ≤ 50, since high chunk ≤ 26 bits).
        function _readBitsBig(r, n) {
            if (n <= 24) return _readBits(r, n);
            if (r.p + n > r.eofBits) _eofThrow(r);
            const lo = _readBits(r, 24);
            const hi = _readBits(r, n - 24);
            return hi * 0x1000000 + lo;
        }

        // Advance the cursor to the next byte boundary
        function _alignToByte(r) {
            r.p = (r.p + 7) & ~7;
        }

        // Read 25..62 bits into a BigInt. Used by `_decodeDistanceSymbol`
        // when `ndistbits` exceeds Number's safe range for the intermediate
        // arithmetic (RFC 9841 §6 large window streams with wbits 51..62).
        function _readBitsBigInt(r, n) {
            if (r.p + n > r.eofBits) _eofThrow(r);
            let v = 0n;
            let shift = 0n;
            let remaining = n;
            while (remaining > 24) {
                const chunk = _readBits(r, 24);
                v |= BigInt(chunk) << shift;
                shift += 24n;
                remaining -= 24;
            }
            const last = _readBits(r, remaining);
            v |= BigInt(last) << shift;
            return v;
        }

        // Verify all remaining bits in current byte (after p) are zero
        function _verifyByteTailZero(r) {
            const bit = r.p & 7;
            if (bit === 0) return;
            const tail = r.d[r.p >> 3] >> bit;
            if (tail !== 0) _err('EBADSTREAM', 'non-zero fill bits', r.p);
        }

        // Verify that, starting from the current byte boundary, the rest of
        // the input contains only zero bytes - used to validate stream end.
        function _verifyTrailingZero(r) {
            _verifyByteTailZero(r);
            for (let i = (r.p + 7) >> 3; i < r.rb; ++i) {
                if (r.d[i]) _err('EBADSTREAM', 'non-zero trailing byte at ' + i);
            }
        }

        // --- §9.1 - Stream header: WBITS ---
        //
        // Variable-length code 1..7 bits. See RFC 7932 §9.1 table.
        // Decode tree (LSB-first reading):
        //   bit0 = 0  → WBITS = 16
        //   bit0 = 1, bits[1..3] != 0 (4-bit code) → WBITS = 17 + bits[1..3]
        //   bit0 = 1, bits[1..3] == 0 (7-bit code) → read bits[4..6] as v
        //     v == 0 → WBITS = 17
        //     v == 1 → reserved in RFC 7932 ; RFC 9841 §6 extends with one
        //              more bit:
        //              bit7 = 0 → large window mode: 8-bit prefix
        //                         "00010001" + 6 bits WBITS ∈ [10, 62]
        //              bit7 = 1 → invalid
        //     v ∈ [2..7] → WBITS = 8 + v
        //
        // Large window mode (RFC 9841 §6) is an extension-protocol
        // option: brotli.js refuses the large-window WBITS prefix unless
        // the internal `opts._ext.allowLargeWindow` flag is set (the
        // `brotli_shared` module sets it on behalf of callers that pass
        // the public `allowLargeWindow: true` opt). When enabled, this
        // decoder accepts the full spec range - WBITS values 10..62.
        // For wbits ≤ 50, distance arithmetic uses Number (safe to 2^53);
        // for wbits 51..62, distance reads + arithmetic use BigInt.

        function _readWBITS(r, allowLargeWindow) {
            if (!_readBit(r)) return { wbits: 16, largeWindow: false };
            const mid = _readBits(r, 3);
            if (mid !== 0) return { wbits: 17 + mid, largeWindow: false };
            const tail = _readBits(r, 3);
            if (tail === 0) return { wbits: 17, largeWindow: false };
            if (tail === 1) {
                // RFC 9841 §6 large window prefix candidate
                const next = _readBit(r);
                if (next !== 0) {
                    _err('EBADSTREAM', 'invalid WBITS pattern (8th bit must be 0 for large window)', r.p);
                }
                if (!allowLargeWindow) {
                    _err('EBADSTREAM', 'large window brotli stream - use the brotliShared module with { allowLargeWindow: true }', r.p);
                }
                const wbits = _readBits(r, 6);
                if (wbits < 10 || wbits > 62) {
                    _err('EBADSTREAM', 'large window WBITS ' + wbits + ' out of range [10, 62]', r.p);
                }
                // wbits 51..62 use a BigInt distance-decode path (see
                // `_decodeDistanceSymbol`). Practical distances always
                // fit in Number - only intermediate arithmetic needs
                // BigInt precision.
                return { wbits, largeWindow: true };
            }
            return { wbits: 8 + tail, largeWindow: false };
        }

        // Inverse of `_readWBITS` - emit the stream-header WBITS bits
        // for the chosen `wbits` value. Layout (RFC 7932 §9.1 / RFC 9841 §6):
        //
        //   wbits = 16            → 1 bit  "0"
        //   wbits ∈ [18, 24]      → 4 bits "1" + 3 bits (wbits − 17)
        //   wbits = 17            → 7 bits "1, 000, 000"
        //   wbits ∈ [10, 15]      → 7 bits "1, 000, (wbits − 8)"
        //   wbits ∈ [10, 62] LW   → 14 bits "1, 000, 001, 0, wbits"  (RFC 9841 §6)
        //
        // Caller must use `largeWindow=true` only on encoders that have
        // declared the corresponding `_ext.allowLargeWindow` on the
        // decoder side - RFC 7932 decoders reject this prefix.
        function _emitWBITS(w, wbits, largeWindow) {
            if (largeWindow) {
                if (wbits < 10 || wbits > 62) {
                    _err('EBADARG', 'large window wbits ' + wbits + ' out of [10, 62]');
                }
                // 14 bits LSB-first: bit0=1, mid=0 (3b), tail=1 (3b), next=0,
                // then 6 bits of wbits. Packed value = 0x11 | (wbits << 8).
                w.bits(14, 0x11 | (wbits << 8));
                return;
            }
            if (wbits === 16) { w.bits(1, 0); return; }
            if (wbits >= 18 && wbits <= 24) {
                w.bits(4, ((wbits - 17) << 1) | 1);
                return;
            }
            if (wbits === 17) { w.bits(7, 1); return; }
            if (wbits >= 10 && wbits <= 15) {
                w.bits(7, ((wbits - 8) << 4) | 1);
                return;
            }
            _err('EBADARG', 'wbits ' + wbits + ' out of standard range [10, 24]');
        }

        // --- §9.2 - Meta-block header & body ---
        //
        // Decodes one meta-block starting at the current bit position. On a
        // compressed meta-block (not yet implemented), throws ENOTIMPL.
        // Returns:
        //   { done: true }                - ISLASTEMPTY observed
        //   { done: islast, chunk }       - uncompressed payload produced
        //   { done: false }               - metadata meta-block (no output)

        // Decodes ONE meta-block, mutating `state` (out / outLen / p1 / p2 /
        // lastDist). Returns true when the stream's ISLASTEMPTY terminator
        // is consumed or when an ISLAST non-empty meta-block has completed
        // (caller must then verify trailing-byte fill bits).
        // [RFC 9841 §5 Shared Dictionary Stream parser - moved to brotli_shared.js]
        // The parser + the `_readSharedVarint` helper live in the
        // `brotliShared` module; callers that need `parseSharedDictionary`
        // import from there. brotli.js retains no §5 surface.

        function _decodeMetaBlockInto(r, state) {
            const islast = _readBit(r);
            if (islast) {
                const islastempty = _readBit(r);
                if (islastempty) {
                    _verifyTrailingZero(r);
                    return { done: true, last: true };
                }
            }

            // MNIBBLES - 2-bit code: 11→0, 00→4, 01→5, 10→6
            const mnibblesCode = _readBits(r, 2);
            const mnibbles = mnibblesCode === 3 ? 0 : mnibblesCode + 4;

            if (mnibbles === 0) {
                // Metadata meta-block (§9.2) - does not emit uncompressed
                // bytes and is not part of the sliding window.
                const reserved = _readBit(r);
                if (reserved) _err('EBADSTREAM', 'metadata reserved bit must be 0', r.p);
                const mskipbytes = _readBits(r, 2);
                let mskiplen = 0;
                if (mskipbytes > 0) {
                    mskiplen = mskipbytes <= 2
                        ? _readBits(r, mskipbytes * 8)
                        : _readBitsBig(r, mskipbytes * 8);
                    if (mskipbytes > 1) {
                        const topByte = (mskiplen >>> ((mskipbytes - 1) * 8)) & 0xFF;
                        if (topByte === 0) _err('EBADSTREAM', 'metadata MSKIPLEN top byte must be non-zero', r.p);
                    }
                    mskiplen += 1;
                }
                _alignToByte(r);
                if ((r.p >> 3) + mskiplen > r.rb) {
                    if (r.canExpectMore) _eofThrow(r);
                    _err('EBADSTREAM', 'metadata MSKIPLEN exceeds stream');
                }
                r.p += mskiplen * 8;
                return { done: false, last: false };
            }

            const mlenBits = mnibbles * 4;
            const mlenRaw = mlenBits <= 16 ? _readBits(r, mlenBits) : _readBitsBig(r, mlenBits);
            if (mnibbles > 4) {
                const topNibble = (mlenRaw >>> ((mnibbles - 1) * 4)) & 0xF;
                if (topNibble === 0) _err('EBADSTREAM', 'meta-block MLEN top nibble must be non-zero', r.p);
            }
            const mlen = mlenRaw + 1;

            let isuncompressed = 0;
            if (!islast) isuncompressed = _readBit(r);

            if (isuncompressed) {
                _verifyByteTailZero(r);
                _alignToByte(r);
                const o = r.p >> 3;
                if (o + mlen > r.rb) {
                    // For sync: malformed stream. For streaming: input not
                    // yet complete - caller can retry on next push.
                    if (r.canExpectMore) _eofThrow(r);
                    _err('EBADSTREAM', 'uncompressed MLEN exceeds stream');
                }
                _ensureCapacity(state, mlen);
                state.out.set(r.d.subarray(o, o + mlen), state.outLen);
                state.outLen += mlen;
                if (mlen >= 2) {
                    state.p1 = state.out[state.outLen - 1];
                    state.p2 = state.out[state.outLen - 2];
                } else if (mlen === 1) {
                    state.p2 = state.p1;
                    state.p1 = state.out[state.outLen - 1];
                }
                r.p += mlen * 8;
                return { done: islast === 1, last: islast === 1 };
            }

            // Compressed meta-block: header + body
            const h = _readCompressedMetaBlockHeader(r, state.largeWindow);
            _decodeCompressedBody(r, h, state, mlen);
            return { done: islast === 1, last: islast === 1 };
        }

        // --- §3.4 / §3.5 - Prefix codes ---
        //
        // Two forms share a single entry point `_readPrefixCode(r, n)`:
        //
        // - Simple (head bits = 1, §3.4): explicit list of 1–4 symbols with
        //   fixed length patterns. NSYM=4 has a tree-select bit.
        // - Complex (head bits ∈ {0, 2, 3} = HSKIP, §3.5): code lengths for
        //   the 18-symbol code-length alphabet (decoded via a tiny fixed
        //   table), then RLE-encoded code lengths for the target alphabet,
        //   then a canonical Huffman code built via `huffman.buildMap`.
        //
        // Returned shape: `{ read(r): symbol, alphabetSize }`. For codes
        // with a single non-zero symbol the result is a 0-bit code: `read`
        // consumes no bits and always returns the symbol.

        const u16 = Uint16Array;

        // Smallest k such that 2^k >= n. n ∈ [1, ...].
        function _alphabetBits(n) {
            let k = 0;
            while ((1 << k) < n) ++k;
            return k;
        }

        // Code-length-symbol decode table (§3.5).
        // Index = next 4 LSB of stream. Entry = (symbol << 4) | length.
        //   0b0000 → sym 0, len 2     0b1000 → sym 0, len 2
        //   0b0001 → sym 4, len 2     0b1001 → sym 4, len 2
        //   0b0010 → sym 3, len 2     0b1010 → sym 3, len 2
        //   0b0011 → sym 2, len 3     0b1011 → sym 2, len 3
        //   0b0100 → sym 0, len 2     0b1100 → sym 0, len 2
        //   0b0101 → sym 4, len 2     0b1101 → sym 4, len 2
        //   0b0110 → sym 3, len 2     0b1110 → sym 3, len 2
        //   0b0111 → sym 1, len 4     0b1111 → sym 5, len 4
        const _CL_TABLE = new u16([
            0x02, 0x42, 0x32, 0x23, 0x02, 0x42, 0x32, 0x14,
            0x02, 0x42, 0x32, 0x23, 0x02, 0x42, 0x32, 0x54,
        ]);

        // Order in which code-length-symbol lengths are read (§3.5).
        const _CL_ORDER = new u8([
            1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        ]);

        function _makeSingleSymbolDecoder(symbol) {
            return {
                read(_r) { return symbol; },
                singleSymbol: symbol,
            };
        }

        function _makeTableDecoder(codeLens, alphabetSize) {
            // Find max code length actually used (1..15).
            let maxBits = 0;
            for (let i = 0; i < codeLens.length; ++i) if (codeLens[i] > maxBits) maxBits = codeLens[i];
            if (maxBits === 0) _err('EBADSTREAM', 'prefix code with all-zero lengths');
            const table = huffman.buildMap(codeLens, maxBits, 1);
            const mask = (1 << maxBits) - 1;
            return {
                read(r) {
                    // The peek reads `maxBits` bits unconditionally. In
                    // streaming mode, if those bits would cross eofBits,
                    // bail with EAGAIN so the caller buffers more before
                    // we use any zero-padded "ghost" bits in the lookup.
                    if (r.canExpectMore && r.p + maxBits > r.eofBits) _eofThrow(r);
                    // Peek with a 3-byte load (the reader buffer is padded
                    // by 4 zero bytes): maxBits reaches 15 and the bit shift
                    // 7, i.e. up to 22 bits - beyond `bitstream.readBits`'
                    // 2-byte (16-bit) window, which silently truncated codes
                    // longer than 9 bits.
                    const o = r.p >> 3;
                    const d = r.d;
                    const entry = table[((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >>> (r.p & 7)) & mask];
                    const len = entry & 0x0F;
                    if (len === 0) _err('EBADSTREAM', 'undefined prefix code', r.p);
                    r.p += len;
                    if (r.p > r.eofBits) _eofThrow(r);
                    return entry >>> 4;
                },
                alphabetSize,
            };
        }

        function _readSimplePrefixCode(r, alphabetSize) {
            const nsym = _readBits(r, 2) + 1;
            const abits = _alphabetBits(alphabetSize);
            const syms = new Array(nsym);
            for (let i = 0; i < nsym; ++i) {
                const s = abits === 0 ? 0
                        : abits <= 16 ? _readBits(r, abits)
                                      : _readBitsBig(r, abits);
                if (s >= alphabetSize) _err('EBADSTREAM', 'simple prefix code symbol ' + s + ' >= alphabet ' + alphabetSize, r.p);
                for (let j = 0; j < i; ++j) {
                    if (syms[j] === s) _err('EBADSTREAM', 'simple prefix code duplicate symbol ' + s, r.p);
                }
                syms[i] = s;
            }

            if (nsym === 1) {
                return _makeSingleSymbolDecoder(syms[0]);
            }

            const lens = new u8(alphabetSize);
            if (nsym === 2) {
                lens[syms[0]] = 1;
                lens[syms[1]] = 1;
            } else if (nsym === 3) {
                lens[syms[0]] = 1;
                lens[syms[1]] = 2;
                lens[syms[2]] = 2;
            } else {
                // nsym === 4
                const treeSelect = _readBit(r);
                if (treeSelect === 0) {
                    lens[syms[0]] = 2;
                    lens[syms[1]] = 2;
                    lens[syms[2]] = 2;
                    lens[syms[3]] = 2;
                } else {
                    lens[syms[0]] = 1;
                    lens[syms[1]] = 2;
                    lens[syms[2]] = 3;
                    lens[syms[3]] = 3;
                }
            }
            return _makeTableDecoder(lens, alphabetSize);
        }

        // Read one code-length-symbol via the fixed CL_TABLE.
        function _readClSymbol(r) {
            // Peek 4 bits - see comment in `_makeTableDecoder.read`.
            if (r.canExpectMore && r.p + 4 > r.eofBits) _eofThrow(r);
            const idx = bitstream.readBits(r.d, r.p, 0x0F);
            const entry = _CL_TABLE[idx];
            r.p += entry & 0x0F;
            if (r.p > r.eofBits) _eofThrow(r);
            return entry >>> 4;
        }

        function _readComplexPrefixCode(r, alphabetSize, hskip) {
            // --- Phase 1: read code lengths for the CL alphabet (§3.5) ---
            //
            // The CL alphabet has 18 symbols (0-15 = literal CL, 16/17 =
            // repeat opcodes). Their CL-of-CL values ∈ [0, 5] are stored in
            // the fixed-shape variable-length code decoded via `_CL_TABLE`.
            // Read order is `_CL_ORDER`; HSKIP first entries are skipped
            // (implicitly zero).

            const clOfCl = new u8(18);
            let clOfClKraft = 0;
            for (let i = hskip; i < 18; ++i) {
                const v = _readClSymbol(r);
                clOfCl[_CL_ORDER[i]] = v;
                if (v > 0) {
                    clOfClKraft += 32 >> v;
                    if (clOfClKraft > 32) {
                        _err('EBADSTREAM', 'CL-of-CL Kraft > 1', r.p);
                    }
                    if (clOfClKraft === 32) {
                        // Code is now complete; trailing CL-of-CL values
                        // are implicitly 0 (already from typed-array init).
                        break;
                    }
                }
            }
            if (clOfClKraft !== 32) {
                // Single-symbol CL-of-CL: only one non-zero CL → 0-bit code
                // for that single symbol. Count to confirm.
                let nz = 0;
                for (let i = 0; i < 18; ++i) if (clOfCl[i]) ++nz;
                if (nz !== 1) {
                    _err('EBADSTREAM', 'CL-of-CL Kraft incomplete (sum=' + clOfClKraft + ')', r.p);
                }
            }

            // Build the CL decoder (over the CL alphabet, 18 symbols).
            const clDecoder = clOfClKraft === 32
                ? _makeTableDecoder(clOfCl, 18)
                : (() => {
                    // Single-symbol case
                    let sym = 0;
                    for (let i = 0; i < 18; ++i) if (clOfCl[i]) { sym = i; break; }
                    return _makeSingleSymbolDecoder(sym);
                })();

            // --- Phase 2: read RLE-encoded code lengths for the target alphabet ---

            const lens = new u8(alphabetSize);
            let i = 0;
            let prev = 8;          // initial "previous non-zero code length"
            let prevRep = 0;       // last opcode seen: 0=none, 16, or 17
            let extraTotal = 0;    // running count of the active repeat chain
            let kraftSum = 0;      // sum of (32768 >> cl) over emitted non-zero CLs

            while (i < alphabetSize) {
                const sym = clDecoder.read(r);
                if (sym < 16) {
                    lens[i++] = sym;
                    if (sym > 0) {
                        prev = sym;
                        kraftSum += 32768 >> sym;
                        if (kraftSum > 32768) {
                            _err('EBADSTREAM', 'target-alphabet Kraft > 1', r.p);
                        }
                        if (kraftSum === 32768) break; // complete; rest implicitly 0
                    }
                    prevRep = 0;
                } else if (sym === 16) {
                    let extra;
                    if (prevRep === 16) {
                        const newCount = 4 * (extraTotal - 2) + _readBits(r, 2) + 3;
                        extra = newCount - extraTotal;
                        extraTotal = newCount;
                    } else {
                        extraTotal = _readBits(r, 2) + 3;
                        extra = extraTotal;
                    }
                    prevRep = 16;
                    if (i + extra > alphabetSize) {
                        _err('EBADSTREAM', 'CL repeat-16 overflows alphabet', r.p);
                    }
                    const inc = 32768 >> prev;
                    for (let k = 0; k < extra; ++k) {
                        lens[i++] = prev;
                        kraftSum += inc;
                        if (kraftSum > 32768) {
                            _err('EBADSTREAM', 'target-alphabet Kraft > 1 mid-repeat', r.p);
                        }
                    }
                    if (kraftSum === 32768) break;
                } else { // sym === 17 - repeat zeros
                    let extra;
                    if (prevRep === 17) {
                        const newCount = 8 * (extraTotal - 2) + _readBits(r, 3) + 3;
                        extra = newCount - extraTotal;
                        extraTotal = newCount;
                    } else {
                        extraTotal = _readBits(r, 3) + 3;
                        extra = extraTotal;
                    }
                    prevRep = 17;
                    if (i + extra > alphabetSize) {
                        _err('EBADSTREAM', 'CL repeat-17 overflows alphabet', r.p);
                    }
                    for (let k = 0; k < extra; ++k) lens[i++] = 0;
                }
            }

            // Validate completeness
            if (kraftSum === 32768) {
                return _makeTableDecoder(lens, alphabetSize);
            }

            // Spec: exactly one non-zero CL → 0-bit code for that single symbol.
            let nz = 0, nzSym = 0;
            for (let j = 0; j < lens.length; ++j) if (lens[j]) { ++nz; nzSym = j; }
            if (nz === 1) return _makeSingleSymbolDecoder(nzSym);

            _err('EBADSTREAM', 'target-alphabet Kraft incomplete (sum=' + kraftSum + ', non-zero=' + nz + ')', r.p);
        }

        function _readPrefixCode(r, alphabetSize) {
            if (alphabetSize < 1) _err('EBADARG', 'prefix code alphabet size must be >= 1');
            const head = _readBits(r, 2);
            if (head === 1) return _readSimplePrefixCode(r, alphabetSize);
            return _readComplexPrefixCode(r, alphabetSize, head);
        }

        // --- §6, §7, §9.2 - Compressed meta-block header ---
        //
        // NBLTYPES{L,I,D}, NTREES{L,D}: variable-length 1..11-bit code
        // (RFC 7932 §9.2 table). 1-bit "0" → value 1. Otherwise 4-bit
        // category prefix indicates how many extra bits encode the value.

        function _readVarLenCount(r) {
            if (!_readBit(r)) return 1;
            const v = _readBits(r, 3);
            if (v === 0) return 2;
            return (1 << v) + 1 + _readBits(r, v);
        }

        // --- §6 - Block count code alphabet (26 symbols) ---

        const _BLOCK_COUNT_EXTRA = new u8([
            2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5,
            6, 6, 7, 8, 9, 10, 11, 12, 13, 24,
        ]);
        const _BLOCK_COUNT_BASE = new Int32Array([
            1, 5, 9, 13, 17, 25, 33, 41, 49, 65, 81, 97, 113, 145, 177, 209,
            241, 305, 369, 497, 753, 1265, 2289, 4337, 8433, 16625,
        ]);

        function _readBlockCount(r, blockCountCode) {
            const sym = blockCountCode.read(r);
            if (sym < 0 || sym >= 26) _err('EBADSTREAM', 'block count code out of range', r.p);
            const extraBits = _BLOCK_COUNT_EXTRA[sym];
            const extra = extraBits <= 16 ? _readBits(r, extraBits) : _readBitsBig(r, extraBits);
            return _BLOCK_COUNT_BASE[sym] + extra;
        }

        // --- §7.3 - RLEMAX (1..5 bits) ---

        function _readRleMax(r) {
            if (!_readBit(r)) return 0;
            return _readBits(r, 4) + 1;
        }

        // --- §7.3 - Inverse move-to-front transform on a Uint8Array ---

        function _inverseMoveToFront(v) {
            const mtf = new u8(256);
            for (let i = 0; i < 256; ++i) mtf[i] = i;
            for (let i = 0; i < v.length; ++i) {
                const idx = v[i];
                const val = mtf[idx];
                v[i] = val;
                for (let j = idx; j > 0; --j) mtf[j] = mtf[j - 1];
                mtf[0] = val;
            }
        }

        // --- §7.3 - Context map decoding ---
        //
        // Format: RLEMAX (1..5 bits), prefix code over alphabet
        // `ntrees + rlemax`, then `size` symbols using RLE for zero values,
        // then IMTF bit. If RLEMAX is 0, symbols are direct values.

        function _readContextMap(r, size, ntrees) {
            const rlemax = _readRleMax(r);
            const cmap = new u8(size);
            const code = _readPrefixCode(r, ntrees + rlemax);
            let i = 0;
            while (i < size) {
                const sym = code.read(r);
                if (sym === 0) {
                    cmap[i++] = 0;
                } else if (sym <= rlemax) {
                    // RLE: repeat zero (1 << sym) to (1 << (sym+1)) - 1 times
                    const reps = (1 << sym) + _readBits(r, sym);
                    if (i + reps > size) _err('EBADSTREAM', 'context map RLE overflow', r.p);
                    for (let j = 0; j < reps; ++j) cmap[i++] = 0;
                } else {
                    cmap[i++] = sym - rlemax;
                }
            }
            if (_readBit(r)) _inverseMoveToFront(cmap);
            return cmap;
        }

        // --- §9.2 - Compressed meta-block header ---
        //
        // Returns a "header" object holding everything the command loop
        // (step 6+) needs to start decoding the body: per-category block
        // type/count codes & first block counts, NPOSTFIX/NDIRECT,
        // context modes, context maps, and the three arrays of prefix
        // codes (literal, insert-and-copy, distance).

        function _readBlockCategory(r, h, cat) {
            const nbltypes = _readVarLenCount(r);
            h['nbltypes' + cat] = nbltypes;
            if (nbltypes >= 2) {
                h['htreeBtype' + cat] = _readPrefixCode(r, nbltypes + 2);
                h['htreeBlen' + cat] = _readPrefixCode(r, 26);
                h['blen' + cat] = _readBlockCount(r, h['htreeBlen' + cat]);
            } else {
                // Spec §9.2/§10: with a single block type the count is
                // effectively unbounded - initialise to a value larger
                // than any plausible MLEN so the command loop never trips
                // a block-switch.
                h['blen' + cat] = 16777216;
            }
        }

        function _readCompressedMetaBlockHeader(r, largeWindow) {
            const h = {};

            _readBlockCategory(r, h, 'L');
            _readBlockCategory(r, h, 'I');
            _readBlockCategory(r, h, 'D');

            // NPOSTFIX (2 bits) + NDIRECT (4 bits, then left-shifted by NPOSTFIX)
            h.npostfix = _readBits(r, 2);
            h.ndirect = _readBits(r, 4) << h.npostfix;

            // Context modes: NBLTYPESL * 2 bits, one mode per literal block type
            h.cmode = new u8(h.nbltypesL);
            for (let i = 0; i < h.nbltypesL; ++i) {
                h.cmode[i] = _readBits(r, 2);
            }

            // NTREESL + CMAPL (literal context map)
            h.ntreesL = _readVarLenCount(r);
            const cmapLSize = 64 * h.nbltypesL;
            h.cmapL = h.ntreesL >= 2
                ? _readContextMap(r, cmapLSize, h.ntreesL)
                : new u8(cmapLSize);

            // NTREESD + CMAPD (distance context map)
            h.ntreesD = _readVarLenCount(r);
            const cmapDSize = 4 * h.nbltypesD;
            h.cmapD = h.ntreesD >= 2
                ? _readContextMap(r, cmapDSize, h.ntreesD)
                : new u8(cmapDSize);

            // NTREESL prefix codes for literals (alphabet 256)
            h.htreeL = new Array(h.ntreesL);
            for (let i = 0; i < h.ntreesL; ++i) h.htreeL[i] = _readPrefixCode(r, 256);

            // NBLTYPESI prefix codes for insert-and-copy lengths (alphabet 704)
            h.htreeI = new Array(h.nbltypesI);
            for (let i = 0; i < h.nbltypesI; ++i) h.htreeI[i] = _readPrefixCode(r, 704);

            // NTREESD prefix codes for distances. Alphabet size per §4 of
            // RFC 7932 - (48 << NPOSTFIX) - or §6 of RFC 9841 for large
            // window mode - (124 << NPOSTFIX).
            const distMult = largeWindow ? 124 : 48;
            const distAlphabet = 16 + h.ndirect + (distMult << h.npostfix);
            h.htreeD = new Array(h.ntreesD);
            for (let i = 0; i < h.ntreesD; ++i) h.htreeD[i] = _readPrefixCode(r, distAlphabet);

            h.distAlphabet = distAlphabet;
            h.largeWindow = !!largeWindow;
            return h;
        }

        // --- §5 - Insert-and-copy length codes ---
        //
        // The IAC alphabet has 704 symbols partitioned into 11 "cells" of
        // 64 symbols. The cell index gives (insertCodeBase, copyCodeBase)
        // and whether the distance code is the implicit zero (cells 0/1).
        // Within a cell, bits 0..2 of the IAC sym choose the copy code
        // (within 8 codes from the base) and bits 3..5 choose the insert
        // code. See spec table at §5.

        const _IAC_I_BASE = new u8([0, 0, 0, 0, 8, 8, 0, 16, 8, 16, 16]);
        const _IAC_C_BASE = new u8([0, 8, 0, 8, 0, 8, 16, 0, 16, 8, 16]);
        // Cells 0, 1 (IAC sym < 128) use implicit distance code 0.

        const _INSERT_EXTRA = new u8([
            0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
            6, 7, 8, 9, 10, 12, 14, 24,
        ]);
        const _INSERT_BASE = new Int32Array([
            0, 1, 2, 3, 4, 5, 6, 8, 10, 14, 18, 26, 34, 50, 66, 98,
            130, 194, 322, 578, 1090, 2114, 6210, 22594,
        ]);
        const _COPY_EXTRA = new u8([
            0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
            5, 5, 6, 7, 8, 9, 10, 24,
        ]);
        const _COPY_BASE = new Int32Array([
            2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 22, 30, 38, 54,
            70, 102, 134, 198, 326, 582, 1094, 2118,
        ]);

        function _splitIacSym(iacSym) {
            const cell = iacSym >> 6;
            if (cell >= 11) _err('EBADSTREAM', 'iac symbol ' + iacSym + ' out of range');
            return {
                insertCode: _IAC_I_BASE[cell] + ((iacSym >> 3) & 7),
                copyCode:   _IAC_C_BASE[cell] + (iacSym & 7),
                distZero:   cell < 2,
            };
        }

        function _readLength(r, baseArr, extraArr, code) {
            const eb = extraArr[code];
            const extra = eb <= 16 ? _readBits(r, eb) : _readBitsBig(r, eb);
            return baseArr[code] + extra;
        }

        // --- §4 - Distance decoding ---
        //
        // Special symbols 0..15 reference past distances with offsets.
        // Symbols 16..15+NDIRECT are direct distances 1..NDIRECT.
        // Symbols >= 16+NDIRECT use the NPOSTFIX/NDIRECT formula.

        // Maps dsym 0..15 → [lastDistIndex, offset]
        const _SPECIAL_DIST = new Int8Array([
             0,  0,    1,  0,    2,  0,    3,  0,
             0, -1,    0,  1,    0, -2,    0,  2,    0, -3,    0,  3,
             1, -1,    1,  1,    1, -2,    1,  2,    1, -3,    1,  3,
        ]);

        function _decodeDistanceSymbol(r, dsym, lastDist, npostfix, ndirect) {
            if (dsym < 16) {
                const idx = _SPECIAL_DIST[dsym * 2];
                const off = _SPECIAL_DIST[dsym * 2 + 1];
                const d = lastDist[idx] + off;
                if (d <= 0) _err('EBADSTREAM', 'special distance code ' + dsym + ' resolved to non-positive ' + d, r.p);
                return d;
            }
            if (dsym < 16 + ndirect) return dsym - 15;
            const dcOffset = dsym - ndirect - 16;
            const ndistbits = 1 + (dcOffset >> (npostfix + 1));
            // RFC 9841 §6 allows up to 62-bit distances. ndistbits caps
            // at 62 (per spec). Three arithmetic paths:
            //   - ndistbits ≤ 29 : 32-bit shift (fastest)
            //   - ndistbits ≤ 50 : Math.pow + Number multiplications
            //                      (Number safe to 2^53)
            //   - ndistbits > 50 : BigInt intermediate, Number final
            //                      (valid streams' distances fit Number
            //                      since outLen ≤ 2³² and dict capacity
            //                      ≤ 2²⁰)
            if (ndistbits > 62) {
                _err('EBADSTREAM', 'distance ndistbits ' + ndistbits + ' > 62 (spec ceiling)', r.p);
            }
            const hcode = dcOffset >> npostfix;
            const lcode = dcOffset & ((1 << npostfix) - 1);

            if (ndistbits <= 29) {
                const dextra = _readBits(r, ndistbits);
                const offset = ((2 + (hcode & 1)) << ndistbits) - 4;
                return ((offset + dextra) << npostfix) + lcode + ndirect + 1;
            }
            if (ndistbits <= 50) {
                const dextra = _readBitsBig(r, ndistbits);
                const pow = Math.pow(2, ndistbits);
                const offset = (2 + (hcode & 1)) * pow - 4;
                return (offset + dextra) * (1 << npostfix) + lcode + ndirect + 1;
            }
            // BigInt path for ndistbits 51..62.
            const dextra = _readBitsBigInt(r, ndistbits);
            const pow = 1n << BigInt(ndistbits);
            const offset = BigInt(2 + (hcode & 1)) * pow - 4n;
            const distBig = (offset + dextra) * BigInt(1 << npostfix)
                          + BigInt(lcode + ndirect + 1);
            if (distBig > BigInt(Number.MAX_SAFE_INTEGER)) {
                _err('EBADSTREAM', 'distance exceeds Number safe range (' + distBig + ')', r.p);
            }
            return Number(distBig);
        }

        // --- §7.1 - Literal context lookup tables ---
        //
        // CRCs (RFC 7932 §7.1): Lut0=0x8e91efb7, Lut1=0xd01a32f4, Lut2=0x0dd7a0d6.

        const _LUT0 = new u8([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 4, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            8,12,16,12,12,20,12,16,24,28,12,12,32,12,36,12,
           44,44,44,44,44,44,44,44,44,44,32,32,24,40,28,12,
           12,48,52,52,52,48,52,52,52,48,52,52,52,52,52,48,
           52,52,52,52,52,48,52,52,52,52,52,24,12,28,12,12,
           12,56,60,60,60,56,60,60,60,56,60,60,60,60,60,56,
           60,60,60,60,60,56,60,60,60,60,60,24,12,28,12, 0,
            0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
            0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
            0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
            0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
            2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3,
            2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3,
            2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3,
            2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3,
        ]);
        const _LUT1 = new u8([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
            2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1,
            1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
            2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1,
            1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
            3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
            2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
        ]);
        const _LUT2 = new u8([
            0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
            2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
            2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
            2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
            3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
            3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
            3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
            3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
            4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
            4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
            4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
            4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
            5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
            5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
            5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
            6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7,
        ]);

        function _contextIdLit(mode, p1, p2) {
            if (mode === 0) return p1 & 0x3F;
            if (mode === 1) return p1 >> 2;
            if (mode === 2) return _LUT0[p1] | _LUT1[p2];
            return (_LUT2[p1] << 3) | _LUT2[p2];
        }

        // --- §6 - Block type decoding ---

        function _decodeBlockType(code, nbltypes, current, prev, r) {
            const sym = code.read(r);
            if (sym === 0) return prev;
            if (sym === 1) return (current + 1) % nbltypes;
            const t = sym - 2;
            if (t >= nbltypes) _err('EBADSTREAM', 'block type ' + sym + ' out of range', r.p);
            return t;
        }

        // --- Output buffer growth ---

        function _ensureCapacity(state, additional) {
            if (state.outLen + additional > state.out.length) {
                let newSize = state.out.length;
                while (newSize < state.outLen + additional) newSize *= 2;
                const grown = new u8(newSize);
                grown.set(state.out.subarray(0, state.outLen));
                state.out = grown;
            }
        }

        function _ensureDictLoaded(r) {
            if (brotliDict.hasWords()) return;
            if (brotliDictWords.isLoaded) {
                brotliDict.setWords(brotliDictWords.blob);
                return;
            }
            _err('ENEEDDICT',
                'brotli static dictionary required for this stream - load it via ' +
                'brotliDictWords.setBlob(bytes) or .load(url), then the decoder ' +
                'will auto-wire on the next dict-ref',
                r.p);
        }

        // --- §10 - Command loop for one compressed meta-block ---

        function _decodeCompressedBody(r, h, state, mlen) {
            const startLen = state.outLen;

            // Per-meta-block block-switch state (per §6: initial types 0/1)
            let btypeL = 0, prevBtypeL = 1;
            let btypeI = 0, prevBtypeI = 1;
            let btypeD = 0, prevBtypeD = 1;
            let blenL = h.blenL, blenI = h.blenI, blenD = h.blenD;

            while (state.outLen - startLen < mlen) {
                // --- Block-switch for IAC ---
                if (blenI === 0) {
                    const nb = _decodeBlockType(h.htreeBtypeI, h.nbltypesI, btypeI, prevBtypeI, r);
                    prevBtypeI = btypeI; btypeI = nb;
                    blenI = _readBlockCount(r, h.htreeBlenI);
                }
                blenI--;

                // --- IAC sym → ILEN, CLEN, distZero ---
                const iacSym = h.htreeI[btypeI].read(r);
                const { insertCode, copyCode, distZero } = _splitIacSym(iacSym);
                const ilen = _readLength(r, _INSERT_BASE, _INSERT_EXTRA, insertCode);
                const clen = _readLength(r, _COPY_BASE,   _COPY_EXTRA,   copyCode);

                // --- Insert ILEN literals ---
                // §10: "if number of uncompressed bytes produced in the
                // loop for this meta-block is MLEN, then break from loop".
                // The Google reference decoder still consumes the literal
                // codes from the stream (encoder put them there) but skips
                // writing them. We follow the same lenient interpretation:
                // read every literal, write only as many as fit in MLEN.
                if (ilen > 0) {
                    _ensureCapacity(state, ilen);
                    for (let k = 0; k < ilen; ++k) {
                        if (blenL === 0) {
                            const nb = _decodeBlockType(h.htreeBtypeL, h.nbltypesL, btypeL, prevBtypeL, r);
                            prevBtypeL = btypeL; btypeL = nb;
                            blenL = _readBlockCount(r, h.htreeBlenL);
                        }
                        blenL--;

                        const cidL = _contextIdLit(h.cmode[btypeL], state.p1, state.p2);
                        const treeIdx = h.cmapL[64 * btypeL + cidL];
                        const lit = h.htreeL[treeIdx].read(r);
                        if (state.outLen - startLen < mlen) {
                            state.out[state.outLen++] = lit;
                            state.p2 = state.p1; state.p1 = lit;
                        }
                    }
                }

                // --- Last command's copy is ignored if we've reached MLEN ---
                if (state.outLen - startLen >= mlen) break;

                // --- Resolve distance ---
                let distance, dsym = 0;
                if (distZero) {
                    distance = state.lastDist[0];
                } else {
                    if (blenD === 0) {
                        const nb = _decodeBlockType(h.htreeBtypeD, h.nbltypesD, btypeD, prevBtypeD, r);
                        prevBtypeD = btypeD; btypeD = nb;
                        blenD = _readBlockCount(r, h.htreeBlenD);
                    }
                    blenD--;

                    const cidD = clen > 4 ? 3 : clen - 2;
                    const treeIdx = h.cmapD[4 * btypeD + cidD];
                    dsym = h.htreeD[treeIdx].read(r);
                    distance = _decodeDistanceSymbol(r, dsym, state.lastDist, h.npostfix, h.ndirect);
                }

                const maxAllowed = state.outLen < state.windowSize ? state.outLen : state.windowSize;
                const lz77DictLen = state.lz77Dict ? state.lz77Dict.length : 0;
                // RFC 9841 §3.2: distance values in (max+1)..(max+L) are
                // refs into the LZ77 dictionary; only beyond (max+L) is a
                // static-dict reference (with word_id offset by L).
                const isStaticDictRef = distance > maxAllowed + lz77DictLen;
                const isLz77DictRef = !isStaticDictRef && distance > maxAllowed && lz77DictLen > 0;

                // Push to ring buffer unless code 0 or *static* dict ref.
                // LZ77 dictionary references DO push (treated as regular
                // LZ77 copies per §3.2).
                if (!distZero && dsym !== 0 && !isStaticDictRef) {
                    state.lastDist[3] = state.lastDist[2];
                    state.lastDist[2] = state.lastDist[1];
                    state.lastDist[1] = state.lastDist[0];
                    state.lastDist[0] = distance;
                }

                // --- Copy from past output / LZ77 dictionary / static dictionary ---
                // §10 ("copy length of the last command can have any value")
                // is interpreted permissively: clamp to remaining MLEN.
                const remaining = mlen - (state.outLen - startLen);
                if (isStaticDictRef) {
                    const wordId = distance - maxAllowed - 1 - lz77DictLen;
                    let transformed;

                    if (state.resolveStaticDictRef) {
                        // Extension hook (RFC 9841 §3.1 custom-dict path,
                        // owned by `brotli_shared`). The callback handles
                        // length bounds, dict selection, transform
                        // application - brotli.js stays RFC 7932 here.
                        const cidL = _contextIdLit(h.cmode[btypeL], state.p1, state.p2);
                        transformed = state.resolveStaticDictRef(state, wordId, clen, cidL, r);
                    } else {
                        // RFC 7932 §8 - built-in static dictionary.
                        if (clen < 4 || clen > 24) {
                            _err('EBADSTREAM', 'static dict ref length ' + clen + ' not in [4, 24]', r.p);
                        }
                        _ensureDictLoaded(r);
                        const nw = brotliDict.NWORDS(clen);
                        const index = wordId % nw;
                        const transformId = (wordId - index) / nw;
                        if (transformId >= 121) _err('EBADSTREAM', 'static dict transform id ' + transformId + ' >= 121', r.p);
                        const baseWord = brotliDict.lookupWord(clen, index);
                        transformed = brotliDict.applyTransform(transformId, baseWord);
                    }

                    const writeLen = transformed.length < remaining ? transformed.length : remaining;
                    _ensureCapacity(state, writeLen);
                    state.out.set(transformed.subarray(0, writeLen), state.outLen);
                    state.outLen += writeLen;
                } else if (isLz77DictRef) {
                    // RFC 9841 §3.2: dictionary_address = L + maxAllowed - distance
                    // First copy from lz77Dict[dictAddr..L), then if more
                    // is needed continue from output[windowStart..) (the
                    // oldest byte still in the regular LZ77 window).
                    const dictAddr = lz77DictLen + maxAllowed - distance;
                    const fromDictBytes = lz77DictLen - dictAddr;
                    const writeLen = clen < remaining ? clen : remaining;
                    _ensureCapacity(state, writeLen);
                    const outStart = state.outLen;
                    const windowStart = outStart > state.windowSize ? outStart - state.windowSize : 0;
                    let k = 0;
                    while (k < writeLen && k < fromDictBytes) {
                        state.out[state.outLen++] = state.lz77Dict[dictAddr + k];
                        ++k;
                    }
                    while (k < writeLen) {
                        state.out[state.outLen++] = state.out[windowStart + (k - fromDictBytes)];
                        ++k;
                    }
                } else {
                    const writeLen = clen < remaining ? clen : remaining;
                    _ensureCapacity(state, writeLen);
                    for (let k = 0; k < writeLen; ++k) {
                        state.out[state.outLen] = state.out[state.outLen - distance];
                        state.outLen++;
                    }
                }

                // Update p1, p2 from last 2 emitted bytes
                if (state.outLen >= 2) {
                    state.p1 = state.out[state.outLen - 1];
                    state.p2 = state.out[state.outLen - 2];
                } else if (state.outLen === 1) {
                    state.p2 = state.p1;
                    state.p1 = state.out[state.outLen - 1];
                }
            }
        }

        // --- Public decompressor ---

        function brotliDecompressSync(data, opts) {
            if (!(data instanceof u8)) _err('EBADARG', 'expected Uint8Array');
            if (data.length === 0) _err('EBADSTREAM', 'empty input');

            // `opts._ext` is the private extension protocol consumed by
            // `brotli_shared`. brotli.js itself accepts only RFC 7932 opts
            // on its public surface - see brotli_shared.js for the user-
            // facing RFC 9841 options.
            const ext = (opts && opts._ext) || null;

            const r = _makeReader(data);
            const wbitsInfo = _readWBITS(r, ext && ext.allowLargeWindow);
            const wbits = wbitsInfo.wbits;
            const largeWindow = wbitsInfo.largeWindow;
            // For WBITS ≤ 30 (32-bit-safe), (1 << wbits) is exact in JS.
            const windowSize = wbits >= 31 ? Math.pow(2, wbits) - 16 : (1 << wbits) - 16;

            // Per-stream decoder state (§4 initialises last-distance ring
            // buffer at stream start, NOT per meta-block). The lz77Dict /
            // resolveStaticDictRef fields are extension points wired by
            // `brotli_shared` for RFC 9841 §3.1 / §3.2 - when absent the
            // decoder behaves as a pure RFC 7932 implementation.
            const state = {
                out: new u8(Math.max(data.length * 4, 1024)),
                outLen: 0,
                p1: 0,
                p2: 0,
                lastDist: new Int32Array([4, 11, 15, 16]),
                windowSize,
                lz77Dict: (ext && ext.lz77Dict) || null,
                largeWindow,
                resolveStaticDictRef: (ext && ext.resolveStaticDictRef) || null,
            };

            let sawLast = false;
            while (!sawLast) {
                const res = _decodeMetaBlockInto(r, state);
                if (res.last) sawLast = true;
            }

            // §9.3: "If the last command of the last non-empty meta-block
            // does not end on a byte boundary, the unused bits in the last
            // byte must be zeros."
            _verifyByteTailZero(r);

            return state.outLen === state.out.length
                ? state.out
                : state.out.slice(0, state.outLen);
        }

        // --- Stubs for unimplemented operations ---

        // --- §9 / §11.1 - Encoder ---
        //
        // Produces a valid brotli stream by framing the input as a
        // sequence of uncompressed meta-blocks (max 65 536 bytes each)
        // followed by an empty ISLASTEMPTY terminator. The output is
        // ALWAYS larger than the input (overhead is ≈ 5 bytes plus 3
        // bytes per 64 KB chunk) - actual compression at higher quality
        // levels is the subject of steps 8+. Until those land, all
        // requested `quality` values fall back to this trivial encoder
        // (the output is still RFC 7932-conformant; encoders are simply
        // allowed to be lazy).
        //
        // Empty input is encoded as the single byte `0x06`
        // (WBITS=16 + ISLAST + ISLASTEMPTY).

        function _encodeUncompressed(data) {
            if (data.length === 0) return new u8([0x06]);

            // Conservative size: WBITS + per-chunk headers (≤4 bytes each
            // counting alignment) + data + final empty meta-block. The
            // exact bit math is handled by the writer below.
            const numChunks = Math.ceil(data.length / 65536);
            const buf = new u8(data.length + 5 + numChunks * 4);
            let p = 0;

            // WBITS = 16 → 1 bit "0" (buf already zero-filled)
            p += 1;

            for (let i = 0; i < data.length; i += 65536) {
                const chunkLen = Math.min(65536, data.length - i);
                // ISLAST=0, MNIBBLES code "00" (=4) - 3 zero bits (no-op)
                p += 3;
                // MLEN-1 over 16 bits
                bitstream.writeBits16(buf, p, chunkLen - 1);
                p += 16;
                // ISUNCOMPRESSED=1
                bitstream.writeBits(buf, p, 1);
                p += 1;
                // Align to byte boundary (fill bits already zero)
                p = (p + 7) & ~7;
                // Copy chunk payload
                buf.set(data.subarray(i, i + chunkLen), p >> 3);
                p += chunkLen * 8;
            }

            // Final empty meta-block: ISLAST=1 + ISLASTEMPTY=1
            bitstream.writeBits(buf, p, 3);
            p += 2;
            p = (p + 7) & ~7;

            return buf.slice(0, p >> 3);
        }

        // --- Step 9 - LZ77 + dynamic Huffman encoder ---
        //
        // Single compressed meta-block with:
        //   * NBLTYPES{L,I,D} = 1 (no block switching)
        //   * NPOSTFIX = 0, NDIRECT = 0 → distance alphabet 64
        //   * CMODE = 2 (UTF8) - recorded but with NTREESL=1 the context
        //     does not affect tree selection. Real context modelling
        //     (NTREESL >= 2 with CMAPL) is queued for step 10.
        //   * Dynamic canonical Huffman codes for the three per-category
        //     alphabets (literal/IAC/distance), built from LZ77-derived
        //     symbol frequencies.
        //   * Prefix-code descriptors emitted in complex form (§3.5).

        // §3.5 CL-of-CL code - fixed variable-length code mapping the
        // CL-of-CL value (0..5) to (bit-length, LSB-first bits). Derived
        // from the spec table by reading each "right-to-left" pattern.
        const _CL_OF_CL_VAL = new u8([0, 7, 3, 2, 1, 15]);
        const _CL_OF_CL_LEN = new u8([2, 4, 3, 2, 2, 4]);

        function _insertCodeFor(len) {
            for (let c = 23; c >= 0; --c) {
                if (_INSERT_BASE[c] <= len) {
                    return { code: c, extra: len - _INSERT_BASE[c], extraBits: _INSERT_EXTRA[c] };
                }
            }
            return null;
        }
        function _copyCodeFor(len) {
            for (let c = 23; c >= 0; --c) {
                if (_COPY_BASE[c] <= len) {
                    return { code: c, extra: len - _COPY_BASE[c], extraBits: _COPY_EXTRA[c] };
                }
            }
            return null;
        }

        function _findIacSym(iCode, cCode, distZero) {
            const iHi = iCode >> 3, iLo = iCode & 7;
            const cHi = cCode >> 3, cLo = cCode & 7;
            let cell;
            if (distZero) {
                if (iHi !== 0 || cHi > 1) return -1;
                cell = cHi;
            } else {
                const T = [[2, 3, 6], [4, 5, 8], [7, 9, 10]];
                cell = T[iHi][cHi];
            }
            return (cell << 6) | (iLo << 3) | cLo;
        }

        // Encode a distance under arbitrary (NPOSTFIX, NDIRECT) per
        // RFC 7932 §4. Returns `{ dsym, extra, extraBits }` such that the
        // decoder's `_decodeDistanceSymbol` reproduces `distance`. The
        // direct range (distances 1..NDIRECT) gets dedicated symbols
        // 16..15+NDIRECT with no extra bits; longer distances use the
        // (ndistbits, hcode, lcode) decomposition.
        function _distanceCodeFor(distance, npostfix, ndirect) {
            if (npostfix == null) npostfix = 0;
            if (ndirect == null) ndirect = 0;
            if (distance >= 1 && distance <= ndirect) {
                return { dsym: 16 + (distance - 1), extra: 0, extraBits: 0 };
            }
            const dPrime = distance - ndirect - 1;
            if (dPrime < 0) return null;
            const lcodeMask = (1 << npostfix) - 1;
            const lcode = dPrime & lcodeMask;
            const rest = dPrime >> npostfix;
            for (let k = 1; k <= 24; ++k) {
                // hbit=0 bucket: offset = ((2 + 0) << k) - 4 = (1<<(k+1)) - 4
                const evenLo = (1 << (k + 1)) - 4;
                const evenHi = evenLo + (1 << k) - 1;
                if (rest >= evenLo && rest <= evenHi) {
                    const dextra = rest - evenLo;
                    const hcode = (k - 1) * 2;
                    const dcOffset = (hcode << npostfix) | lcode;
                    return { dsym: 16 + ndirect + dcOffset, extra: dextra, extraBits: k };
                }
                // hbit=1 bucket: offset = ((2 + 1) << k) - 4 = (3<<k) - 4
                const oddLo = (3 << k) - 4;
                const oddHi = oddLo + (1 << k) - 1;
                if (rest >= oddLo && rest <= oddHi) {
                    const dextra = rest - oddLo;
                    const hcode = (k - 1) * 2 + 1;
                    const dcOffset = (hcode << npostfix) | lcode;
                    return { dsym: 16 + ndirect + dcOffset, extra: dextra, extraBits: k };
                }
            }
            return null;
        }

        function _makeWriter(initialCapacity) {
            let buf = new u8(Math.max(initialCapacity | 0, 256));
            let bp = 0;
            function ensure(extraBits) {
                const need = ((bp + extraBits + 7) >> 3) + 4;
                if (need > buf.length) {
                    let n = buf.length;
                    while (n < need) n *= 2;
                    const g = new u8(n);
                    g.set(buf);
                    buf = g;
                }
            }
            return {
                bits(n, v) {
                    ensure(n);
                    bitstream.writeBits16(buf, bp, v & ((1 << n) - 1));
                    bp += n;
                },
                align() { bp = (bp + 7) & ~7; ensure(0); },
                bytes() { return buf.slice(0, (bp + 7) >> 3); },
                pos() { return bp; },
            };
        }

        function _firstNonZero(arr) {
            for (let i = 0; i < arr.length; ++i) if (arr[i]) return i;
            return -1;
        }

        function _padFreqs(freqs) {
            let nz = 0;
            for (const v of freqs) if (v) { if (++nz === 2) return; }
            let need = 2 - nz;
            for (let i = 0; i < freqs.length && need > 0; ++i) {
                if (!freqs[i]) { freqs[i] = 1; --need; }
            }
        }

        function _padTo(arr, n) {
            if (arr.length === n) return arr;
            const out = new u8(n);
            for (let i = 0; i < arr.length && i < n; ++i) out[i] = arr[i];
            return out;
        }

        // Emit a complex prefix-code descriptor (§3.5).
        function _emitPrefixCodeDescriptor(w, codeLens) {
            // Find last non-zero target CL - we emit up to there.
            let lastNonZeroTgt = -1;
            for (let i = 0; i < codeLens.length; ++i) {
                if (codeLens[i] > 0) lastNonZeroTgt = i;
            }
            if (lastNonZeroTgt < 0) {
                _err('EINTERNAL', 'prefix code with all-zero lengths cannot be emitted');
            }

            // Histogram of CL values used (up to and including last).
            const clHist = new Int32Array(18);
            for (let i = 0; i <= lastNonZeroTgt; ++i) clHist[codeLens[i]]++;

            // Build CL-of-CL canonical code, capped at 5 bits.
            const { t: clOfClRaw, l: clOfClMaxBits } = huffman.buildTree(clHist, 5);
            const clOfCl = new u8(18);
            for (let i = 0; i < clOfClRaw.length && i < 18; ++i) clOfCl[i] = clOfClRaw[i];

            // HSKIP = 0
            w.bits(2, 0);

            // Emit CL-of-CL values via the fixed §3.5 code.
            // - If ≥ 2 non-zero CL-of-CL values, stop at the last non-zero
            //   in _CL_ORDER (decoder breaks on Kraft=32).
            // - If only one non-zero, emit all 18 (decoder reads them
            //   all, then applies the single-symbol rule).
            let nzClOfCl = 0;
            for (let i = 0; i < 18; ++i) if (clOfCl[i]) ++nzClOfCl;

            let stopAt = 18;
            if (nzClOfCl >= 2) {
                let last = -1;
                for (let i = 0; i < 18; ++i) {
                    if (clOfCl[_CL_ORDER[i]] > 0) last = i;
                }
                stopAt = last + 1;
            }
            for (let i = 0; i < stopAt; ++i) {
                const v = clOfCl[_CL_ORDER[i]];
                w.bits(_CL_OF_CL_LEN[v], _CL_OF_CL_VAL[v]);
            }

            // Build canonical encode map for the CL alphabet.
            const clMap = nzClOfCl >= 1
                ? huffman.buildMap(clOfCl, Math.max(clOfClMaxBits, 1), 0)
                : null;
            const singleCl = nzClOfCl === 1 ? _firstNonZero(clOfCl) : -1;

            // Emit target alphabet CLs. We break early on Kraft=32768.
            let tgtKraft = 0;
            for (let i = 0; i <= lastNonZeroTgt; ++i) {
                const v = codeLens[i];
                if (nzClOfCl === 1) {
                    // Single-symbol CL decoder: must be the only CL used.
                    if (v !== singleCl) {
                        _err('EINTERNAL', 'CL ' + v + ' incompatible with single-symbol CL-of-CL (' + singleCl + ')');
                    }
                    // 0 bits emitted per CL.
                } else {
                    const len = clOfCl[v];
                    if (len === 0) _err('EINTERNAL', 'no CL-of-CL assignment for CL value ' + v);
                    w.bits(len, clMap[v]);
                }
                if (v > 0) {
                    tgtKraft += 32768 >> v;
                    if (tgtKraft === 32768) break;
                }
            }
        }

        // Cluster 64 UTF8 contexts into NTREESL_OPT literal trees by a
        // simple high-bits hash. Better clustering (data-driven) is a
        // potential follow-up - current heuristic gives noticeable gains
        // on English text by separating "alphabetic" from "punctuation"
        // contexts.
        const _NTREESL_OPT = 4;
        function _clusterContext(ctxId) { return ctxId >> 4; }

        // Pick the best CMODE ∈ {0=LSB6, 1=MSB6, 2=UTF8, 3=Signed} for
        // the given input, by computing per-mode literal entropy under
        // the encoder's NTREESL=4 clustering. The mode with the lowest
        // total bit count wins.
        //
        // Sampled to first 16 KiB to bound the pre-pass cost (worst case
        // ~64 K loop iterations per mode = 256 K total - fast).
        function _pickCMode(data) {
            const SAMPLE = data.length < 16384 ? data.length : 16384;
            if (SAMPLE < 64) return 2;  // UTF8 default for tiny inputs

            const NTL = _NTREESL_OPT;
            let bestMode = 2;
            let bestBits = Infinity;

            for (let mode = 0; mode < 4; ++mode) {
                // Per-tree frequencies + totals
                const freqs = new Array(NTL);
                for (let t = 0; t < NTL; ++t) freqs[t] = new Int32Array(256);
                const totals = new Int32Array(NTL);

                let p1 = 0, p2 = 0;
                for (let i = 0; i < SAMPLE; ++i) {
                    const byte = data[i];
                    const ctxId = _contextIdLit(mode, p1, p2);
                    const tree = ctxId >> 4;
                    ++freqs[tree][byte];
                    ++totals[tree];
                    p2 = p1; p1 = byte;
                }

                // Entropy in bits: sum over trees of sum over bytes of
                //   count * log2(treeTotal / count).
                let bits = 0;
                for (let t = 0; t < NTL; ++t) {
                    const total = totals[t];
                    if (total === 0) continue;
                    const f = freqs[t];
                    const logTotal = Math.log2(total);
                    for (let s = 0; s < 256; ++s) {
                        const c = f[s];
                        if (c > 0) bits += c * (logTotal - Math.log2(c));
                    }
                }
                if (bits < bestBits) { bestBits = bits; bestMode = mode; }
            }
            return bestMode;
        }

        // Emit a context map (§7.3) with RLEMAX=0 and IMTF=0. Values
        // are in [0, ntrees-1]. We rebuild a small prefix code over the
        // 'ntrees'-sized alphabet, then write each value directly.
        function _emitContextMap(w, cmap, ntrees) {
            // RLEMAX = 0
            w.bits(1, 0);
            // Build a prefix code over alphabet `ntrees` from the
            // frequencies in cmap.
            const freq = new Int32Array(ntrees);
            for (const v of cmap) ++freq[v];
            _padFreqs(freq);
            const { t: lens0, l: maxBits } = huffman.buildTree(freq, 15);
            const lens = _padTo(lens0, ntrees);
            const map = huffman.buildMap(lens, Math.max(maxBits, 1), 0);
            _emitPrefixCodeDescriptor(w, lens);
            // Emit each cmap entry
            for (const v of cmap) w.bits(lens[v], map[v]);
            // IMTF = 0
            w.bits(1, 0);
        }

        // Encode NTREES (or NBLTYPES) via the §9.2 variable-length code.
        // 1     → "0"           (1 bit, val 0)
        // 2     → "0001"        (4 bits LSB-first val 1)
        // 3..4  → "x0011"       (5 bits, base 3, 1 extra)
        // 5..8  → "xx0101"      (6 bits, base 5, 2 extra)
        // …
        // 129..256 → "xxxxxxx1111" (11 bits, base 129, 7 extra)
        function _emitVarLenCount(w, n) {
            if (n === 1) { w.bits(1, 0); return; }
            // Signal !=1 with bit 0 = 1
            // Category v ∈ [0, 7]; n = (1<<v) + 1 + extra, extra ∈ [0, (1<<v)-1].
            if (n === 2) { w.bits(4, 0b0001); return; }
            let v = 0;
            while ((1 << v) + 1 + ((1 << v) - 1) < n) ++v;
            const base = (1 << v) + 1;
            const extra = n - base;
            // bit 0 = 1, bits 1..3 = v, bits 4..(4+v-1) = extra
            // Build as a single integer LSB-first.
            const valPrefix = 1 | (v << 1);    // 4 bits
            w.bits(4, valPrefix);
            if (v > 0) w.bits(v, extra);
        }

        // Lazy-built hash tables over the brotli static dictionary.
        //
        // `table` indexes the first 4 bytes of every word - used by every
        // Identity / FermentFirst / FermentAll / OmitLastK scan path.
        //
        // `ofTables[k]` indexes the 4 bytes at offset `k` of every word
        // of length >= k+4 - used by the OmitFirstK scan. k ∈ {1..7, 9}
        // (k=8 has no transform, per RFC 7932 §8).
        //
        // Built once per `brotli.factory(...)` instance and cached for
        // the life of the closure.
        let _staticDictHash = null;
        let _staticDictHashTried = false;

        // OmitFirstK k values, matching `_OF_TID_BY_K` below.
        const _OF_K_VALUES = [1, 2, 3, 4, 5, 6, 7, 9];

        function _getStaticDictHash() {
            if (_staticDictHash !== null) return _staticDictHash;
            if (_staticDictHashTried) return null;
            _staticDictHashTried = true;
            if (!brotliDictWords.isLoaded) return null;
            if (!brotliDict.hasWords()) brotliDict.setWords(brotliDictWords.blob);

            const words = brotliDictWords.blob;
            const table = new Map();
            const ofTables = new Array(10);  // sparse, indexed by k
            for (const k of _OF_K_VALUES) ofTables[k] = new Map();

            for (let len = 4; len <= 24; ++len) {
                const nwords = brotliDict.NWORDS(len);
                if (nwords === 0) continue;
                const dofs = brotliDict.DOFFSET(len);
                for (let idx = 0; idx < nwords; ++idx) {
                    const off = dofs + len * idx;
                    const h = (words[off] | (words[off + 1] << 8) | (words[off + 2] << 16) | (words[off + 3] << 24)) >>> 0;
                    let bucket = table.get(h);
                    if (!bucket) { bucket = []; table.set(h, bucket); }
                    bucket.push({ len, idx, off });

                    // OmitFirstK auxiliary hashes
                    for (const k of _OF_K_VALUES) {
                        if (len < k + 4) continue;
                        const ofh = (words[off + k] | (words[off + k + 1] << 8) | (words[off + k + 2] << 16) | (words[off + k + 3] << 24)) >>> 0;
                        const ofTable = ofTables[k];
                        let ofBucket = ofTable.get(ofh);
                        if (!ofBucket) { ofBucket = []; ofTable.set(ofh, ofBucket); }
                        ofBucket.push({ len, idx, off });
                    }
                }
            }
            _staticDictHash = { table, words, ofTables };
            return _staticDictHash;
        }

        // Map k (OmitFirstK depth) → transform id (RFC 7932 §8 Table 1).
        const _OF_TID_BY_K = new Map([
            [1, 3], [2, 11], [3, 26], [4, 34], [5, 39],
            [6, 40], [7, 55], [9, 54],
        ]);

        // Build, once per factory instance, the list of Identity-kind
        // (kind=0), FermentFirst-kind (kind=1) and FermentAll-kind
        // (kind=2) transforms from `brotliDict.transforms`, grouped by
        // their UTF-8 prefix bytes. Each group lists the (id, suffix)
        // pairs sharing the prefix, sorted longest-suffix-first.
        //
        // FermentFirst transforms (~19 of 121) match dict words appearing
        // capitalized in input (e.g. "The", "When"). FermentAll transforms
        // (~16 of 121) match dict words appearing fully uppercased
        // (e.g. "THE", "ERROR"). Both encoder scans are restricted to
        // ASCII fermenting (a..z → A..Z); 2-byte and 3-byte UTF-8
        // codepoint case-folding on the encode side would require a
        // separate hash over case-folded variants and remains future work.
        //
        // OmitFirstK and OmitLastK transforms remain encoder-unsupported.
        let _idTransformGroups = null;
        let _ffTransformGroups = null;
        let _faTransformGroups = null;
        // OmitLastK: a Map<k, Array<{id, suffix}>> for k ∈ {1..9}, sorted
        // longest-suffix-first. All OL transforms have prefix="" (per RFC
        // 7932 §8) so no prefix index is needed.
        let _olByK = null;
        function _buildEncoderTransformGroups() {
            if (_idTransformGroups !== null) return;
            const idByPrefix = new Map();
            const ffByPrefix = new Map();
            const faByPrefix = new Map();
            const olByK = new Map();
            const tlist = brotliDict.transforms;
            for (let id = 0; id < tlist.length; ++id) {
                const t = tlist[id];
                if (t.kind === 0 || t.kind === 1 || t.kind === 2) {
                    const bucket = t.kind === 0 ? idByPrefix
                                 : t.kind === 1 ? ffByPrefix
                                 : faByPrefix;
                    const key = Array.from(t.prefix).join(',');
                    let g = bucket.get(key);
                    if (!g) {
                        g = { prefix: t.prefix, suffixes: [] };
                        bucket.set(key, g);
                    }
                    g.suffixes.push({ id, suffix: t.suffix });
                } else if (t.kind >= 12 && t.kind <= 20) {
                    // OmitLastK, k = param. All have prefix="" in RFC 7932.
                    if (t.prefix.length !== 0) continue;
                    const k = t.param;
                    let arr = olByK.get(k);
                    if (!arr) { arr = []; olByK.set(k, arr); }
                    arr.push({ id, suffix: t.suffix });
                }
                // OmitFirstK (kinds 3..11) not yet handled - needs a
                // separate hash table keyed on dict-byte offsets > 0.
            }
            const finalize = (m) => {
                const groups = Array.from(m.values());
                for (const g of groups) {
                    g.suffixes.sort((a, b) => b.suffix.length - a.suffix.length);
                }
                groups.sort((a, b) => a.prefix.length - b.prefix.length);
                return groups;
            };
            _idTransformGroups = finalize(idByPrefix);
            _ffTransformGroups = finalize(ffByPrefix);
            _faTransformGroups = finalize(faByPrefix);
            for (const arr of olByK.values()) {
                arr.sort((a, b) => b.suffix.length - a.suffix.length);
            }
            _olByK = olByK;
        }

        // Find the longest brotli static-dict match at `data[pos]`. Tries
        // every Identity-kind transform from RFC 7932 §8 (ids 0, 1, 2, 5,
        // 6, 7, 8, 10, 13, 14, 16, 17, 18, 19, 20, 21, 22, 24, 25, 28, 29,
        // 31, 32, 33, 35, 36, 37, 38, 41, 43, 45, 46, 47, 50, 51, 52, 53,
        // 57, 60, 61, 62, 67, 70, 71, 72, 73, 75, 76, 77, 80, 81, 82, 84,
        // 86, 89, 90, 92, 93, 95, 98, 100, 102, 103, 106) - i.e. all
        // transforms whose body is the dict word verbatim with arbitrary
        // UTF-8 prefix/suffix bytes.
        //
        // Returns `{ outputLen, dictLen, idx, transformId }` where
        //   - dictLen is the dict word length (= CLEN to emit)
        //   - outputLen is the bytes produced by the transform (used to
        //     advance the input/output positions)
        function _findStaticDictMatchAt(data, pos, end, dictHash, minLen) {
            const words = dictHash.words;
            _buildEncoderTransformGroups();
            let bestOutLen = 0, bestDictLen = 0, bestIdx = 0, bestTransform = 0;

            // Inner: given prefix-verified `hashStart`, a `firstByte`
            // override (for FermentFirst un-ferment), the dict-word body
            // verification function `bodyByteAt(c, m)`, and the suffix
            // list, update the best candidate.
            // (Inlined by hand below in two near-identical loops to keep
            // the hot path branchless.)

            // --- Identity scan (+ OmitLastK on partial body match) ---
            const idGroups = _idTransformGroups;
            for (let gi = 0; gi < idGroups.length; ++gi) {
                const g = idGroups[gi];
                const pre = g.prefix;
                const preLen = pre.length;
                if (pos + preLen + 4 > end) continue;
                let mp = 0;
                while (mp < preLen && data[pos + mp] === pre[mp]) ++mp;
                if (mp !== preLen) continue;

                const hashStart = pos + preLen;
                const h = (data[hashStart] | (data[hashStart + 1] << 8) | (data[hashStart + 2] << 16) | (data[hashStart + 3] << 24)) >>> 0;
                const bucket = dictHash.table.get(h);
                if (!bucket) continue;

                for (let i = 0; i < bucket.length; ++i) {
                    const c = bucket[i];
                    // Walk the body as far as it matches - capture m even
                    // when it stops short, so we can offer the prefix to
                    // OmitLastK when this is the empty-prefix Identity
                    // group.
                    const bodyEnd = hashStart + c.len > end ? end : hashStart + c.len;
                    let m = 4;
                    while (hashStart + m < bodyEnd && data[hashStart + m] === words[c.off + m]) ++m;

                    if (m === c.len) {
                        const sufStart = hashStart + c.len;
                        const sufs = g.suffixes;
                        for (let si = 0; si < sufs.length; ++si) {
                            const sb = sufs[si].suffix;
                            const sl = sb.length;
                            if (sufStart + sl > end) continue;
                            let sm = 0;
                            while (sm < sl && data[sufStart + sm] === sb[sm]) ++sm;
                            if (sm !== sl) continue;
                            const ol = preLen + c.len + sl;
                            if (ol > bestOutLen) {
                                bestOutLen = ol;
                                bestDictLen = c.len;
                                bestIdx = c.idx;
                                bestTransform = sufs[si].id;
                            }
                            break;
                        }
                    } else if (preLen === 0) {
                        // Partial body match - try OmitLastK with k = c.len - m.
                        // OL transforms all have prefix="" so they only
                        // apply to the empty-prefix group.
                        const k = c.len - m;
                        const olOpts = _olByK.get(k);
                        if (olOpts) {
                            const sufStart = hashStart + m;
                            for (let oi = 0; oi < olOpts.length; ++oi) {
                                const sb = olOpts[oi].suffix;
                                const sl = sb.length;
                                if (sufStart + sl > end) continue;
                                let sm = 0;
                                while (sm < sl && data[sufStart + sm] === sb[sm]) ++sm;
                                if (sm !== sl) continue;
                                const ol = m + sl;
                                if (ol > bestOutLen) {
                                    bestOutLen = ol;
                                    bestDictLen = c.len;
                                    bestIdx = c.idx;
                                    bestTransform = olOpts[oi].id;
                                }
                                break;  // longest suffix for this k
                            }
                        }
                    }
                }
            }

            // --- FermentFirst scan (ASCII + 2-byte + 3-byte UTF-8) ---
            // For each FF transform's prefix, check if data[pos..] begins
            // with the prefix followed by a "fermentable" first codepoint.
            // `_ferment` (RFC 7932 §8) modifies:
            //   - 1-byte ASCII a..z → A..Z (XOR 0x20 on byte 0)
            //   - 2-byte UTF-8 lead (C2..DF) → byte 1 ^= 0x20
            //   - 3-byte UTF-8 lead (E0..EF) → byte 2 ^= 0x05
            // We un-ferment the affected byte to recover the dict-side key,
            // then verify the first codepoint bytes exactly before walking
            // the rest of the body verbatim.
            const ffGroups = _ffTransformGroups;
            for (let gi = 0; gi < ffGroups.length; ++gi) {
                const g = ffGroups[gi];
                const pre = g.prefix;
                const preLen = pre.length;
                if (pos + preLen + 4 > end) continue;
                let mp = 0;
                while (mp < preLen && data[pos + mp] === pre[mp]) ++mp;
                if (mp !== preLen) continue;

                const hashStart = pos + preLen;
                const b0 = data[hashStart];
                const b1 = data[hashStart + 1];
                const b2 = data[hashStart + 2];
                const b3 = data[hashStart + 3];

                // Determine ferment class and compute un-fermented bytes 0..3.
                // u0..u3 = dict-side bytes that hash should match.
                let u0, u1, u2, u3;
                let cpLen;  // bytes verified exactly by hash key construction
                if (b0 >= 0x41 && b0 <= 0x5A) {
                    // ASCII uppercase → unferment byte 0 to lowercase
                    u0 = b0 | 0x20; u1 = b1; u2 = b2; u3 = b3;
                    cpLen = 1;
                } else if (b0 >= 0xC2 && b0 <= 0xDF) {
                    // 2-byte UTF-8 codepoint - unferment byte 1
                    u0 = b0; u1 = b1 ^ 0x20; u2 = b2; u3 = b3;
                    cpLen = 2;
                } else if (b0 >= 0xE0 && b0 <= 0xEF) {
                    // 3-byte UTF-8 codepoint - unferment byte 2 (XOR 0x05)
                    u0 = b0; u1 = b1; u2 = b2 ^ 0x05; u3 = b3;
                    cpLen = 3;
                } else {
                    continue;
                }

                const h = (u0 | (u1 << 8) | (u2 << 16) | (u3 << 24)) >>> 0;
                const bucket = dictHash.table.get(h);
                if (!bucket) continue;

                for (let i = 0; i < bucket.length; ++i) {
                    const c = bucket[i];
                    if (hashStart + c.len > end) continue;
                    // Verify the un-fermented codepoint bytes match the
                    // dict word's leading bytes. (The hash key has 32-bit
                    // collisions; this rules them out cheaply.)
                    if (words[c.off] !== u0) continue;
                    if (cpLen >= 2 && words[c.off + 1] !== u1) continue;
                    if (cpLen >= 3 && words[c.off + 2] !== u2) continue;
                    let m = 4;
                    while (m < c.len && data[hashStart + m] === words[c.off + m]) ++m;
                    if (m !== c.len) continue;

                    const sufStart = hashStart + c.len;
                    const sufs = g.suffixes;
                    for (let si = 0; si < sufs.length; ++si) {
                        const sb = sufs[si].suffix;
                        const sl = sb.length;
                        if (sufStart + sl > end) continue;
                        let sm = 0;
                        while (sm < sl && data[sufStart + sm] === sb[sm]) ++sm;
                        if (sm !== sl) continue;
                        const ol = preLen + c.len + sl;
                        if (ol > bestOutLen) {
                            bestOutLen = ol;
                            bestDictLen = c.len;
                            bestIdx = c.idx;
                            bestTransform = sufs[si].id;
                        }
                        break;
                    }
                }
            }

            // --- FermentAll scan (full UTF-8 support) ---
            // Under FA (RFC 7932 §8 / RFC 9841 §3.1.1), each codepoint's
            // LAST byte is fermented in the output:
            //   - 1-byte ASCII a..z → A..Z (byte XOR 0x20)
            //   - 2-byte codepoint: lead unchanged, continuation XOR 0x20
            //   - 3-byte codepoint: leads unchanged, last byte XOR 0x05
            //
            // Lead bytes (high bits 0xxx / 110x / 1110) are themselves
            // preserved by ferment, so the codepoint boundary structure
            // of the FA output matches the dict word's. We use that to
            // walk input bytes 0..3 and compute un-fermented values
            // (= dict bytes) for the hash key, then verify the body by
            // walking dict codepoints and applying the same rule.
            const faGroups = _faTransformGroups;
            for (let gi = 0; gi < faGroups.length; ++gi) {
                const g = faGroups[gi];
                const pre = g.prefix;
                const preLen = pre.length;
                if (pos + preLen + 4 > end) continue;
                let mp = 0;
                while (mp < preLen && data[pos + mp] === pre[mp]) ++mp;
                if (mp !== preLen) continue;

                const hashStart = pos + preLen;

                // Walk input bytes 0..3 detecting codepoint boundaries
                // from UTF-8 lead bit patterns. Build un-fermented bytes
                // u[0..3]. Reject if structure is invalid, if any byte is
                // [a-z] (impossible under FA), or if no byte was fermented
                // (Identity-equivalent → covered by Identity scan with a
                // smaller transform id).
                const u0a = data[hashStart];
                const u1a = data[hashStart + 1];
                const u2a = data[hashStart + 2];
                const u3a = data[hashStart + 3];
                let u0, u1, u2, u3;
                let validCp = true;
                let hasFermented = false;

                // Codepoint 1 starting at byte 0
                let i = 0;
                if (u0a < 0x80) {
                    if (u0a >= 0x61 && u0a <= 0x7A) { validCp = false; }
                    else if (u0a >= 0x41 && u0a <= 0x5A) { u0 = u0a | 0x20; hasFermented = true; i = 1; }
                    else { u0 = u0a; i = 1; }
                } else if (u0a >= 0xC2 && u0a <= 0xDF) {
                    u0 = u0a;
                    u1 = u1a ^ 0x20; hasFermented = true; i = 2;
                } else if (u0a >= 0xE0 && u0a <= 0xEF) {
                    u0 = u0a; u1 = u1a;
                    u2 = u2a ^ 0x05; hasFermented = true; i = 3;
                } else {
                    validCp = false;
                }
                // Codepoint 2 if room
                if (validCp && i < 4) {
                    const b = i === 1 ? u1a : (i === 2 ? u2a : u3a);
                    if (b < 0x80) {
                        if (b >= 0x61 && b <= 0x7A) validCp = false;
                        else if (b >= 0x41 && b <= 0x5A) {
                            if (i === 1) { u1 = b | 0x20; } else if (i === 2) { u2 = b | 0x20; } else { u3 = b | 0x20; }
                            hasFermented = true; i += 1;
                        } else {
                            if (i === 1) { u1 = b; } else if (i === 2) { u2 = b; } else { u3 = b; }
                            i += 1;
                        }
                    } else if (b >= 0xC2 && b <= 0xDF) {
                        if (i + 2 > 4) {
                            // 2-byte codepoint straddles hash boundary -
                            // lead is the last byte of the window.
                            if (i === 3) { u3 = b; }
                            i = 4;
                        } else {
                            const nb = i === 1 ? u2a : u3a;
                            if (i === 1) { u1 = b; u2 = nb ^ 0x20; }
                            else { u2 = b; u3 = nb ^ 0x20; }
                            hasFermented = true; i += 2;
                        }
                    } else if (b >= 0xE0 && b <= 0xEF) {
                        if (i + 3 > 4) {
                            if (i === 1) { u1 = b; u2 = u2a; }
                            else if (i === 2) { u2 = b; u3 = u3a; }
                            else { u3 = b; }
                            i = 4;
                        } else {
                            // i must be 1 (3-byte cp starting at 1 → bytes 1,2,3)
                            u1 = b; u2 = u2a; u3 = u3a ^ 0x05;
                            hasFermented = true; i = 4;
                        }
                    } else {
                        validCp = false;
                    }
                }
                // Codepoint 3 if room
                if (validCp && i < 4) {
                    const b = i === 2 ? u2a : u3a;
                    if (b < 0x80) {
                        if (b >= 0x61 && b <= 0x7A) validCp = false;
                        else if (b >= 0x41 && b <= 0x5A) {
                            if (i === 2) { u2 = b | 0x20; } else { u3 = b | 0x20; }
                            hasFermented = true; i += 1;
                        } else {
                            if (i === 2) { u2 = b; } else { u3 = b; }
                            i += 1;
                        }
                    } else if (b >= 0xC2 && b <= 0xDF) {
                        if (i + 2 > 4) {
                            if (i === 3) { u3 = b; }
                            i = 4;
                        } else {
                            // i must be 2 (2-byte cp starting at 2 → bytes 2,3)
                            u2 = b; u3 = u3a ^ 0x20;
                            hasFermented = true; i = 4;
                        }
                    } else {
                        validCp = false;
                    }
                }
                // Codepoint 4 (single ASCII at byte 3)
                if (validCp && i < 4) {
                    const b = u3a;
                    if (b < 0x80) {
                        if (b >= 0x61 && b <= 0x7A) validCp = false;
                        else if (b >= 0x41 && b <= 0x5A) { u3 = b | 0x20; hasFermented = true; }
                        else { u3 = b; }
                    } else {
                        validCp = false;
                    }
                }

                if (!validCp || !hasFermented) continue;

                const h = (u0 | (u1 << 8) | (u2 << 16) | (u3 << 24)) >>> 0;
                const bucket = dictHash.table.get(h);
                if (!bucket) continue;

                for (let bi = 0; bi < bucket.length; ++bi) {
                    const c = bucket[bi];
                    if (hashStart + c.len > end) continue;
                    // Body verification: walk dict codepoints from offset
                    // 0, applying ferment per codepoint position.
                    let m = 0;
                    let ok = true;
                    while (m < c.len) {
                        const w0 = words[c.off + m];
                        const cpKind = w0 < 0x80 ? 1 : (w0 < 0xE0 ? 2 : 3);
                        if (m + cpKind > c.len) {
                            // Truncated codepoint at word end - compare
                            // remaining bytes verbatim.
                            while (m < c.len) {
                                if (data[hashStart + m] !== words[c.off + m]) { ok = false; break; }
                                ++m;
                            }
                            break;
                        }
                        if (cpKind === 1) {
                            const expected = (w0 >= 0x61 && w0 <= 0x7A) ? (w0 ^ 0x20) : w0;
                            if (data[hashStart + m] !== expected) { ok = false; break; }
                            m += 1;
                        } else if (cpKind === 2) {
                            if (data[hashStart + m] !== w0) { ok = false; break; }
                            const w1 = words[c.off + m + 1];
                            if (data[hashStart + m + 1] !== (w1 ^ 0x20)) { ok = false; break; }
                            m += 2;
                        } else {
                            if (data[hashStart + m] !== w0) { ok = false; break; }
                            if (data[hashStart + m + 1] !== words[c.off + m + 1]) { ok = false; break; }
                            const w2 = words[c.off + m + 2];
                            if (data[hashStart + m + 2] !== (w2 ^ 0x05)) { ok = false; break; }
                            m += 3;
                        }
                    }
                    if (!ok) continue;

                    const sufStart = hashStart + c.len;
                    const sufs = g.suffixes;
                    for (let si = 0; si < sufs.length; ++si) {
                        const sb = sufs[si].suffix;
                        const sl = sb.length;
                        if (sufStart + sl > end) continue;
                        let sm = 0;
                        while (sm < sl && data[sufStart + sm] === sb[sm]) ++sm;
                        if (sm !== sl) continue;
                        const ol = preLen + c.len + sl;
                        if (ol > bestOutLen) {
                            bestOutLen = ol;
                            bestDictLen = c.len;
                            bestIdx = c.idx;
                            bestTransform = sufs[si].id;
                        }
                        break;
                    }
                }
            }

            // --- OmitFirstK scan ---
            // OF transforms have empty prefix and empty suffix (per RFC
            // 7932 §8). Output = words[c.off+k..c.off+c.len]. We hash on
            // data[pos..pos+3] which corresponds to bytes [k..k+3] of the
            // candidate dict word, then verify the remaining bytes.
            if (pos + 4 <= end && dictHash.ofTables) {
                const h = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
                for (let ki = 0; ki < _OF_K_VALUES.length; ++ki) {
                    const k = _OF_K_VALUES[ki];
                    const ofTable = dictHash.ofTables[k];
                    if (!ofTable) continue;
                    const bucket = ofTable.get(h);
                    if (!bucket) continue;
                    const ofTid = _OF_TID_BY_K.get(k);
                    for (let i = 0; i < bucket.length; ++i) {
                        const c = bucket[i];
                        const bodyLen = c.len - k;
                        if (pos + bodyLen > end) continue;
                        // First 4 bytes guaranteed by hash; verify rest.
                        let m = 4;
                        while (m < bodyLen && data[pos + m] === words[c.off + k + m]) ++m;
                        if (m !== bodyLen) continue;
                        if (bodyLen > bestOutLen) {
                            bestOutLen = bodyLen;
                            bestDictLen = c.len;
                            bestIdx = c.idx;
                            bestTransform = ofTid;
                        }
                    }
                }
            }

            return bestOutLen >= minLen
                ? { outputLen: bestOutLen, dictLen: bestDictLen, idx: bestIdx, transformId: bestTransform }
                : null;
        }

        // Walk the LZ77-produced commands and split literal runs whenever
        // a long-enough static-dict match is found. Replaces "N literals
        // then a copy" with "K literals + dict-ref-copy", followed by the
        // remainder. Threshold of 6 bytes is empirical - shorter matches
        // typically don't beat Huffman-coded literals once IAC + distance
        // overhead is paid.
        // Augment LZ77 commands with static-dict references. The match
        // finder is either:
        //   - the built-in RFC 7932 Appendix A/B scan (`_findStaticDictMatchAt`,
        //     used when no `_ext.findCustomDictMatch` hook is set), or
        //   - a custom-dict scan supplied by `brotli_shared` via the
        //     `_ext.findCustomDictMatch(data, pos, end, minLen) =>
        //      { outputLen, dictLen, wordId } | null` hook (RFC 9841 §3.1).
        //
        // The distance emitted accounts for both the LZ77 shared-dict
        // prefix length L (RFC 9841 §3.2) and the word_id : the decoder
        // recovers `wordId = distance − maxAllowed − 1 − L`.
        function _augmentWithStaticDictRefs(commands, data, dictHash, windowSize, customMatchFinder, lz77PrefixLen) {
            const augmented = [];
            let outPos = 0;
            const MIN_DICT_MATCH = 6;
            const L = lz77PrefixLen | 0;

            for (let ci = 0; ci < commands.length; ++ci) {
                const cmd = commands[ci];
                const litEnd = cmd.insertStart + cmd.insertLen;
                let litStart = cmd.insertStart;
                let pos = litStart;

                while (pos < litEnd) {
                    let m, wordId, dictWordOff;
                    if (customMatchFinder) {
                        m = customMatchFinder(data, pos, litEnd, MIN_DICT_MATCH);
                        if (!m) { pos++; continue; }
                        wordId = m.wordId;
                        dictWordOff = null;  // custom-dict words aren't in the built-in blob
                    } else {
                        m = _findStaticDictMatchAt(data, pos, litEnd, dictHash, MIN_DICT_MATCH);
                        if (!m) { pos++; continue; }
                        wordId = m.transformId * brotliDict.NWORDS(m.dictLen) + m.idx;
                        dictWordOff = brotliDict.DOFFSET(m.dictLen) + m.dictLen * m.idx;
                    }

                    // distance = maxAllowed + 1 + L + word_id (RFC 9841 §3.1 / §3.2)
                    const outAtDictRef = outPos + (pos - litStart);
                    const maxAllowed = outAtDictRef < windowSize ? outAtDictRef : windowSize;
                    const dictDistance = maxAllowed + 1 + L + wordId;
                    if (!_distanceCodeFor(dictDistance, 0, 0)) {
                        pos++;
                        continue;
                    }

                    augmented.push({
                        insertStart: litStart,
                        insertLen: pos - litStart,
                        copyLen: m.dictLen,            // CLEN = dict word length
                        distance: dictDistance,
                        isDictRef: true,
                        dictOutputLen: m.outputLen,    // bytes actually emitted
                        dictWordOff,
                    });
                    outPos = outAtDictRef + m.outputLen;
                    pos += m.outputLen;
                    litStart = pos;
                }

                // Tail: remaining literals + the command's original (LZ77) copy.
                // When dict refs consumed every literal of a copy-less command
                // (the stream's final literal run), the tail is empty: emitting
                // it would put a dangling IAC symbol after MLEN is reached,
                // which no decoder reads (non-zero fill bits / node rejects).
                if (litEnd === litStart && cmd.copyLen === 0) continue;
                augmented.push({
                    insertStart: litStart,
                    insertLen: litEnd - litStart,
                    copyLen: cmd.copyLen,
                    distance: cmd.distance,
                    isDictRef: false,
                });
                outPos += (litEnd - litStart) + cmd.copyLen;
            }

            return augmented;
        }

        // Pick the best (NPOSTFIX, NDIRECT_HI) for the distance
        // distribution of `cmds` (RFC 7932 §4). We score a small set of
        // candidate configs by estimating total distance bits under each:
        //
        //   bits = sum over symbols of (count * -log2(count/total))
        //                 [Huffman ≈ entropy lower bound]
        //        + sum of extra bits per command
        //        + alphabet header overhead estimate (~5 * distAlphabet)
        //
        // Candidates cover the common useful settings: (0,0) default,
        // (0,4)/(0,8)/(0,12) for streams with many short repeats, and
        // (1,0)/(2,0) for finer granularity at large distances.
        const _DIST_PARAM_CANDIDATES = [
            { npostfix: 0, ndirectHi: 0  },  // default - 64 symbols
            { npostfix: 0, ndirectHi: 4  },  // NDIRECT=4 - 68 symbols
            { npostfix: 0, ndirectHi: 8  },  // NDIRECT=8 - 72 symbols
            { npostfix: 0, ndirectHi: 12 },  // NDIRECT=12 - 76 symbols
            { npostfix: 1, ndirectHi: 0  },  // 112 symbols, finer high range
            { npostfix: 2, ndirectHi: 0  },  // 208 symbols
            { npostfix: 3, ndirectHi: 0  },  // 400 symbols
        ];

        // Encode a block count into (sym, extra, extraBits) under the
        // 26-symbol block-count alphabet (RFC 7932 §6). Inverse of
        // `_readBlockCount`.
        function _blockCountCodeFor(count) {
            for (let s = 0; s < 26; ++s) {
                const base = _BLOCK_COUNT_BASE[s];
                const extraBits = _BLOCK_COUNT_EXTRA[s];
                const max = base + (1 << extraBits) - 1;
                if (count >= base && count <= max) {
                    return { sym: s, extra: count - base, extraBits };
                }
            }
            return null;
        }

        // Decide whether to split the literal channel into 2 block types
        // (RFC 7932 §6). Returns `{ splitBytePos }` or `null`.
        //
        // Heuristic: compute the KL divergence between byte distributions
        // of the first and second halves of the input. If they differ
        // measurably AND the input is long enough that the header
        // overhead (extra trees + CMAPL + block-length codes ~= 1-2 KiB)
        // is amortised, recommend a midpoint split.
        function _pickLitBlockSplit(data, quality) {
            if (data.length < 32768) return null;
            if (quality < 6) return null;
            const half = data.length >> 1;
            const freqA = new Int32Array(256);
            const freqB = new Int32Array(256);
            for (let i = 0; i < half; ++i) ++freqA[data[i]];
            for (let i = half; i < data.length; ++i) ++freqB[data[i]];
            const totalA = half;
            const totalB = data.length - half;
            // KL(B || A) - smoothing avoids log(0).
            const epsA = 1 / (totalA + 256);
            let kl = 0;
            for (let s = 0; s < 256; ++s) {
                if (freqB[s] === 0) continue;
                const pA = freqA[s] / totalA || epsA;
                const pB = freqB[s] / totalB;
                kl += pB * Math.log2(pB / pA);
            }
            return kl > 0.3 ? { splitBytePos: half } : null;
        }

        function _pickDistParams(cmds) {
            // Collect distances from commands (skip insert-only & special).
            const distances = [];
            for (let i = 0; i < cmds.length; ++i) {
                const c = cmds[i];
                if (c.copyLen > 0 && c.distance > 0) distances.push(c.distance);
            }
            if (distances.length === 0) {
                return { npostfix: 0, ndirect: 0, distAlphabet: 64 };
            }

            let bestScore = Infinity;
            let bestNpost = 0, bestNdir = 0, bestAlpha = 64;
            for (const cand of _DIST_PARAM_CANDIDATES) {
                const np = cand.npostfix;
                const nd = cand.ndirectHi << np;
                const alpha = 16 + nd + (48 << np);
                if (alpha > 520) continue;  // distAlphabet hard cap
                // Tabulate per-symbol counts + sum of extra bits.
                const cnt = new Int32Array(alpha);
                let extraBitsSum = 0;
                let valid = true;
                for (const d of distances) {
                    const enc = _distanceCodeFor(d, np, nd);
                    if (!enc || enc.dsym >= alpha) { valid = false; break; }
                    ++cnt[enc.dsym];
                    extraBitsSum += enc.extraBits;
                }
                if (!valid) continue;
                // Entropy in bits + extras + alphabet overhead.
                const total = distances.length;
                let entropyBits = 0;
                const logTotal = Math.log2(total);
                for (let s = 0; s < alpha; ++s) {
                    const c = cnt[s];
                    if (c > 0) entropyBits += c * (logTotal - Math.log2(c));
                }
                const headerOverheadBits = alpha * 5;  // crude estimate
                const score = entropyBits + extraBitsSum + headerOverheadBits;
                if (score < bestScore) {
                    bestScore = score;
                    bestNpost = np;
                    bestNdir = nd;
                    bestAlpha = alpha;
                }
            }
            return { npostfix: bestNpost, ndirect: bestNdir, distAlphabet: bestAlpha };
        }

        function _encodeCompressed(data, opts) {
            const len = data.length;
            const ntreesL = _NTREESL_OPT;

            // Stream WBITS - by default we declare 22, matching the LZ77
            // engine's `windowBits: 21` (max distance 2²¹ ≤ 2²² − 16). With
            // `_ext.windowBits`, callers (typically `brotli_shared`) can
            // request a different value; combined with `_ext.largeWindow`
            // (RFC 9841 §6) values up to 62 become legal.
            const _ext = (opts && opts._ext) || null;
            const largeWindow = !!(_ext && _ext.largeWindow);
            const wbits = (_ext && _ext.windowBits) || 22;
            if (!largeWindow && (wbits < 10 || wbits > 24)) {
                _err('EBADARG', 'wbits ' + wbits + ' out of RFC 7932 range [10, 24]');
            }
            if (largeWindow && (wbits < 10 || wbits > 50)) {
                _err('EBADARG', 'large window wbits ' + wbits + ' out of supported [10, 50]');
            }
            const windowSize = wbits >= 31
                ? Math.pow(2, wbits) - 16
                : (1 << wbits) - 16;

            // Pick best CMODE for this input (RFC 7932 §7.1). The same
            // CMODE drives both the frequency-collection pass and the
            // bit-writing pass; we emit it in the meta-block header.
            const cmode = _pickCMode(data);

            // Extension hook: `opts._ext.lz77Prefix` (Uint8Array) is a
            // virtual prefix to the input, used so that LZ77 can find
            // matches into a shared dictionary. The decoder side (when
            // also passed an `_ext.lz77Dict` matching this prefix)
            // resolves distances `pos - dist < L` via §3.2's dict-address
            // formula. brotli.js itself does not validate or interpret
            // this beyond the prepending - `brotli_shared` owns the
            // user-facing `sharedDictionary` option.
            //
            // Constraint: works only when `outPos ≤ windowSize` at emit;
            // inputs > windowSize bypass the compressed path so this holds.
            const ext = (opts && opts._ext) || null;
            let lz77Prefix = (ext && ext.lz77Prefix) || null;
            if (lz77Prefix && !(lz77Prefix instanceof u8)) {
                _err('EBADARG', '_ext.lz77Prefix must be Uint8Array');
            }
            if (lz77Prefix && lz77Prefix.length + data.length > windowSize) {
                lz77Prefix = null;
            }
            const prefixLen = lz77Prefix ? lz77Prefix.length : 0;
            let inputBuf = data;
            if (prefixLen > 0) {
                inputBuf = new u8(prefixLen + data.length);
                inputBuf.set(lz77Prefix, 0);
                inputBuf.set(data, prefixLen);
            }

            // --- 1. LZ77 commands --------------------------------------
            const commands = [];
            let insertStart = 0;
            let insertLen = 0;

            // Quality-driven LZ77 tuning (RFC 7932 §10 informative). The
            // mapping balances speed vs ratio: low quality = shallow chain,
            // no lazy match; high quality = deep chain, lazy enabled.
            // q=0 is handled by `_encodeUncompressed` (never reaches here).
            const quality = (opts && opts.quality != null) ? opts.quality : 6;
            const qParams =
                quality <= 1 ? { chainDepth: 2,  lazy: false } :
                quality <= 3 ? { chainDepth: 4,  lazy: false } :
                quality <= 5 ? { chainDepth: 6,  lazy: true  } :
                quality <= 7 ? { chainDepth: 10, lazy: true  } :
                quality <= 9 ? { chainDepth: 16, lazy: true  } :
                               { chainDepth: 32, lazy: true  };
            lz77.encode(inputBuf, { windowBits: 21, minMatch: 4, ...qParams }, {
                literal(pos) {
                    if (pos < prefixLen) return;  // dict prefix, not output
                    const dpos = pos - prefixLen;
                    if (insertLen === 0) insertStart = dpos;
                    insertLen++;
                },
                match(pos, mlen, dist) {
                    if (pos < prefixLen) return;  // match fully inside dict, not output
                    while (insertLen > 22593) {
                        commands.push({ insertStart, insertLen: 22593, copyLen: 2, distance: 1 });
                        insertStart += 22593;
                        insertLen -= 22593;
                    }
                    commands.push({ insertStart, insertLen, copyLen: mlen, distance: dist });
                    insertStart = 0;
                    insertLen = 0;
                },
            });
            if (insertLen > 0) {
                commands.push({ insertStart, insertLen, copyLen: 0, distance: 0 });
            }
            if (commands.length === 0) {
                commands.push({ insertStart: 0, insertLen: 0, copyLen: 0, distance: 0 });
            }

            // --- 1b. Augment with static-dict references.
            // Priority: custom-dict hook (RFC 9841 §3.1) over built-in
            // RFC 7932 dict. When neither is usable, leave commands as-is.
            const customMatchFinder = _ext && _ext.findCustomDictMatch;
            const dictHash = customMatchFinder ? null : _getStaticDictHash();
            const cmds = (customMatchFinder || dictHash)
                ? _augmentWithStaticDictRefs(commands, data, dictHash, windowSize, customMatchFinder, prefixLen)
                : commands;

            // --- 1c. Pick distance encoding params (NPOSTFIX, NDIRECT)
            //        based on the actual distance distribution.
            const distParams = _pickDistParams(cmds);
            const npostfix = distParams.npostfix;
            const ndirect = distParams.ndirect;
            const distAlphabet = distParams.distAlphabet;

            // --- 1d. Decide whether to split literals into 2 block types
            //        (RFC 7932 §6). Activated when:
            //          - input is long enough that header overhead amortises;
            //          - the two halves have measurably different byte
            //            distributions (KL divergence > threshold).
            //
            //        When `splitLiteral` is non-null the literal channel is
            //        encoded with NBLTYPES_L = 2 + NTREESL = 8 (4 trees per
            //        block), with a single block-switch at byte position
            //        `splitLiteral.splitBytePos`.
            const splitLiteral = _pickLitBlockSplit(data, quality);
            const useSplit = !!splitLiteral;
            const ntreesLActual = useSplit ? 8 : ntreesL;

            // --- 2. Resolve commands; compute IAC + distance frequencies.
            //        For literals, ALSO compute the per-tree frequencies
            //        by tracking p1, p2 across literals and matches.
            const litFreqPerTree = new Array(ntreesLActual);
            for (let t = 0; t < ntreesLActual; ++t) litFreqPerTree[t] = new Int32Array(256);
            const iacFreq  = new Int32Array(704);
            const distFreq = new Int32Array(distAlphabet);
            const cmdAux   = new Array(cmds.length);

            let outPos = 0, p1 = 0, p2 = 0;
            const splitBytePos = useSplit ? splitLiteral.splitBytePos : -1;
            // Block-switch wire format counts LITERALS, not output bytes.
            // We tally per-block literal counts during freq collection.
            let litCountBlock0 = 0;
            let litCountBlock1 = 0;

            for (let ci = 0; ci < cmds.length; ++ci) {
                const c = cmds[ci];
                // Literals - frequencies AND state update
                for (let k = 0; k < c.insertLen; ++k) {
                    const byte = data[c.insertStart + k];
                    const ctxId = _contextIdLit(cmode, p1, p2);
                    const baseTree = _clusterContext(ctxId);
                    const inBlock1 = useSplit && outPos >= splitBytePos;
                    const treeId = inBlock1 ? 4 + baseTree : baseTree;
                    ++litFreqPerTree[treeId][byte];
                    if (useSplit) {
                        if (inBlock1) ++litCountBlock1;
                        else ++litCountBlock0;
                    }
                    p2 = p1; p1 = byte;
                    ++outPos;
                }

                // IAC + distance resolution
                const isLastNoCopy = c.copyLen === 0;
                const effCopyLen = isLastNoCopy ? 2 : c.copyLen;
                const ic = _insertCodeFor(c.insertLen);
                const cc = _copyCodeFor(effCopyLen);
                if (!ic || !cc) _err('EINTERNAL', 'cannot encode I=' + c.insertLen + ' C=' + effCopyLen);

                const iacSym = _findIacSym(ic.code, cc.code, false);
                if (iacSym < 0) _err('EINTERNAL', 'no IAC sym for I=' + ic.code + ' C=' + cc.code);
                ++iacFreq[iacSym];

                let distEnc = null;
                if (!isLastNoCopy) {
                    distEnc = _distanceCodeFor(c.distance, npostfix, ndirect);
                    if (!distEnc || distEnc.dsym >= distAlphabet) {
                        _err('EINTERNAL', 'distance ' + c.distance + ' outside alphabet');
                    }
                    ++distFreq[distEnc.dsym];

                    // Advance p1, p2 across the copy.
                    // - Static dict ref: copied bytes = data[inputPos + k]
                    //   (the dict word matches `data` at that position,
                    //   so reading `data` is equivalent and avoids
                    //   needing the brotli dict here).
                    // - Backward ref / LZ77 dict ref: byte at virtual
                    //   source position `outPos - distance`. Negative
                    //   indices reach into the LZ77 shared dictionary.
                    // @ts-ignore - isDictRef/dictOutputLen are present when isDictRef===true; TS cannot narrow union from this field
                    if (c.isDictRef) {
                        const inputPos = c.insertStart + c.insertLen;
                        // @ts-ignore - isDictRef/dictOutputLen are present when isDictRef===true; TS cannot narrow union from this field
                        const outLen = c.dictOutputLen != null ? c.dictOutputLen : c.copyLen;
                        for (let k = 0; k < outLen; ++k) {
                            const byte = data[inputPos + k];
                            p2 = p1; p1 = byte;
                            ++outPos;
                        }
                    } else {
                        for (let k = 0; k < c.copyLen; ++k) {
                            const srcPos = outPos - c.distance;
                            const byte = srcPos >= 0 ? data[srcPos] : lz77Prefix[prefixLen + srcPos];
                            p2 = p1; p1 = byte;
                            ++outPos;
                        }
                    }
                }
                cmdAux[ci] = { ic, cc, iacSym, distEnc };
            }

            // Validity check: a split with empty block 0 or block 1 is
            // not encodable (block-length must be ≥ 1). Edge case where
            // a copy spans the split byte position with no literals in
            // one of the halves. Fall back to single-block: merge block-1
            // tree frequencies into block-0 trees, repurpose just the
            // first 4 trees.
            let useSplitFinal = useSplit;
            if (useSplit && (litCountBlock0 === 0 || litCountBlock1 === 0)) {
                for (let t = 0; t < 4; ++t) {
                    const src = litFreqPerTree[4 + t];
                    const dst = litFreqPerTree[t];
                    for (let s = 0; s < 256; ++s) dst[s] += src[s];
                }
                useSplitFinal = false;
            }
            const nbltypesLFinal = useSplitFinal ? 2 : 1;
            const ntreesLFinal = useSplitFinal ? 8 : 4;

            // Pad to dodge single-symbol-target edge case in each alphabet.
            for (let t = 0; t < ntreesLFinal; ++t) _padFreqs(litFreqPerTree[t]);
            _padFreqs(iacFreq);
            _padFreqs(distFreq);

            // --- 3. Canonical Huffman --------------------------------
            const litTrees = new Array(ntreesLFinal);
            const litLensArr = new Array(ntreesLFinal);
            const litMapArr = new Array(ntreesLFinal);
            for (let t = 0; t < ntreesLFinal; ++t) {
                const tr = huffman.buildTree(litFreqPerTree[t], 15);
                litTrees[t] = tr;
                litLensArr[t] = _padTo(tr.t, 256);
                litMapArr[t]  = huffman.buildMap(litLensArr[t], Math.max(tr.l, 1), 0);
            }
            const iacTree  = huffman.buildTree(iacFreq,  15);
            const distTree = huffman.buildTree(distFreq, 15);

            const iacLens  = _padTo(iacTree.t, 704);
            const distLens = _padTo(distTree.t, distAlphabet);
            const iacMap   = huffman.buildMap(iacLens,  Math.max(iacTree.l,  1), 0);
            const distMap  = huffman.buildMap(distLens, Math.max(distTree.l, 1), 0);

            // --- 4. CMAPL - 64 entries per block type.
            //   - Single block: cmapL[i] = cluster(i)
            //   - Split: cmapL[i] = cluster(i % 64) for i ∈ [0,64);
            //            cmapL[i] = 4 + cluster(i % 64) for i ∈ [64,128)
            //   so block 0 uses trees 0..3 and block 1 uses 4..7.
            const cmapLSize = 64 * nbltypesLFinal;
            const cmapL = new u8(cmapLSize);
            for (let i = 0; i < 64; ++i) {
                const cl = _clusterContext(i);
                cmapL[i] = cl;
                if (useSplitFinal) cmapL[64 + i] = 4 + cl;
            }

            // --- 5. Emit ----------------------------------------------
            const w = _makeWriter(len + 256);

            // Stream + meta-block headers
            _emitWBITS(w, wbits, largeWindow);  // RFC 7932 §9.1 / RFC 9841 §6
            w.bits(1, 1);                       // ISLAST = 1
            w.bits(1, 0);                       // ISLASTEMPTY = 0
            // MNIBBLES & MLEN
            let mnibbles, mnibblesCode;
            if (len <= 65536)        { mnibbles = 4; mnibblesCode = 0; }
            else if (len <= 1048576) { mnibbles = 5; mnibblesCode = 1; }
            else                     { mnibbles = 6; mnibblesCode = 2; }
            w.bits(2, mnibblesCode);
            if (mnibbles <= 4) {
                w.bits(mnibbles * 4, (len - 1) & 0xFFFF);
            } else if (mnibbles === 5) {
                w.bits(20, (len - 1) & 0xFFFFF);
            } else {
                w.bits(24, (len - 1) & 0xFFFFFF);
            }

            // Compressed meta-block header.
            // NBLTYPES_L: 1 (no split) or 2 (with literal block split).
            // The decoder reads block-type / block-length Huffman trees
            // only when NBLTYPES >= 2.
            let blTypeMap = null, blTypeLens = null, blLenMap = null, blLenLens = null;
            let blcL1 = null;
            const splitL0 = useSplitFinal ? litCountBlock0 : 0;
            if (useSplitFinal) {
                _emitVarLenCount(w, 2);  // NBLTYPESL = 2
                // Block-type Huffman over alphabet 4. We only ever emit
                // sym=1 (toggle to next block type), but use a 2-symbol
                // tree {0:1bit, 1:1bit} to avoid the single-symbol decoder
                // corner case at encode time.
                const blTypeFreq = new Int32Array(4);
                blTypeFreq[0] = 1;
                blTypeFreq[1] = 1;
                const blTypeTree = huffman.buildTree(blTypeFreq, 15);
                blTypeLens = _padTo(blTypeTree.t, 4);
                blTypeMap = huffman.buildMap(blTypeLens, Math.max(blTypeTree.l, 1), 0);
                _emitPrefixCodeDescriptor(w, blTypeLens);
                // Block-length Huffman over alphabet 26. Frequencies seeded
                // by the two block lengths (in LITERAL counts, not bytes).
                const blcL0 = _blockCountCodeFor(litCountBlock0);
                blcL1 = _blockCountCodeFor(litCountBlock1);
                if (!blcL0 || !blcL1) _err('EINTERNAL', 'block-length out of range');
                const blLenFreq = new Int32Array(26);
                ++blLenFreq[blcL0.sym];
                ++blLenFreq[blcL1.sym];
                _padFreqs(blLenFreq);
                const blLenTree = huffman.buildTree(blLenFreq, 15);
                blLenLens = _padTo(blLenTree.t, 26);
                blLenMap = huffman.buildMap(blLenLens, Math.max(blLenTree.l, 1), 0);
                _emitPrefixCodeDescriptor(w, blLenLens);
                // Initial block length L0
                w.bits(blLenLens[blcL0.sym], blLenMap[blcL0.sym]);
                if (blcL0.extraBits > 0) w.bits(blcL0.extraBits, blcL0.extra);
            } else {
                w.bits(1, 0);        // NBLTYPESL = 1
            }
            w.bits(1, 0);            // NBLTYPESI = 1
            w.bits(1, 0);            // NBLTYPESD = 1
            w.bits(2, npostfix);     // NPOSTFIX (RFC 7932 §4)
            w.bits(4, ndirect >> npostfix);  // NDIRECT_HI (NDIRECT = HI << NPOSTFIX)
            // CMODE - one per literal block type
            w.bits(2, cmode);
            if (useSplitFinal) w.bits(2, cmode);  // same global cmode for block 1
            // NTREESL via var-len code
            _emitVarLenCount(w, ntreesLFinal);
            // CMAPL - for the split case, 128 entries mapping (btype, cidL)
            // pairs to one of 8 trees (4 per block).
            _emitContextMap(w, cmapL, ntreesLFinal);
            // NTREESD = 1
            w.bits(1, 0);

            // Prefix-code descriptors: NTREESL literal trees, then IAC, then distance.
            for (let t = 0; t < ntreesLFinal; ++t) {
                _emitPrefixCodeDescriptor(w, litLensArr[t]);
            }
            _emitPrefixCodeDescriptor(w, iacLens);
            _emitPrefixCodeDescriptor(w, distLens);

            // Commands - re-track p1, p2 to mirror frequency-collection pass.
            outPos = 0; p1 = 0; p2 = 0;
            let splitEmitted = false;
            // Track literal count for block-switch trigger (the wire
            // format counts LITERALS, not output bytes).
            let litCount = 0;

            for (let ci = 0; ci < cmds.length; ++ci) {
                const c = cmds[ci];
                const aux = cmdAux[ci];
                w.bits(iacLens[aux.iacSym], iacMap[aux.iacSym]);
                if (aux.ic.extraBits > 0) w.bits(aux.ic.extraBits, aux.ic.extra);
                if (aux.cc.extraBits > 0) w.bits(aux.cc.extraBits, aux.cc.extra);
                for (let k = 0; k < c.insertLen; ++k) {
                    // Block-switch trigger fires when `litCount === L0`
                    // just before emitting the (L0+1)-th literal - mirrors
                    // the decoder's `if (blenL === 0)` check.
                    if (useSplitFinal && !splitEmitted && litCount === splitL0) {
                        // Block-switch: block-type symbol (sym=1 toggles
                        // to next block type) + block-length L1.
                        w.bits(blTypeLens[1], blTypeMap[1]);
                        w.bits(blLenLens[blcL1.sym], blLenMap[blcL1.sym]);
                        if (blcL1.extraBits > 0) w.bits(blcL1.extraBits, blcL1.extra);
                        splitEmitted = true;
                    }
                    const byte = data[c.insertStart + k];
                    const ctxId = _contextIdLit(cmode, p1, p2);
                    const baseTree = _clusterContext(ctxId);
                    const treeId = (useSplitFinal && litCount >= splitL0)
                        ? 4 + baseTree
                        : baseTree;
                    w.bits(litLensArr[treeId][byte], litMapArr[treeId][byte]);
                    ++litCount;
                    p2 = p1; p1 = byte;
                    ++outPos;
                }
                if (aux.distEnc) {
                    w.bits(distLens[aux.distEnc.dsym], distMap[aux.distEnc.dsym]);
                    if (aux.distEnc.extraBits > 0) w.bits(aux.distEnc.extraBits, aux.distEnc.extra);
                    // @ts-ignore - isDictRef/dictOutputLen are present when isDictRef===true; TS cannot narrow union from this field
                    if (c.isDictRef) {
                        const inputPos = c.insertStart + c.insertLen;
                        // @ts-ignore - isDictRef/dictOutputLen are present when isDictRef===true; TS cannot narrow union from this field
                        const outLen = c.dictOutputLen != null ? c.dictOutputLen : c.copyLen;
                        for (let k = 0; k < outLen; ++k) {
                            const byte = data[inputPos + k];
                            p2 = p1; p1 = byte;
                            ++outPos;
                        }
                    } else {
                        for (let k = 0; k < c.copyLen; ++k) {
                            const srcPos = outPos - c.distance;
                            const byte = srcPos >= 0 ? data[srcPos] : lz77Prefix[prefixLen + srcPos];
                            p2 = p1; p1 = byte;
                            ++outPos;
                        }
                    }
                }
            }

            w.align();
            return w.bytes();
        }

        function brotliCompressSync(data, opts) {
            if (!(data instanceof u8)) _err('EBADARG', 'expected Uint8Array');
            const quality = (opts && opts.quality != null) ? opts.quality : 6;
            if (typeof quality !== 'number' || quality < 0 || quality > 11 || (quality | 0) !== quality) {
                _err('EBADARG', 'quality must be an integer in [0, 11], got ' + quality);
            }

            // Quality 0 → trivial uncompressed (smallest, fastest). Quality
            // 1..11 → LZ77 + dynamic Huffman, with lz77 chainDepth/lazy
            // tuned per quality bucket inside `_encodeCompressed`. Very
            // short inputs or inputs > 16 MiB fall back to trivial
            // (header overhead / MNIBBLES range).
            if (quality === 0 || data.length < 32 || data.length > 16777216) {
                return _encodeUncompressed(data);
            }
            try {
                const compressed = _encodeCompressed(data, opts);
                const trivial = _encodeUncompressed(data);
                return compressed.length <= trivial.length ? compressed : trivial;
            } catch (e) {
                if (e.code === 'EINTERNAL') return _encodeUncompressed(data);
                throw e;
            }
        }

        function brotliCompress(data, opts) {
            return new Promise((resolve, reject) => {
                queueMicrotask(() => {
                    try { resolve(brotliCompressSync(data, opts)); } catch (e) { reject(e); }
                });
            });
        }

        function brotliDecompress(data, opts) {
            return new Promise((resolve, reject) => {
                queueMicrotask(() => {
                    try { resolve(brotliDecompressSync(data, opts)); } catch (e) { reject(e); }
                });
            });
        }

        // --- Step 11 - Streaming wrappers ---
        //
        // Both `BrotliCompressStream` and `BrotliDecompressStream` follow
        // the deflate/gzip streaming convention: construct with an
        // `(opts?, ondata)` pair where `ondata(chunk, isFinal)` is called
        // when output is available. `push(chunk, final)` accepts an
        // input chunk and, when `final === true`, runs the full
        // sync codec on the accumulated buffer and emits the result.
        //
        // Buffering rather than true incremental codec - the underlying
        // brotli engine is not resumable. For inputs that must be
        // processed in true streaming fashion (e.g. arbitrary 4 GB
        // streams), the consumer should chunk into separate brotli
        // streams or fall back to deflate/gzip which do support partial
        // emissions.

        function _bufferPush(self, chunk, final) {
            if (!self.ondata) _err('EBADARG', 'stream: no ondata handler set');
            if (self._done) _err('ESTREAMEND', 'stream already finalised');
            if (chunk != null && chunk.length > 0) {
                if (!(chunk instanceof u8)) _err('EBADARG', 'stream.push: chunk must be Uint8Array');
                self._chunks.push(chunk);
                self._totalLen += chunk.length;
            }
            if (final) {
                self._done = true;
                let full;
                if (self._chunks.length === 0) {
                    full = new u8(0);
                } else if (self._chunks.length === 1) {
                    full = self._chunks[0];
                } else {
                    full = new u8(self._totalLen);
                    let off = 0;
                    for (const c of self._chunks) { full.set(c, off); off += c.length; }
                }
                self._chunks = null;
                const out = self._sync(full, self._opts);
                self.ondata(out, true);
            }
        }

        function BrotliCompressStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata;
            this._opts = opts || {};
            this._chunks = [];
            this._totalLen = 0;
            this._done = false;
        }
        BrotliCompressStream.prototype.push = function (chunk, final) {
            this._sync = brotliCompressSync;
            _bufferPush(this, chunk, final);
        };

        // Truly incremental decompress stream: each `push(chunk, final)`
        // tries to decode as many full meta-blocks as the buffered input
        // allows, emits the newly-produced bytes through `ondata`, and
        // retains the rest of the input for the next push.
        //
        // The reader's EAGAIN mechanism distinguishes "input exhausted,
        // wait for more" (during non-final pushes) from "unexpected EOI"
        // (during final pushes / sync calls). Each meta-block attempt is
        // wrapped in a save/restore - on EAGAIN, decoder state rolls back
        // to before the attempt; on success it commits.

        function _saveDecoderState(state) {
            return {
                outLen: state.outLen,
                p1: state.p1,
                p2: state.p2,
                lastDist: new Int32Array(state.lastDist),
            };
        }
        function _restoreDecoderState(state, saved) {
            state.outLen = saved.outLen;
            state.p1 = saved.p1;
            state.p2 = saved.p2;
            state.lastDist.set(saved.lastDist);
        }

        function BrotliDecompressStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata;
            this._opts = opts || {};
            this._chunks = [];           // buffered raw input
            this._totalLen = 0;
            this._done = false;
            this._consumedBits = 0;      // bit position into the concatenated input
            this._emittedLen = 0;        // bytes already passed to ondata
            this._state = null;          // decoder state (lazy init at first push)
            this._initDone = false;      // WBITS header consumed?
        }

        BrotliDecompressStream.prototype.push = function (chunk, final) {
            if (!this.ondata) _err('EBADARG', 'stream: no ondata handler set');
            if (this._done) _err('ESTREAMEND', 'stream already finalised');

            if (chunk != null && chunk.length > 0) {
                if (!(chunk instanceof u8)) _err('EBADARG', 'stream.push: chunk must be Uint8Array');
                this._chunks.push(chunk);
                this._totalLen += chunk.length;
            }

            // Concatenate all buffered input. (For typical chunk counts
            // this is cheap; a rope-style reader would be a future opt.)
            let buf;
            if (this._chunks.length === 0) buf = new u8(0);
            else if (this._chunks.length === 1) buf = this._chunks[0];
            else {
                buf = new u8(this._totalLen);
                let off = 0;
                for (const c of this._chunks) { buf.set(c, off); off += c.length; }
                this._chunks = [buf];
            }

            // Build the reader with the current concatenated buffer and
            // restore the bit position from the previous push.
            const r = _makeReader(buf, !final);
            r.p = this._consumedBits;

            // Lazy init: read the stream header + create state on first push.
            if (!this._initDone) {
                const savedP = r.p;
                try {
                    const ext = (this._opts && this._opts._ext) || null;
                    const wbitsInfo = _readWBITS(r, ext && ext.allowLargeWindow);
                    const wbits = wbitsInfo.wbits;
                    const windowSize = wbits >= 31 ? Math.pow(2, wbits) - 16 : (1 << wbits) - 16;

                    this._state = {
                        out: new u8(1024),
                        outLen: 0,
                        p1: 0,
                        p2: 0,
                        lastDist: new Int32Array([4, 11, 15, 16]),
                        windowSize,
                        lz77Dict: (ext && ext.lz77Dict) || null,
                        largeWindow: wbitsInfo.largeWindow,
                        resolveStaticDictRef: (ext && ext.resolveStaticDictRef) || null,
                    };
                    this._initDone = true;
                    // Persist consumed bit offset so the next push resumes
                    // AFTER the WBITS header.
                    this._consumedBits = r.p;
                } catch (e) {
                    if (e.code === 'EAGAIN') {
                        r.p = savedP;
                        // Stay un-initialised; next push retries from the same buffer.
                        return;
                    }
                    throw e;
                }
            }

            // Drive the meta-block loop until we hit EAGAIN or ISLASTEMPTY.
            while (!this._done) {
                const savedP = r.p;
                const savedState = _saveDecoderState(this._state);
                try {
                    const res = _decodeMetaBlockInto(r, this._state);
                    this._consumedBits = r.p;
                    if (res.last) {
                        // Trailing-byte fill zeros check (sync path does the
                        // same after the last meta-block).
                        _verifyByteTailZero(r);
                        this._done = true;
                    }
                } catch (e) {
                    if (e.code === 'EAGAIN') {
                        r.p = savedP;
                        _restoreDecoderState(this._state, savedState);
                        break;
                    }
                    throw e;
                }
            }

            // Emit newly-produced bytes.
            if (this._state.outLen > this._emittedLen) {
                const slice = this._state.out.slice(this._emittedLen, this._state.outLen);
                this._emittedLen = this._state.outLen;
                this.ondata(slice, this._done);
            } else if (this._done) {
                // Empty stream - emit a zero-length final chunk so consumers
                // see the `final=true` signal.
                this.ondata(new u8(0), true);
            } else if (final && !this._done) {
                _err('EBADSTREAM', 'stream finalised with unconsumed input or unterminated stream');
            }

            // Free buffered bytes already consumed (compact the chunk buffer).
            if (this._chunks.length === 1) {
                const consumedBytes = this._consumedBits >> 3;
                if (consumedBytes > 0 && consumedBytes < this._chunks[0].length) {
                    this._chunks[0] = this._chunks[0].subarray(consumedBytes);
                    this._totalLen -= consumedBytes;
                    this._consumedBits &= 7;  // keep the sub-byte residue
                } else if (consumedBytes === this._chunks[0].length) {
                    // Fully consumed (likely after final). Drop the buffer.
                    this._chunks = [];
                    this._totalLen = 0;
                    this._consumedBits = this._consumedBits & 7;
                }
            }
        };

        return {
            brotliCompressSync,
            brotliDecompressSync,
            brotliCompress,
            brotliDecompress,
            BrotliCompressStream,
            BrotliDecompressStream,
            // Internal primitives shared with the codec's own tests and
            // potentially with future companion modules (e.g. a brotli
            // inspector / debugger). Same `_internal` convention as
            // chacha20, sha256, argon2, etc.
            _internal: {
                makeReader: _makeReader,
                readBit: _readBit,
                readBits: _readBits,
                readBitsBig: _readBitsBig,
                readWBITS: _readWBITS,
                readPrefixCode: _readPrefixCode,
                readVarLenCount: _readVarLenCount,
                readBlockCount: _readBlockCount,
                readRleMax: _readRleMax,
                inverseMoveToFront: _inverseMoveToFront,
                readContextMap: _readContextMap,
                readCompressedMetaBlockHeader: _readCompressedMetaBlockHeader,
                splitIacSym: _splitIacSym,
                decodeDistanceSymbol: _decodeDistanceSymbol,
                contextIdLit: _contextIdLit,
                LUT0: _LUT0,
                LUT1: _LUT1,
                LUT2: _LUT2,
                INSERT_BASE: _INSERT_BASE,
                INSERT_EXTRA: _INSERT_EXTRA,
                COPY_BASE: _COPY_BASE,
                COPY_EXTRA: _COPY_EXTRA,
                encodeUncompressed: _encodeUncompressed,
            },
        };
    }
};
