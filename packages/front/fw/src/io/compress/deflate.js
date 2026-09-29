// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview DEFLATE (RFC 1951) — in-house implementation.
 *
 * Decoder: §3.2.3–3.2.7. Encoder: LZ77 matching via the `lz77` module, block
 * type selection by measured cost, canonical Huffman via `huffman`.
 *
 * Every table below is derived in code from the formulas of §3.2.5–§3.2.7 and
 * asserted against the RFC's literal tables in `deflate.test.js`; each
 * function cites the section it implements.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `deflateSync(data, opts?)` | `Uint8Array` - synchronous compression |
 * | `inflateSync(data, opts?)` | `Uint8Array` - synchronous decompression |
 * | `deflate(data, opts?)` | `Promise<Uint8Array>` - async compression |
 * | `inflate(data, opts?)` | `Promise<Uint8Array>` - async decompression |
 * | `new DeflateStream(opts?, ondata?)` | Streaming compressor |
 * | `new InflateStream(opts?, ondata?)` | Streaming decompressor |
 *
 * ## Options
 *
 * Compression: `{ level: 0–9, mem: 0–12, lazy?: boolean, dictionary?: Uint8Array }`
 * Decompression: `{ out?: Uint8Array, dictionary?: Uint8Array }`
 *
 */

/**
 * Streaming DEFLATE compressor instance shape.
 * @typedef {object} DeflateStreamInstance
 * @property {(chunk: Uint8Array, isFinal: boolean) => void} [ondata] Output callback.
 * @property {(chunk: Uint8Array, final?: boolean) => void} push Push a chunk of plaintext.
 * @property {() => void} flush Flush buffered data without finalising.
 */

/**
 * Constructor for `DeflateStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => DeflateStreamInstance} DeflateStreamCtor
 */

/**
 * Streaming DEFLATE decompressor instance shape.
 * @typedef {object} InflateStreamInstance
 * @property {(chunk: Uint8Array, isFinal: boolean) => void} [ondata] Output callback.
 * @property {(chunk: Uint8Array, final?: boolean) => void} push Push a chunk of compressed data.
 */

/**
 * Constructor for `InflateStream`.
 * @typedef {new (opts?: object|((chunk: Uint8Array, isFinal: boolean) => void), ondata?: (chunk: Uint8Array, isFinal: boolean) => void) => InflateStreamInstance} InflateStreamCtor
 */

/**
 * Public surface of `deflate.factory(...)`.
 * @typedef {object} DeflateApi
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} deflateSync
 * @property {(data: Uint8Array, opts?: object) => Uint8Array} inflateSync
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} deflate
 * @property {(data: Uint8Array, opts?: object) => Promise<Uint8Array>} inflate
 * @property {DeflateStreamCtor} DeflateStream
 * @property {InflateStreamCtor} InflateStream
 */

import { bitstream } from './bitstream.js';
import { huffman } from './huffman.js';
import { lz77 } from './lz77.js';

export const deflate = {
    name: 'deflate',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: ['bitstream', 'huffman', 'lz77'],
    deps: [bitstream, huffman, lz77],

    /** @returns {DeflateApi} */
    factory(bitstream, huffman, lz77) {

        const {
            readBits, readBits16, writeBits, writeBits16, byteOffset, slice, max,
        } = bitstream;
        const { buildMap, buildTree } = huffman;

        // --- Error handling ---

        /** Message for each `e.code` this module emits (RFC 1951 level only). */
        const ERROR_MESSAGES = [
            'unexpected EOF',           // 0
            'invalid block type',       // 1
            'invalid length/literal',   // 2
            'invalid distance',         // 3
            'stream finished',          // 4
            'no stream handler',        // 5
            null, null,
            'invalid data',             // 8
        ];

        /**
         * Throw an `Error` carrying the module's numeric `code`.
         *
         * @param {number} code One of the codes documented in `deflate.md`.
         * @param {string} [message] Overrides the default message for `code`.
         * @returns {never}
         */
        function fail(code, message) {
            const e = new Error(message ?? ERROR_MESSAGES[code] ?? 'unknown error');
            // @ts-ignore - Error.code is a non-standard but widely-used extension
            e.code = code;
            throw e;
        }

        // --- TypedArray aliases ---

        const u8  = Uint8Array;
        const u16 = Uint16Array;
        const u32 = Uint32Array;
        const i32 = Int32Array;

        // --- RFC 1951 tables ---

        /** Sliding-window size in bytes (RFC 1951 §2 — 32 KiB). */
        const WINDOW_SIZE = 32768;

        /**
         * Extra bits carried by length symbol `257 + i` (RFC 1951 §3.2.5).
         * Symbols 257..264 and 285 are exact; the rest grow by one bit every
         * four symbols.
         *
         * @param {number} i Length-symbol index, `0..28` for symbols `257..285`.
         * @returns {number} Number of extra bits following the code.
         */
        function lengthExtraBits(i) {
            if (i < 8 || i === 28) return 0;
            return (i - 4) >> 2;
        }

        /**
         * Extra bits carried by distance symbol `i` (RFC 1951 §3.2.5).
         * Symbols 0..3 are exact; the rest grow by one bit every two symbols.
         *
         * @param {number} i Distance-symbol index, `0..29`.
         * @returns {number} Number of extra bits following the code.
         */
        function distanceExtraBits(i) {
            if (i < 4) return 0;
            return (i - 2) >> 1;
        }

        /**
         * Accumulate the base values of a run-length table: `base[0] = start`
         * and each following entry adds the span covered by its predecessor.
         *
         * @param {Uint8Array} extra Per-symbol extra-bit counts.
         * @param {number} start Base value of symbol 0.
         * @returns {Uint16Array} Per-symbol base values.
         */
        function accumulateBases(extra, start) {
            const base = new u16(extra.length);
            base[0] = start;
            for (let i = 1; i < extra.length; ++i) base[i] = base[i - 1] + (1 << extra[i - 1]);
            return base;
        }

        /** Extra-bit counts of length symbols 257..285 (RFC 1951 §3.2.5). */
        const LENGTH_EXTRA = new u8(29);
        for (let i = 0; i < 29; ++i) LENGTH_EXTRA[i] = lengthExtraBits(i);

        /** Base match lengths of symbols 257..285; symbol 285 is the exact 258. */
        const LENGTH_BASE = accumulateBases(LENGTH_EXTRA, 3);
        LENGTH_BASE[28] = 258;

        /** Extra-bit counts of distance symbols 0..29 (RFC 1951 §3.2.5). */
        const DIST_EXTRA = new u8(30);
        for (let i = 0; i < 30; ++i) DIST_EXTRA[i] = distanceExtraBits(i);

        /** Base match distances of symbols 0..29 (RFC 1951 §3.2.5). */
        const DIST_BASE = accumulateBases(DIST_EXTRA, 1);

        /**
         * Order in which the 19 code-length code lengths appear in a dynamic
         * block header (RFC 1951 §3.2.7, quoted literally).
         */
        const CODE_LENGTH_ORDER = new u8([
            16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
        ]);

        /** Fixed literal/length code lengths (RFC 1951 §3.2.6). */
        const FIXED_LIT_LENGTHS = new u8(288);
        for (let i = 0; i < 144; ++i) FIXED_LIT_LENGTHS[i] = 8;
        for (let i = 144; i < 256; ++i) FIXED_LIT_LENGTHS[i] = 9;
        for (let i = 256; i < 280; ++i) FIXED_LIT_LENGTHS[i] = 7;
        for (let i = 280; i < 288; ++i) FIXED_LIT_LENGTHS[i] = 8;

        /** Fixed distance code lengths — 30 usable 5-bit codes (RFC 1951 §3.2.6). */
        const FIXED_DIST_LENGTHS = new u8(30);
        for (let i = 0; i < 30; ++i) FIXED_DIST_LENGTHS[i] = 5;

        /** Decode table for the fixed literal/length code, indexed by 9 LSB-first bits. */
        const FIXED_LIT_TABLE = buildMap(FIXED_LIT_LENGTHS, 9, 1);

        /** Decode table for the fixed distance code, indexed by 5 LSB-first bits. */
        const FIXED_DIST_TABLE = buildMap(FIXED_DIST_LENGTHS, 5, 1);

        /** Encoder-side codes of the fixed literal/length code (§3.2.6). */
        const FIXED_LIT_CODES = buildMap(FIXED_LIT_LENGTHS, 9, 0);

        /** Encoder-side codes of the fixed distance code (§3.2.6). */
        const FIXED_DIST_CODES = buildMap(FIXED_DIST_LENGTHS, 5, 0);

        /** Match length `3..258` → length-symbol index `0..28` (§3.2.5). */
        const LENGTH_CODE = new u8(259);
        for (let sym = 0; sym < 28; ++sym) {
            const base = LENGTH_BASE[sym];
            const span = 1 << LENGTH_EXTRA[sym];
            for (let len = base; len < base + span && len < 258; ++len) LENGTH_CODE[len] = sym;
        }
        LENGTH_CODE[258] = 28;

        /** Distance `1..256` → distance-symbol index (`DIST_CODE_LOW[dist - 1]`). */
        const DIST_CODE_LOW = new u8(256);
        for (let dist = 1, sym = 0; dist <= 256; ++dist) {
            while (sym < 29 && dist >= DIST_BASE[sym + 1]) ++sym;
            DIST_CODE_LOW[dist - 1] = sym;
        }

        /**
         * Distance `257..32768` → the LOWEST distance symbol whose range meets
         * the 256-value bucket `(dist - 1) >> 8`. Every symbol from 16 upwards
         * spans at least 128 distances, so a bucket holds at most two symbol
         * starts and one `DIST_BASE` comparison resolves the pair — see
         * `distanceCode`.
         */
        const DIST_CODE_HIGH = new u8(128);
        for (let bucket = 0, sym = 0; bucket < 128; ++bucket) {
            const first = (bucket << 8) + 1;
            while (sym < 29 && first >= DIST_BASE[sym + 1]) ++sym;
            DIST_CODE_HIGH[bucket] = sym;
        }

        /**
         * Distance-symbol index of `dist` (RFC 1951 §3.2.5), `1 <= dist <= 32768`.
         *
         * @param {number} dist Match distance in bytes.
         * @returns {number} Distance-symbol index `0..29`.
         */
        function distanceCode(dist) {
            if (dist <= 256) return DIST_CODE_LOW[dist - 1];
            const sym = DIST_CODE_HIGH[(dist - 1) >> 8];
            return sym < 29 && dist >= DIST_BASE[sym + 1] ? sym + 1 : sym;
        }

        // --- Decoder ---

        /** Decoder is between blocks and must read the next block header. */
        const PHASE_HEADER = 0;
        /** Decoder is copying the body of a stored (BTYPE 0) block. */
        const PHASE_STORED = 1;
        /** Decoder is reading literal/length symbols of a compressed block. */
        const PHASE_CODES = 2;
        /** The final block has been fully decoded. */
        const PHASE_DONE = 3;

        /** `runInflate` ran out of input before the final block. */
        const NEED_INPUT = 0;
        /** `runInflate` decoded through the end of the final block. */
        const COMPLETE = 1;

        /**
         * Resumable inflate state.
         *
         * @typedef {object} InflateState
         * @property {number} bitPos Absolute bit offset into the current input buffer.
         * @property {number} finalBlock BFINAL flag of the block being decoded.
         * @property {number} phase One of `PHASE_*`.
         * @property {number} storedRemaining Bytes left to copy in a stored block.
         * @property {Uint16Array|null} litTable Literal/length decode table.
         * @property {number} litBits Index width of `litTable`.
         * @property {Uint16Array|null} distTable Distance decode table.
         * @property {number} distBits Index width of `distTable`.
         * @property {Uint8Array|null} out Output buffer (may hold a priming dictionary).
         * @property {number} outLen Bytes written into `out`.
         * @property {number} emitted Bytes already handed to a stream consumer.
         * @property {Uint8Array|null} dictionary Priming dictionary (≤ 32 KiB), if any.
         * @property {boolean} fixedOut `out` is caller-provided and must not grow.
         */

        /**
         * Create a fresh decoder state.
         *
         * @param {Uint8Array} [dictionary] Preset dictionary; only its last
         *   32 KiB are usable as back-reference history (RFC 1950 §2.2 style).
         * @returns {InflateState}
         */
        function createInflateState(dictionary) {
            const dict = dictionary && dictionary.length
                ? dictionary.subarray(Math.max(0, dictionary.length - WINDOW_SIZE))
                : null;
            return {
                bitPos: 0,
                finalBlock: 0,
                phase: PHASE_HEADER,
                storedRemaining: 0,
                litTable: null,
                litBits: 0,
                distTable: null,
                distBits: 0,
                out: null,
                outLen: 0,
                emitted: 0,
                dictionary: dict,
                fixedOut: false,
            };
        }

        /**
         * Allocate the output buffer and prime it with the dictionary.
         *
         * A caller-supplied `out` is decoded into directly (and never grown)
         * unless a dictionary is also present, in which case an internal
         * buffer is used and copied out at the end (`inflateSync`).
         *
         * @param {InflateState} state
         * @param {number} inputLength Compressed length, used to size the guess.
         * @param {Uint8Array} [providedOut] Caller buffer from `opts.out`.
         * @returns {void}
         */
        function initOutput(state, inputLength, providedOut) {
            const dictLen = state.dictionary ? state.dictionary.length : 0;
            if (providedOut && !dictLen) {
                state.out = providedOut;
                state.fixedOut = true;
            } else {
                state.out = new u8(Math.max(65536, inputLength * 3));
            }
            if (dictLen) {
                state.out.set(state.dictionary);
                state.outLen = dictLen;
                state.emitted = dictLen;
            }
        }

        /**
         * Guarantee `needed` bytes of capacity in `state.out`, doubling as
         * required. A caller-provided buffer cannot grow and overflows instead.
         *
         * @param {InflateState} state
         * @param {number} needed Required total capacity in bytes.
         * @returns {void}
         */
        function reserveOutput(state, needed) {
            if (needed <= state.out.length) return;
            if (state.fixedOut) fail(8, 'output exceeds provided buffer');
            let size = state.out.length || 65536;
            while (size < needed) size *= 2;
            const grown = new u8(size);
            grown.set(state.out.subarray(0, state.outLen));
            state.out = grown;
        }

        /**
         * Read the dynamic Huffman header of a BTYPE 2 block (RFC 1951 §3.2.7):
         * HLIT/HDIST/HCLEN, the 19 code-length code lengths in
         * `CODE_LENGTH_ORDER`, then the RLE-coded literal and distance lengths.
         *
         * An over-subscribed or incomplete code is not validated here; such a
         * stream is rejected later by `decodeSymbols` (code 2 or 3).
         *
         * @param {InflateState} state
         * @param {Uint8Array} input
         * @returns {boolean} `false` when the input ran out mid-header.
         */
        function readDynamicTables(state, input) {
            const totalBits = input.length * 8;
            let pos = state.bitPos;

            const hlit = readBits(input, pos, 0b11111) + 257;
            const hdist = readBits(input, pos + 5, 0b11111) + 1;
            const hclen = readBits(input, pos + 10, 0b1111) + 4;
            pos += 14;
            if (pos > totalBits) { state.bitPos = pos; return false; }
            if (hlit > 286 || hdist > 30) fail(8, 'too many length/distance codes');

            const clLengths = new u8(19);
            for (let i = 0; i < hclen; ++i) {
                clLengths[CODE_LENGTH_ORDER[i]] = readBits(input, pos + i * 3, 0b111);
            }
            pos += hclen * 3;
            if (pos > totalBits) { state.bitPos = pos; return false; }

            const clBits = max(clLengths);
            const clMask = (1 << clBits) - 1;
            const clTable = buildMap(clLengths, clBits, 1);

            const total = hlit + hdist;
            const lengths = new u8(total);
            for (let i = 0; i < total;) {
                // Fewer than `clBits` bits left ⇒ the next code is not fully
                // present, so a zero entry means "truncated", not "invalid".
                const entry = clTable[readBits(input, pos, clMask)];
                if (!entry || pos + (entry & 15) > totalBits) {
                    if (pos + clBits > totalBits) { state.bitPos = totalBits + 1; return false; }
                    fail(8, 'invalid code-length code');
                }
                pos += entry & 15;
                const symbol = entry >> 4;
                if (symbol < 16) { lengths[i++] = symbol; continue; }

                let repeat;
                let value = 0;
                if (symbol === 16) {
                    if (i === 0) fail(8, 'code-length repeat with no previous length');
                    value = lengths[i - 1];
                    repeat = 3 + readBits(input, pos, 0b11);
                    pos += 2;
                } else if (symbol === 17) {
                    repeat = 3 + readBits(input, pos, 0b111);
                    pos += 3;
                } else {
                    repeat = 11 + readBits(input, pos, 0b1111111);
                    pos += 7;
                }
                if (pos > totalBits) { state.bitPos = pos; return false; }
                if (i + repeat > total) fail(8, 'code-length repeat overruns the table');
                while (repeat--) lengths[i++] = value;
            }

            const litLengths = lengths.subarray(0, hlit);
            const distLengths = lengths.subarray(hlit);
            state.litBits = max(litLengths);
            state.distBits = max(distLengths);
            state.litTable = buildMap(litLengths, state.litBits, 1);
            state.distTable = buildMap(distLengths, state.distBits, 1);
            state.bitPos = pos;
            return true;
        }

        /**
         * Read one block header (RFC 1951 §3.2.3): BFINAL then BTYPE, and the
         * per-type preamble (stored LEN/NLEN, fixed tables, dynamic tables).
         *
         * @param {InflateState} state
         * @param {Uint8Array} input
         * @returns {boolean} `false` when the input ran out mid-header.
         */
        function readBlockHeader(state, input) {
            const totalBits = input.length * 8;
            state.finalBlock = readBits(input, state.bitPos, 0b1);
            const type = readBits(input, state.bitPos + 1, 0b11);
            state.bitPos += 3;
            if (state.bitPos > totalBits) return false;

            if (type === 0) {
                // Stored block (§3.2.4): skip to the byte boundary, read LEN/NLEN.
                const start = byteOffset(state.bitPos);
                if (start + 4 > input.length) { state.bitPos = (start + 4) * 8; return false; }
                const len = input[start] | (input[start + 1] << 8);
                const nlen = input[start + 2] | (input[start + 3] << 8);
                if (nlen !== (~len & 0xFFFF)) fail(8, 'stored block LEN/NLEN mismatch');
                state.bitPos = (start + 4) * 8;
                state.storedRemaining = len;
                state.phase = PHASE_STORED;
            } else if (type === 1) {
                state.litTable = FIXED_LIT_TABLE;
                state.litBits = 9;
                state.distTable = FIXED_DIST_TABLE;
                state.distBits = 5;
                state.phase = PHASE_CODES;
            } else if (type === 2) {
                if (!readDynamicTables(state, input)) return false;
                state.phase = PHASE_CODES;
            } else {
                fail(1);
            }
            return true;
        }

        /**
         * Copy the body of a stored block (RFC 1951 §3.2.4), resuming from a
         * partial copy when the input was exhausted mid-block.
         *
         * @param {InflateState} state
         * @param {Uint8Array} input
         * @returns {boolean} `false` when more input is needed.
         */
        function copyStored(state, input) {
            const start = state.bitPos >> 3;
            const n = Math.min(state.storedRemaining, input.length - start);
            if (n > 0) {
                const end = state.outLen + n;
                reserveOutput(state, end);
                state.out.set(input.subarray(start, start + n), state.outLen);
                state.outLen = end;
                state.storedRemaining -= n;
                state.bitPos += n * 8;
            }
            if (state.storedRemaining > 0) return false;
            state.phase = state.finalBlock ? PHASE_DONE : PHASE_HEADER;
            return true;
        }

        /**
         * Decode literal/length and distance symbols until end-of-block
         * (RFC 1951 §3.2.5). Each symbol is attempted from a snapshot of
         * `bitPos` so a truncated symbol can be re-read on the next push.
         *
         * @param {InflateState} state
         * @param {Uint8Array} input
         * @returns {boolean} `false` when more input is needed.
         */
        function decodeSymbols(state, input) {
            const totalBits = input.length * 8;
            const litTable = state.litTable;
            const distTable = state.distTable;
            const litMask = (1 << state.litBits) - 1;
            const distMask = (1 << state.distBits) - 1;

            for (;;) {
                const snapshot = state.bitPos;

                const entry = litTable[readBits16(input, state.bitPos) & litMask];
                if (!entry || state.bitPos + (entry & 15) > totalBits) {
                    if (state.bitPos + state.litBits > totalBits) { state.bitPos = snapshot; return false; }
                    fail(2);
                }
                state.bitPos += entry & 15;
                const symbol = entry >> 4;

                if (symbol < 256) {
                    reserveOutput(state, state.outLen + 1);
                    state.out[state.outLen++] = symbol;
                    continue;
                }
                if (symbol === 256) {
                    state.phase = state.finalBlock ? PHASE_DONE : PHASE_HEADER;
                    return true;
                }

                const lengthIndex = symbol - 257;
                if (lengthIndex >= 29) fail(2);
                let length = LENGTH_BASE[lengthIndex];
                const lengthExtra = LENGTH_EXTRA[lengthIndex];
                if (lengthExtra) {
                    if (state.bitPos + lengthExtra > totalBits) { state.bitPos = snapshot; return false; }
                    length += readBits(input, state.bitPos, (1 << lengthExtra) - 1);
                    state.bitPos += lengthExtra;
                }

                const distEntry = distTable[readBits16(input, state.bitPos) & distMask];
                if (!distEntry || state.bitPos + (distEntry & 15) > totalBits) {
                    if (state.bitPos + state.distBits > totalBits) { state.bitPos = snapshot; return false; }
                    fail(3);
                }
                state.bitPos += distEntry & 15;
                const distIndex = distEntry >> 4;
                if (distIndex >= 30) fail(3);
                let distance = DIST_BASE[distIndex];
                const distExtra = DIST_EXTRA[distIndex];
                if (distExtra) {
                    if (state.bitPos + distExtra > totalBits) { state.bitPos = snapshot; return false; }
                    distance += readBits16(input, state.bitPos) & ((1 << distExtra) - 1);
                    state.bitPos += distExtra;
                }
                // Dictionary bytes are part of `out`, so this one test covers
                // both the "before the start of the stream" and the
                // "beyond the 32 KiB window" cases.
                if (distance > state.outLen) fail(3);

                const end = state.outLen + length;
                reserveOutput(state, end);
                const out = state.out;
                // Byte-by-byte on purpose: overlapping copies (distance <
                // length) are the RFC's run-length construct.
                for (let p = state.outLen; p < end; ++p) out[p] = out[p - distance];
                state.outLen = end;
            }
        }

        /**
         * Drive the block state machine over `input` until the final block ends
         * or the input runs out.
         *
         * `bitstream.readBits` pads reads past the end with zeros, so an
         * overrun is detected by POSITION rather than by an exception: each
         * block header and each symbol is attempted from a snapshot which is
         * restored when the read ran past `input.length * 8`.
         *
         * @param {InflateState} state
         * @param {Uint8Array} input
         * @param {boolean} streaming `true` to return `NEED_INPUT` instead of
         *   failing with code 0 on a short read.
         * @returns {number} `COMPLETE` or `NEED_INPUT`.
         */
        function runInflate(state, input, streaming) {
            for (;;) {
                if (state.phase === PHASE_DONE) return COMPLETE;

                if (state.phase === PHASE_HEADER) {
                    const snapshot = state.bitPos;
                    if (!readBlockHeader(state, input)) {
                        if (!streaming) fail(0);
                        state.bitPos = snapshot;
                        state.phase = PHASE_HEADER;
                        return NEED_INPUT;
                    }
                }

                if (state.phase === PHASE_STORED) {
                    if (!copyStored(state, input)) {
                        if (!streaming) fail(0);
                        return NEED_INPUT;
                    }
                } else if (state.phase === PHASE_CODES) {
                    if (!decodeSymbols(state, input)) {
                        if (!streaming) fail(0);
                        return NEED_INPUT;
                    }
                }
            }
        }

        /**
         * Drop everything but the last 32 KiB of already-emitted output, so a
         * long stream keeps a bounded buffer while back-references stay valid.
         *
         * @param {InflateState} state
         * @returns {void}
         */
        function trimWindow(state) {
            if (state.outLen <= WINDOW_SIZE) return;
            const start = state.outLen - WINDOW_SIZE;
            state.out.set(state.out.subarray(start, state.outLen), 0);
            state.outLen = WINDOW_SIZE;
            state.emitted = Math.max(0, state.emitted - start);
        }

        // --- Encoder: parameters ---

        /** log2 of the match window handed to `lz77` (RFC 1951 §3.2.5 caps distances at 32 768). */
        const WINDOW_BITS = 15;
        /** Shortest match DEFLATE can code (RFC 1951 §3.2.5). */
        const MIN_MATCH = 3;
        /** Longest match DEFLATE can code — length symbol 285 (§3.2.5). */
        const MAX_MATCH = 258;
        /** Tokens buffered before a block is emitted and the buffer resets. */
        const BLOCK_TOKENS = 16384;
        /** `DeflateStream` compresses its pending input at this size, or on final. */
        const STREAM_FLUSH_BYTES = 65536;

        /**
         * `lz77` search effort per compression level — index 0 (stored blocks
         * only) has no scan. `goodLength` / `maxLazy` only act when the
         * `lazy` option is on (levels 1–3 leave them at the `lz77` defaults).
         * See `deflate.md` § Design › Encoder for the measurements behind it.
         */
        const LEVELS = [
            null,
            { chainDepth: 4,    niceLength: 8   },
            { chainDepth: 8,    niceLength: 16  },
            { chainDepth: 16,   niceLength: 32  },
            { chainDepth: 16,   niceLength: 16,  goodLength: 4,  maxLazy: 4   },
            { chainDepth: 32,   niceLength: 32,  goodLength: 8,  maxLazy: 16  },
            { chainDepth: 128,  niceLength: 128, goodLength: 8,  maxLazy: 16  },
            { chainDepth: 256,  niceLength: 128, goodLength: 8,  maxLazy: 32  },
            { chainDepth: 1024, niceLength: 258, goodLength: 32, maxLazy: 128 },
            { chainDepth: 4096, niceLength: 258, goodLength: 32, maxLazy: 258 },
        ];

        /**
         * Clamp `value` into `[lo, hi]`, treating a non-finite value as `lo`.
         *
         * @param {number} value
         * @param {number} lo
         * @param {number} hi
         * @returns {number}
         */
        function clamp(value, lo, hi) {
            if (!(value >= lo)) return lo;
            return value > hi ? hi : value;
        }

        /**
         * Resolve the LZ77 hash width: `mem` maps to `12 + mem` (capped at 22),
         * otherwise the width tracks the input size within `[12, 20]`.
         *
         * @param {object} opts Compression options.
         * @param {number} inputLength Bytes handed to the matcher.
         * @returns {number} `hashBits`.
         */
        function resolveHashBits(opts, inputLength) {
            if (opts.mem != null) return Math.min(22, 12 + opts.mem);
            return clamp(Math.ceil(Math.log2(inputLength || 1)), 12, 20);
        }

        /**
         * Build the RFC 1951 position hash used by `lz77`: a Fibonacci
         * (golden-ratio) multiplicative hash over exactly the three bytes that
         * define a `MIN_MATCH` match. `lz77` masks the result to `hashBits`.
         *
         * @param {number} hashBits Hash-table width in bits.
         * @returns {(data: Uint8Array, i: number) => number} Position hasher.
         */
        function makeHashFn(hashBits) {
            const shift = 32 - hashBits;
            return function rfc1951Hash(data, i) {
                return Math.imul(data[i] | (data[i + 1] << 8) | (data[i + 2] << 16), 0x9E3779B1) >>> shift;
            };
        }

        /**
         * Largest `lz77.encodeTokens` buffer kept alive between calls
         * (2 Mi entries = 8 MiB, enough for 1 MiB of input); anything larger
         * is transient. The token buffer is the encoder's working set: one
         * `deflateSync` call holds `8 × (input bytes)` of it until it returns,
         * while `DeflateStream` stays bounded by its 64 KiB units.
         */
        const TOKEN_SCRATCH_MAX = 1 << 21;

        /** Reused `lz77.encodeTokens` output buffer — see `TOKEN_SCRATCH_MAX`. */
        let tokenScratch = null;

        /**
         * Hand `lz77.encodeTokens` a buffer of at least `capacity` entries,
         * reusing (and growing) the shared scratch when it is small enough to
         * keep.
         *
         * @param {number} capacity `2 × (input.length - start)`.
         * @returns {Int32Array}
         */
        function tokenBuffer(capacity) {
            if (capacity > TOKEN_SCRATCH_MAX) return new i32(capacity);
            if (!tokenScratch || tokenScratch.length < capacity) tokenScratch = new i32(capacity);
            return tokenScratch;
        }

        // --- Encoder: token buffer ---

        /**
         * One block's worth of LZ77 tokens plus the symbol statistics the
         * block writer needs. The tokens are a window `[from, to)` over the
         * packed `(len | 0, dist | byte)` pairs `lz77.encodeTokens` produced —
         * `tokens[2k] === 0` marks a literal whose byte is `tokens[2k + 1]`,
         * otherwise the pair is a match length and its distance — so the
         * matcher's output is read in place, never copied.
         *
         * @typedef {object} TokenBuffer
         * @property {Int32Array} tokens Packed token pairs of the whole scan.
         * @property {number} from Index of the block's first token.
         * @property {number} to One past the index of the block's last token.
         * @property {Uint32Array} litFreq Literal/length symbol frequencies.
         * @property {Uint32Array} distFreq Distance symbol frequencies.
         * @property {number} extraBits Total length/distance extra bits of the block.
         * @property {number} blockStart Input offset of the block's first byte.
         * @property {number} blockLen Input bytes covered by the block.
         */

        /**
         * Create a token buffer over `tokens` whose first block starts at
         * input offset `start`.
         *
         * @param {Int32Array} tokens Packed pairs from `lz77.encodeTokens`.
         * @param {number} start Input offset the first block begins at.
         * @returns {TokenBuffer}
         */
        function createTokenBuffer(tokens, start) {
            return {
                tokens,
                from: 0,
                to: 0,
                litFreq: new u32(286),
                distFreq: new u32(30),
                extraBits: 0,
                blockStart: start,
                blockLen: 0,
            };
        }

        /**
         * Tally the symbols of the tokens `[from, to)` into `tb` and make them
         * its current block. The block's byte span is closed by the caller.
         *
         * @param {TokenBuffer} tb
         * @param {number} from First token index of the block.
         * @param {number} to One past the last token index of the block.
         * @returns {number} Input bytes the block's tokens cover.
         */
        function tallyBlock(tb, from, to) {
            const tokens = tb.tokens;
            const litFreq = tb.litFreq, distFreq = tb.distFreq;
            let extraBits = 0;
            let covered = 0;
            for (let p = 2 * from, end = 2 * to; p < end; p += 2) {
                const len = tokens[p];
                const value = tokens[p + 1];
                if (len === 0) {
                    ++litFreq[value];
                    covered += 1;
                } else {
                    const ls = LENGTH_CODE[len];
                    const ds = distanceCode(value);
                    ++litFreq[257 + ls];
                    ++distFreq[ds];
                    extraBits += LENGTH_EXTRA[ls] + DIST_EXTRA[ds];
                    covered += len;
                }
            }
            tb.from = from;
            tb.to = to;
            tb.extraBits = extraBits;
            return covered;
        }

        /**
         * Clear the statistics of the block just written; the next block
         * starts at input offset `start`.
         *
         * @param {TokenBuffer} tb
         * @param {number} start Input offset the next block begins at.
         * @returns {void}
         */
        function resetTokenBuffer(tb, start) {
            tb.extraBits = 0;
            tb.blockStart = start;
            tb.blockLen = 0;
            tb.litFreq.fill(0);
            tb.distFreq.fill(0);
        }

        // --- Encoder: block writer (§3.2.4 stored, §3.2.6 fixed, §3.2.7 dynamic) ---

        /**
         * Bit-writer state: `writeBits*` OR into zeroed memory, so `buf` is
         * only ever appended to and `bitPos` is the absolute bit cursor.
         *
         * @typedef {object} BitWriter
         * @property {Uint8Array} buf Output bytes under construction.
         * @property {number} bitPos Absolute bit offset of the next write.
         */

        /**
         * Guarantee room for `bits` more bits (plus the slack `writeBits16`
         * touches), doubling `buf` as needed.
         *
         * @param {BitWriter} w
         * @param {number} bits Bits about to be written.
         * @returns {void}
         */
        function ensureBits(w, bits) {
            const needed = ((w.bitPos + bits) >> 3) + 8;
            if (needed <= w.buf.length) return;
            let size = w.buf.length || 1024;
            while (size < needed) size *= 2;
            const grown = new u8(size);
            grown.set(w.buf);
            w.buf = grown;
        }

        /**
         * Total bits spent coding `freq` with the code lengths `lengths`.
         *
         * @param {Uint32Array|Uint16Array} freq Per-symbol frequencies.
         * @param {Uint8Array} lengths Per-symbol code lengths.
         * @param {number} n Symbols to consider.
         * @returns {number} Bit count.
         */
        function codeBits(freq, lengths, n) {
            let bits = 0;
            for (let i = 0; i < n; ++i) if (freq[i]) bits += freq[i] * lengths[i];
            return bits;
        }

        /**
         * Count the symbols actually used in `freq`, stopping at 2 (the point
         * where a canonical code stops being incomplete).
         *
         * @param {Uint32Array|Uint16Array} freq
         * @returns {number} `0`, `1` or `2`.
         */
        function usedAtLeastTwo(freq) {
            let used = 0;
            for (let i = 0; i < freq.length; ++i) {
                if (freq[i] && ++used === 2) return 2;
            }
            return used;
        }

        /**
         * Run-length encode a code-length sequence with the repeat symbols
         * 16 / 17 / 18 (RFC 1951 §3.2.7).
         *
         * @param {Uint8Array} lengths Concatenated literal + distance lengths.
         * @returns {number[]} Flat `[symbol, extra, extraBits]` triples.
         */
        function runLengthEncodeCodeLengths(lengths) {
            const out = [];
            const n = lengths.length;
            let i = 0;
            while (i < n) {
                const value = lengths[i];
                let run = 1;
                while (i + run < n && lengths[i + run] === value) ++run;
                i += run;
                if (value === 0) {
                    while (run >= 11) {
                        const r = run < 138 ? run : 138;
                        out.push(18, r - 11, 7);
                        run -= r;
                    }
                    if (run >= 3) { out.push(17, run - 3, 3); run = 0; }
                    while (run-- > 0) out.push(0, 0, 0);
                } else {
                    out.push(value, 0, 0);
                    let rest = run - 1;
                    while (rest >= 3) {
                        const r = rest < 6 ? rest : 6;
                        out.push(16, r - 3, 2);
                        rest -= r;
                    }
                    while (rest-- > 0) out.push(value, 0, 0);
                }
            }
            return out;
        }

        /**
         * Write a stored block (RFC 1951 §3.2.4): the 3 header bits, padding to
         * the next byte boundary, LEN/NLEN, then the bytes verbatim.
         *
         * @param {BitWriter} w
         * @param {Uint8Array} input
         * @param {number} start Offset of the first byte to store.
         * @param {number} n Bytes to store (`<= 65535`).
         * @param {boolean} final BFINAL flag.
         * @returns {void}
         */
        function writeStoredBlock(w, input, start, n, final) {
            writeBits(w.buf, w.bitPos, final ? 1 : 0);
            w.bitPos += 3;                       // BFINAL + BTYPE = 00
            const o = byteOffset(w.bitPos);
            w.buf[o]     = n & 0xFF;
            w.buf[o + 1] = (n >> 8) & 0xFF;
            w.buf[o + 2] = ~n & 0xFF;
            w.buf[o + 3] = (~n >> 8) & 0xFF;
            if (n) w.buf.set(input.subarray(start, start + n), o + 4);
            w.bitPos = (o + 4 + n) * 8;
        }

        /**
         * Write the buffered tokens with the given literal/length and distance
         * codes (RFC 1951 §3.2.5 symbol layout).
         *
         * @param {BitWriter} w
         * @param {TokenBuffer} tb
         * @param {Uint16Array} litCodes Bit-reversed literal/length codes.
         * @param {Uint8Array} litLengths Literal/length code lengths.
         * @param {Uint16Array} distCodes Bit-reversed distance codes.
         * @param {Uint8Array} distLengths Distance code lengths.
         * @returns {void}
         */
        function writeTokens(w, tb, litCodes, litLengths, distCodes, distLengths) {
            const buf = w.buf;
            const tokens = tb.tokens;
            let p = w.bitPos;
            for (let i = 2 * tb.from, end = 2 * tb.to; i < end; i += 2) {
                const len = tokens[i];
                const value = tokens[i + 1];
                if (len === 0) {
                    writeBits16(buf, p, litCodes[value]);
                    p += litLengths[value];
                    continue;
                }
                const ls = LENGTH_CODE[len];
                writeBits16(buf, p, litCodes[257 + ls]);
                p += litLengths[257 + ls];
                const lextra = LENGTH_EXTRA[ls];
                if (lextra) { writeBits(buf, p, len - LENGTH_BASE[ls]); p += lextra; }
                const ds = distanceCode(value);
                writeBits16(buf, p, distCodes[ds]);
                p += distLengths[ds];
                const dextra = DIST_EXTRA[ds];
                if (dextra) { writeBits16(buf, p, value - DIST_BASE[ds]); p += dextra; }
            }
            writeBits16(buf, p, litCodes[256]);
            w.bitPos = p + litLengths[256];
        }

        /**
         * Emit the buffered tokens as one block, choosing the cheapest of the
         * three RFC 1951 block types by measured bit cost.
         *
         * @param {BitWriter} w
         * @param {TokenBuffer} tb
         * @param {Uint8Array} input Source bytes (a stored block copies from it).
         * @param {boolean} final BFINAL flag.
         * @returns {void}
         */
        function writeBlock(w, tb, input, final) {
            ++tb.litFreq[256];                          // end-of-block symbol

            const n = tb.blockLen;
            const align = (8 - ((w.bitPos + 3) & 7)) & 7;
            const storedCost = n <= 65535 ? 8 * (5 + n) + align : Infinity;

            const fixedCost = 3
                + codeBits(tb.litFreq, FIXED_LIT_LENGTHS, 286)
                + codeBits(tb.distFreq, FIXED_DIST_LENGTHS, 30)
                + tb.extraBits;

            // Dynamic tables (§3.2.7).
            const litTree = buildTree(tb.litFreq, 15);
            const distTree = buildTree(tb.distFreq, 15);
            const hlit = Math.max(257, litTree.t.length);
            const hdist = Math.max(1, distTree.t.length);
            const combined = new u8(hlit + hdist);
            combined.set(litTree.t, 0);
            if (distTree.t.length) combined.set(distTree.t, hlit);
            const litLengths = combined.subarray(0, hlit);
            const distLengths = combined.subarray(hlit);

            const rle = runLengthEncodeCodeLengths(combined);
            const clFreq = new u16(19);
            let clExtra = 0;
            for (let i = 0; i < rle.length; i += 3) {
                ++clFreq[rle[i]];
                clExtra += rle[i + 2];
            }
            const clTree = buildTree(clFreq, 7);
            const clLengths = new u8(19);
            clLengths.set(clTree.t);
            let hclen = 19;
            while (hclen > 4 && !clLengths[CODE_LENGTH_ORDER[hclen - 1]]) --hclen;

            let dynamicCost = 3 + 14 + 3 * hclen
                + codeBits(clFreq, clLengths, 19) + clExtra
                + codeBits(tb.litFreq, litLengths, Math.min(286, hlit))
                + codeBits(tb.distFreq, distLengths, Math.min(30, hdist))
                + tb.extraBits;
            // A one-symbol literal/length or code-length code is INCOMPLETE:
            // §3.2.7 tolerates that only for the distance code, so such a block
            // never takes the dynamic form.
            if (usedAtLeastTwo(tb.litFreq) < 2 || usedAtLeastTwo(clFreq) < 2) dynamicCost = Infinity;

            const best = Math.min(storedCost, fixedCost, dynamicCost);
            ensureBits(w, best + 64);

            if (best === storedCost) {
                writeStoredBlock(w, input, tb.blockStart, n, final);
                return;
            }

            writeBits(w.buf, w.bitPos, final ? 1 : 0);
            if (best === fixedCost) {
                writeBits(w.buf, w.bitPos + 1, 1);      // BTYPE = 01
                w.bitPos += 3;
                writeTokens(w, tb, FIXED_LIT_CODES, FIXED_LIT_LENGTHS, FIXED_DIST_CODES, FIXED_DIST_LENGTHS);
                return;
            }

            writeBits(w.buf, w.bitPos + 1, 2);          // BTYPE = 10
            w.bitPos += 3;
            const buf = w.buf;
            let p = w.bitPos;
            writeBits(buf, p, hlit - 257);
            writeBits(buf, p + 5, hdist - 1);
            writeBits(buf, p + 10, hclen - 4);
            p += 14;
            for (let i = 0; i < hclen; ++i) writeBits(buf, p + 3 * i, clLengths[CODE_LENGTH_ORDER[i]]);
            p += 3 * hclen;
            const clCodes = buildMap(clLengths, clTree.l || 1, 0);
            for (let i = 0; i < rle.length; i += 3) {
                const symbol = rle[i];
                writeBits16(buf, p, clCodes[symbol]);
                p += clLengths[symbol];
                const bits = rle[i + 2];
                if (bits) { writeBits(buf, p, rle[i + 1]); p += bits; }
            }
            w.bitPos = p;
            writeTokens(w, tb,
                buildMap(litLengths, litTree.l || 1, 0), litLengths,
                buildMap(distLengths, distTree.l || 1, 0), distLengths);
        }

        /**
         * Write `input[start..]` as a run of stored blocks of at most 64 KiB
         * (RFC 1951 §3.2.4) — the `level = 0` path, which never calls `lz77`.
         *
         * @param {BitWriter} w
         * @param {Uint8Array} input
         * @param {number} start
         * @param {boolean} final Mark the last block emitted as BFINAL.
         * @returns {void}
         */
        function writeStoredRun(w, input, start, final) {
            const end = input.length;
            if (start >= end) {
                if (final) { ensureBits(w, 48); writeStoredBlock(w, input, start, 0, true); }
                return;
            }
            let pos = start;
            while (pos < end) {
                const n = Math.min(65535, end - pos);
                ensureBits(w, 8 * (n + 5) + 8);
                writeStoredBlock(w, input, pos, n, final && pos + n >= end);
                pos += n;
            }
        }

        /**
         * Compress `input[start..]` into whole DEFLATE bytes, resuming from a
         * partial byte (`carryByte` / `carryBits`) and, unless `final`, leaving
         * the trailing partial byte in the returned carry.
         *
         * @param {Uint8Array} input Window (`[0, start)`) followed by the payload.
         * @param {{start: number, level: number, lazy: boolean, hashBits: number, final: boolean, carryByte: number, carryBits: number}} params
         * @returns {{bytes: Uint8Array, carryByte: number, carryBits: number}}
         */
        function compressBlocks(input, params) {
            const w = { buf: new u8(4096), bitPos: params.carryBits & 7 };
            w.buf[0] = params.carryByte & 0xFF;
            const start = params.start;

            if (params.level === 0) {
                writeStoredRun(w, input, start, params.final);
            } else {
                // One scan of the whole unit into packed `(len | 0, dist | byte)`
                // pairs; the blocks below are windows over that buffer.
                const scan = lz77.encodeTokens(input, {
                    windowBits: WINDOW_BITS,
                    minMatch: MIN_MATCH,
                    maxMatch: MAX_MATCH,
                    hashBits: params.hashBits,
                    start,
                    hashFn: makeHashFn(params.hashBits),
                    lazy: params.lazy,
                    chainSkip: true,
                    ...LEVELS[params.level],
                    tokens: tokenBuffer(2 * Math.max(0, input.length - start)),
                });

                const tb = createTokenBuffer(scan.tokens, start);
                const count = scan.count;
                // Cut the token stream into blocks of BLOCK_TOKENS; the last
                // one closes the unit and carries BFINAL when `final`.
                for (let from = 0; ; from += BLOCK_TOKENS) {
                    const to = Math.min(count, from + BLOCK_TOKENS);
                    const covered = tallyBlock(tb, from, to);
                    if (to === count) {
                        tb.blockLen = input.length - tb.blockStart;
                        writeBlock(w, tb, input, params.final);
                        break;
                    }
                    tb.blockLen = covered;
                    writeBlock(w, tb, input, false);
                    resetTokenBuffer(tb, tb.blockStart + covered);
                }
            }

            if (params.final) {
                return { bytes: slice(w.buf, 0, byteOffset(w.bitPos)), carryByte: 0, carryBits: 0 };
            }
            const whole = w.bitPos >> 3;
            const carryBits = w.bitPos & 7;
            return {
                bytes: slice(w.buf, 0, whole),
                carryByte: carryBits ? w.buf[whole] : 0,
                carryBits,
            };
        }

        // --- Streams ---

        /**
         * Streaming DEFLATE compressor.
         *
         * The concatenation of every `ondata` chunk is ONE valid raw DEFLATE
         * stream; where the chunk boundaries fall is not part of the contract.
         *
         * @param {object|function} [opts] - compression options or `ondata` callback
         * @param {function} [ondata] - callback(chunk: Uint8Array, isFinal: boolean)
         */
        function DeflateStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata;
            this._o = opts || {};
            this._level = clamp(this._o.level ?? 6, 0, 9) | 0;
            const dict = this._o.dictionary;
            this._window = dict && dict.length
                ? slice(dict, Math.max(0, dict.length - WINDOW_SIZE), dict.length)
                : new u8(0);
            this._pending = [];
            this._pendingLen = 0;
            this._carryByte = 0;
            this._carryBits = 0;
            this._done = false;
        }

        /**
         * Compress everything buffered so far, prefixed by the retained window.
         *
         * @param {boolean} final Close the DEFLATE stream with a BFINAL block.
         * @returns {void}
         */
        DeflateStream.prototype._compressPending = function(final) {
            const window = this._window;
            const input = new u8(window.length + this._pendingLen);
            input.set(window);
            let off = window.length;
            for (const chunk of this._pending) { input.set(chunk, off); off += chunk.length; }

            const result = compressBlocks(input, {
                start: window.length,
                level: this._level,
                lazy: this._o.lazy === true,
                hashBits: resolveHashBits(this._o, input.length),
                final,
                carryByte: this._carryByte,
                carryBits: this._carryBits,
            });
            this._carryByte = result.carryByte;
            this._carryBits = result.carryBits;

            this._window = input.length > WINDOW_SIZE
                ? slice(input, input.length - WINDOW_SIZE, input.length)
                : input;
            this._pending = [];
            this._pendingLen = 0;

            if (result.bytes.length > 0 || final) this.ondata(result.bytes, final);
        };

        /**
         * Push a chunk of data.
         * @param {Uint8Array} chunk
         * @param {boolean} [final=false]
         */
        DeflateStream.prototype.push = function(chunk, final) {
            final = !!final;
            if (!this.ondata) fail(5);
            if (this._done) fail(4);
            if (chunk && chunk.length) {
                this._pending.push(chunk);
                this._pendingLen += chunk.length;
            }
            if (final) this._done = true;
            if (final || this._pendingLen >= STREAM_FLUSH_BYTES) this._compressPending(final);
        };

        /**
         * Flush buffered data without finalising. Useful for small inputs.
         *
         * The partial byte, if any, stays in the carry — no byte alignment is
         * forced, so the stream keeps its optimal packing.
         */
        DeflateStream.prototype.flush = function() {
            if (!this.ondata) fail(5);
            if (this._done) fail(4);
            this._compressPending(false);
        };

        /**
         * Streaming DEFLATE decompressor.
         *
         * @param {object|function} [opts]
         * @param {function} [ondata] - callback(chunk: Uint8Array, isFinal: boolean)
         */
        function InflateStream(opts, ondata) {
            if (typeof opts === 'function') { ondata = opts; opts = {}; }
            this.ondata = ondata;
            this._state = createInflateState((opts || {}).dictionary);
            initOutput(this._state, 0, undefined);
            this._pending = new u8(0);
            this._done = false;
        }

        /**
         * Append `chunk` to the input bytes not yet consumed by the decoder.
         *
         * @param {Uint8Array} chunk
         * @returns {void}
         */
        InflateStream.prototype._append = function(chunk) {
            if (!this._pending.length) {
                // @ts-ignore - the caller's view is copied out at the end of push()
                this._pending = chunk;
            } else if (chunk.length) {
                const merged = new u8(this._pending.length + chunk.length);
                merged.set(this._pending);
                merged.set(chunk, this._pending.length);
                this._pending = merged;
            }
        };

        /**
         * Push a chunk of compressed data.
         * @param {Uint8Array} chunk
         * @param {boolean} [final=false]
         */
        InflateStream.prototype.push = function(chunk, final) {
            if (!this.ondata) fail(5);
            if (this._done) fail(4);
            final = !!final;
            this._append(chunk);

            const state = this._state;
            const status = runInflate(state, this._pending, true);
            if (final && status !== COMPLETE) fail(0);
            this._done = final;

            const produced = slice(state.out, state.emitted, state.outLen);
            state.emitted = state.outLen;
            this.ondata(produced, final);

            trimWindow(state);
            // Keep only the bytes after the last consumed BYTE boundary; the
            // decoder resumes at the residual bit offset inside the first one.
            this._pending = slice(this._pending, state.bitPos >> 3);
            state.bitPos &= 7;
        };

        // --- Public API ---

        /**
         * Compress data using DEFLATE.
         *
         * `lazy: true` turns on lazy matching in the `lz77` scan: a better
         * ratio (about −0.7 % bytes at levels 8–9 on the bench corpora) for a
         * slower scan at every level above 3. Off by default — the default
         * is the fast configuration.
         *
         * @param {Uint8Array} data
         * @param {object} [opts] - `{ level?: 0–9, mem?: 0–12, lazy?: boolean, dictionary?: Uint8Array }`
         * @returns {Uint8Array}
         */
        function deflateSync(data, opts = {}) {
            let input = data;
            let start = 0;
            const dict = opts.dictionary;
            if (dict && dict.length) {
                const tail = dict.subarray(Math.max(0, dict.length - WINDOW_SIZE));
                input = new u8(tail.length + data.length);
                input.set(tail);
                input.set(data, tail.length);
                start = tail.length;
            }
            return compressBlocks(input, {
                start,
                level: clamp(opts.level ?? 6, 0, 9) | 0,
                lazy: opts.lazy === true,
                hashBits: resolveHashBits(opts, input.length),
                final: true,
                carryByte: 0,
                carryBits: 0,
            }).bytes;
        }

        /**
         * Decompress raw DEFLATE data (RFC 1951).
         *
         * Without `opts.out` the result is a freshly allocated exact-size
         * copy; with `opts.out` it is a view into the caller's buffer, which
         * overflows with code 8 rather than growing.
         *
         * @param {Uint8Array} data
         * @param {object} [opts] - `{ out?: Uint8Array, dictionary?: Uint8Array }`
         * @returns {Uint8Array}
         */
        function inflateSync(data, opts = {}) {
            if (!data.length) return opts.out ? opts.out.subarray(0, 0) : new u8(0);

            const state = createInflateState(opts.dictionary);
            const dictLen = state.dictionary ? state.dictionary.length : 0;
            initOutput(state, data.length, opts.out);
            runInflate(state, data, false);

            if (state.fixedOut) return state.out.subarray(0, state.outLen);
            if (opts.out) {
                // Dictionary + caller buffer: decoded internally, copy across.
                const produced = state.outLen - dictLen;
                if (produced > opts.out.length) fail(8, 'output exceeds provided buffer');
                opts.out.set(state.out.subarray(dictLen, state.outLen));
                return opts.out.subarray(0, produced);
            }
            return slice(state.out, dictLen, state.outLen);
        }

        // --- Async API (microtask-deferred) ---

        const _mt = typeof queueMicrotask === 'function'
            ? queueMicrotask
            : fn => Promise.resolve().then(fn);

        /**
         * Asynchronously compress data using DEFLATE.
         *
         * @param {Uint8Array} data
         * @param {object} [opts]
         * @returns {Promise<Uint8Array>}
         */
        function deflateAsync(data, opts = {}) {
            return new Promise((resolve, reject) => {
                _mt(() => { try { resolve(deflateSync(data, opts)); } catch (e) { reject(e); } });
            });
        }

        /**
         * Asynchronously decompress raw DEFLATE data.
         *
         * @param {Uint8Array} data
         * @param {object} [opts]
         * @returns {Promise<Uint8Array>}
         */
        function inflateAsync(data, opts = {}) {
            return new Promise((resolve, reject) => {
                _mt(() => { try { resolve(inflateSync(data, opts)); } catch (e) { reject(e); } });
            });
        }

        return {
            deflateSync,
            inflateSync,
            deflate: deflateAsync,
            inflate: inflateAsync,
            // @ts-ignore - function-as-constructor; TS cannot verify compatibility with StreamCtor typedef
            DeflateStream,
            // @ts-ignore - function-as-constructor; TS cannot verify compatibility with StreamCtor typedef
            InflateStream,
        };
    }
};
