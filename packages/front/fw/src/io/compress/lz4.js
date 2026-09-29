// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview LZ4 block codec, written from the LZ4 Block Format
 * specification (block format only: no frame header, no dictionary).
 *
 * A block is a run of *sequences*. Each sequence is a token byte (high
 * nibble = literal count, low nibble = match length minus 4, a nibble of 15
 * continuing in extra bytes that are summed until one is below 255), the
 * literal bytes, then a 2-byte little-endian back-reference offset and the
 * optional match-length extension. The final sequence carries literals only.
 *
 * ## Encoder
 *
 * Every visited position is hashed (multiplicative hash of its 4-byte word)
 * into a bucket table. In 'ratio' mode the bucket entries are linked into
 * per-position chains and a bounded walk keeps the longest candidate inside
 * the 64 KiB window; in 'speed' mode (the default) only the newest entry of
 * the bucket is tried. The match is then widened backwards over the pending
 * literals. The spec's end-of-block rules are enforced by construction: no
 * match starts in the last 12 bytes and no match covers the last 5.
 *
 * ## Decoder
 *
 * Two passes over the block: the first validates every sequence (truncation,
 * offset 0, offset beyond the bytes decoded so far) and sums the decoded
 * size, so the output is allocated once at its exact size and the size-limit
 * check happens before any allocation; the second copies.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `compress(src, len, opts?)` | `[size, data]` - `[0, copy]` when no match is emitted, `[-1, src]` past the size limit; `opts.mode` 'speed' (default) or 'ratio' |
 * | `decompress(src)` | `[size, data]` - `[-1, src]` on a malformed block |
 * | `new Lz4CompressStream(ondata, opts?)` | one independent block per `push`, `opts` as for `compress` |
 * | `new Lz4DecompressStream(ondata)` | one independent block per `push` |
 */

/**
 * LZ4 compression/decompression surface returned by `factory()`.
 * @typedef {object} Lz4API
 * @property {(src: Uint8Array, len: number, opts?: { mode?: 'speed'|'ratio' }) => [number, Uint8Array]} compress - Compress data; returns `[compressed_size, compressed_data]` (`[0, original]` if incompressible, `[-1, original]` on size-limit error). `opts.mode`: 'speed' (default) or 'ratio' (smaller blocks, slower encode); any other value throws a RangeError.
 * @property {(src: Uint8Array) => [number, Uint8Array]} decompress - Decompress data; returns `[decompressed_size, decompressed_data]` (`[-1, compressed]` on error).
 * @property {new (ondata: (chunk: Uint8Array, isFinal: boolean) => void, opts?: { mode?: 'speed'|'ratio' }) => {ondata: ((chunk: Uint8Array, isFinal: boolean) => void)|null, push: (chunk: Uint8Array, final?: boolean) => void}} Lz4CompressStream - Streaming LZ4 compressor constructor; `opts` as for `compress`.
 * @property {new (ondata: (chunk: Uint8Array, isFinal: boolean) => void) => {ondata: ((chunk: Uint8Array, isFinal: boolean) => void)|null, push: (chunk: Uint8Array, final?: boolean) => void}} Lz4DecompressStream - Streaming LZ4 decompressor constructor.
 */

export const lz4 = {
    name: 'lz4',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: [],

    /** @returns {Lz4API} */
    factory() {

        // --- Limits ---
        /** Largest input `compress` accepts and largest output `decompress` produces (~1 GB). */
        const MAX_INPUT = 0x3F000000;

        // --- LZ4 Block Format constants ---
        const MIN_MATCH = 4;          // a match nibble of 0 means 4 bytes
        const LAST_LITERALS = 5;      // the last 5 bytes of a block are literals
        const MATCH_LIMIT = 12;       // the last match starts >= 12 bytes before the end
        const MAX_OFFSET = 65535;     // 2-byte offset, 0 is invalid
        const NIBBLE_MAX = 15;        // a nibble of 15 continues in extension bytes
        const EXT_MAX = 255;          // an extension byte of 255 continues the sum

        // --- Encoder tuning ---
        const HASH_BITS_MAX = 16;
        const HASH_BITS_MIN = 8;
        const WINDOW_MASK = 0xFFFF;   // chain slots, indexed by position modulo 64 KiB
        const GOOD_ENOUGH = 32;       // a match this long ends the walk
        const LONG_RUN = 16;          // match bytes compared one by one before switching to 4-byte words

        const HASH_MUL = -1640531535; // 2654435761 as int32 (Knuth multiplicative constant)

        // --- Modes ---
        //
        // The two modes run the same encoder and differ only in how hard it
        // searches. `probes` is the number of candidates visited per
        // position: with more than one, the bucket entries are linked into
        // per-position chains; with one, only the newest entry of a bucket is
        // ever looked at, so no chain is kept at all. `covered` is how many of
        // the last positions inside an emitted match are hashed back into the
        // tables (0 = none: the search resumes on positions it indexed
        // itself). `skipShift`: after 2^skipShift straight misses, positions
        // are sampled every 2nd, 3rd, ... byte. 'speed' visits one candidate,
        // indexes nothing inside matches and starts skipping after 32 misses;
        // 'ratio' walks a chain of four, indexes the last three covered
        // positions and waits 64 misses. Both keep the backward widening,
        // which alone keeps 'speed' at or below the size of the previous
        // encoder on every bench corpus.
        const MODES = {
            speed: { probes: 1, covered: 0, skipShift: 5 },
            ratio: { probes: 4, covered: 3, skipShift: 6 },
        };

        /**
         * Encoder settings for `opts.mode` ('speed' when absent).
         * @param {{ mode?: string }|undefined} opts
         * @returns {{ probes: number, covered: number, skipShift: number }}
         * @throws {RangeError} when `opts.mode` is neither 'speed' nor 'ratio'.
         */
        function settingsOf(opts) {
            const mode = opts == null || opts.mode === undefined ? 'speed' : opts.mode;
            if (mode !== 'speed' && mode !== 'ratio') {
                throw new RangeError("lz4: unknown compress mode '" + String(mode) + "' (expected 'speed' or 'ratio')");
            }
            return MODES[mode];
        }

        /**
         * Little-endian 32-bit word at `p` (as int32).
         * @param {Uint8Array} b
         * @param {number} p
         * @returns {number}
         */
        function word32(b, p) {
            return b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24);
        }

        /**
         * Write a length that overflowed its nibble: `rest` more units as
         * 255-bytes followed by one byte below 255.
         * @param {Uint8Array} out
         * @param {number} at
         * @param {number} rest Length minus 15.
         * @returns {number} New write position.
         */
        function putExtension(out, at, rest) {
            while (rest >= EXT_MAX) {
                out[at++] = EXT_MAX;
                rest -= EXT_MAX;
            }
            out[at++] = rest;
            return at;
        }

        /**
         * Fresh copy of `src[0, n)` (never a view: `Buffer#slice` would alias).
         * @param {Uint8Array} src
         * @param {number} n
         * @returns {Uint8Array}
         */
        function copyOf(src, n) {
            const copy = new Uint8Array(n);
            copy.set(src.subarray(0, n));
            return copy;
        }

        /**
         * Encode `src[0, len)` as one LZ4 block.
         *
         * @param {Uint8Array} src
         * @param {number} len Number of bytes of `src` to encode.
         * @param {{ mode?: 'speed'|'ratio' }} [opts] `mode`: 'speed' (default)
         *   or 'ratio' (a deeper search for a smaller block, slower to encode).
         * @returns {[number, Uint8Array]} `[size, block]`; `[0, copy]` when the
         *   encoder emits no match; `[-1, src]` when `len` exceeds the limit.
         * @throws {RangeError} when `opts.mode` is neither 'speed' nor 'ratio'.
         */
        function compress(src, len, opts) {
            const { probes, covered, skipShift } = settingsOf(opts);
            return encodeBlock(src, len, probes, covered, skipShift);
        }

        /**
         * The encoder behind both modes.
         *
         * @param {Uint8Array} src
         * @param {number} len
         * @param {number} chainProbes Candidates visited per position (1 = no chains).
         * @param {number} covered Positions indexed at the end of each match
         *   (must be 0 when `chainProbes` is 1: there is no chain to link them into).
         * @param {number} skipShift Misses before the stride starts growing, as a power of 2.
         * @returns {[number, Uint8Array]}
         */
        function encodeBlock(src, len, chainProbes, covered, skipShift) {
            if (len > MAX_INPUT) return [-1, src];
            const n = len;
            // Below 13 bytes no match can satisfy the end-of-block rules.
            if (n <= MATCH_LIMIT) return [0, copyOf(src, n)];

            const lastStart = n - MATCH_LIMIT;       // inclusive: last position a match may start at
            const endLimit = n - LAST_LITERALS;      // exclusive: a match may not reach past this

            let hashBits = HASH_BITS_MIN;
            while (hashBits < HASH_BITS_MAX && (1 << hashBits) < n) hashBits++;
            const shift = 32 - hashBits;
            // Both tables hold `position + 1`; 0 marks an empty slot.
            const chained = chainProbes > 1;
            const buckets = new Int32Array(1 << hashBits);
            const links = new Int32Array(chained ? Math.min(n, WINDOW_MASK + 1) : 0);

            const out = new Uint8Array(n + ((n / EXT_MAX) | 0) + 16);
            let op = 0;
            let anchor = 0;                          // first literal not yet written
            let emitted = false;
            let misses = 0;                          // consecutive positions without a match
            let i = 0;

            while (i <= lastStart) {
                const w = word32(src, i);
                const h = Math.imul(w, HASH_MUL) >>> shift;

                // Walk the chain of this bucket, newest first.
                let bestLen = 0, bestAt = 0;
                const room = endLimit - i;
                let probes = chainProbes;
                let at = buckets[h] - 1;
                while (at >= 0 && probes-- > 0) {
                    if (i - at > MAX_OFFSET) break;
                    if (src[at + bestLen] === src[i + bestLen] && word32(src, at) === w) {
                        // Extend the match. Most matches end within a few
                        // bytes, where a byte loop is cheapest; a candidate
                        // that survives LONG_RUN bytes is likely a long run,
                        // and there comparing whole 4-byte words cuts the loop
                        // count by four (the length found is the same: the
                        // byte loop finishes whatever the word loop leaves).
                        let m = MIN_MATCH;
                        while (m < LONG_RUN && m < room && src[at + m] === src[i + m]) m++;
                        if (m === LONG_RUN) {
                            while (m + 4 <= room && word32(src, at + m) === word32(src, i + m)) m += 4;
                            while (m < room && src[at + m] === src[i + m]) m++;
                        }
                        if (m > bestLen) {
                            bestLen = m;
                            bestAt = at;
                            if (m >= GOOD_ENOUGH || m >= room) break;
                        }
                    }
                    if (probes === 0) break;         // never read a link that is not followed
                    at = links[at & WINDOW_MASK] - 1;
                }
                if (chained) links[i & WINDOW_MASK] = buckets[h];
                buckets[h] = i + 1;

                if (bestLen === 0) {
                    // Incompressible stretch: stride grows with the misses.
                    i += 1 + (misses++ >>> skipShift);
                    continue;
                }
                misses = 0;

                // Widen the match backwards over pending literals.
                let start = i;
                let from = bestAt;
                while (start > anchor && from > 0 && src[start - 1] === src[from - 1]) {
                    start--;
                    from--;
                }
                const matchEnd = i + bestLen;
                const litLen = start - anchor;
                const matchLen = matchEnd - start;
                const offset = start - from;

                // Token, literal-length extension, literals.
                const tokenAt = op++;
                const litNib = litLen < NIBBLE_MAX ? litLen : NIBBLE_MAX;
                if (litLen >= NIBBLE_MAX) op = putExtension(out, op, litLen - NIBBLE_MAX);
                // Literal runs between matches are short, and a plain byte loop
                // beats `set(subarray(...))` on them: the subarray is a fresh
                // view object per sequence (a Buffer one when `src` is a Buffer),
                // and that allocation outweighs the copy it saves. On the bench
                // corpora the loop cut up to a third of the encode time on
                // short-literal input (json) and cost nothing measurable elsewhere.
                for (let k = anchor; k < start; k++) out[op++] = src[k];
                // Offset (little-endian), match-length extension.
                out[op++] = offset & 0xFF;
                out[op++] = offset >>> 8;
                const lenCode = matchLen - MIN_MATCH;
                const matchNib = lenCode < NIBBLE_MAX ? lenCode : NIBBLE_MAX;
                if (lenCode >= NIBBLE_MAX) op = putExtension(out, op, lenCode - NIBBLE_MAX);
                out[tokenAt] = (litNib << 4) | matchNib;
                emitted = true;

                // Index the last `covered` positions the match covered (never
                // `i` again), then resume after it.
                const indexEnd = matchEnd - 1 < lastStart ? matchEnd - 1 : lastStart;
                const indexFrom = indexEnd - covered + 1;
                for (let p = indexFrom > i ? indexFrom : i + 1; p <= indexEnd; p++) {
                    const hp = Math.imul(word32(src, p), HASH_MUL) >>> shift;
                    links[p & WINDOW_MASK] = buckets[hp];
                    buckets[hp] = p + 1;
                }
                i = matchEnd;
                anchor = matchEnd;
            }

            if (!emitted) return [0, copyOf(src, n)];

            // Final sequence: the remaining literals, no offset.
            const tail = n - anchor;
            const tokenAt = op++;
            if (tail >= NIBBLE_MAX) op = putExtension(out, op, tail - NIBBLE_MAX);
            out[tokenAt] = (tail < NIBBLE_MAX ? tail : NIBBLE_MAX) << 4;
            out.set(src.subarray(anchor, n), op);
            op += tail;

            // Matches too sparse to pay for their tokens and offsets: the
            // encoder keeps none of them, and the input stands as is.
            if (op >= n) return [0, copyOf(src, n)];

            return [op, out.slice(0, op)];
        }

        /**
         * Decode one LZ4 block.
         *
         * @param {Uint8Array} src
         * @returns {[number, Uint8Array]} `[size, data]`, or `[-1, src]` when
         *   the block is malformed (truncated sequence or extension, offset 0,
         *   offset beyond the bytes decoded so far).
         * @throws {Error} `'Decompression exceeds maximum size limit'` when the
         *   decoded size would exceed ~1 GB (checked before allocating).
         */
        function decompress(src) {
            const n = src.length;
            if (n === 0) return [0, new Uint8Array(0)];

            // Pass 1: validate every sequence and sum the decoded size.
            let ip = 0;
            let total = 0;
            while (ip < n) {
                const token = src[ip++];
                let lit = token >>> 4;
                if (lit === NIBBLE_MAX) {
                    let b;
                    do {
                        if (ip >= n) return [-1, src];
                        b = src[ip++];
                        lit += b;
                    } while (b === EXT_MAX);
                }
                if (lit > n - ip) return [-1, src];
                ip += lit;
                total += lit;
                if (total > MAX_INPUT) throw new Error('Decompression exceeds maximum size limit');
                if (ip === n) break;                 // literal-only final sequence

                if (n - ip < 2) return [-1, src];
                const offset = src[ip] | (src[ip + 1] << 8);
                ip += 2;
                if (offset === 0 || offset > total) return [-1, src];
                let ml = token & NIBBLE_MAX;
                if (ml === NIBBLE_MAX) {
                    let b;
                    do {
                        if (ip >= n) return [-1, src];
                        b = src[ip++];
                        ml += b;
                    } while (b === EXT_MAX);
                }
                total += ml + MIN_MATCH;
                if (total > MAX_INPUT) throw new Error('Decompression exceeds maximum size limit');
            }

            // Pass 2: the block is known valid; copy into an exact-size buffer.
            const out = new Uint8Array(total);
            ip = 0;
            let op = 0;
            while (ip < n) {
                const token = src[ip++];
                let lit = token >>> 4;
                if (lit === NIBBLE_MAX) {
                    let b;
                    do { b = src[ip++]; lit += b; } while (b === EXT_MAX);
                }
                // Byte loop for the literals, as in the encoder: a view per
                // sequence costs more than the short copies it would replace.
                for (const stop = ip + lit; ip < stop;) out[op++] = src[ip++];
                if (ip === n) break;

                const offset = src[ip] | (src[ip + 1] << 8);
                ip += 2;
                let ml = token & NIBBLE_MAX;
                if (ml === NIBBLE_MAX) {
                    let b;
                    do { b = src[ip++]; ml += b; } while (b === EXT_MAX);
                }
                ml += MIN_MATCH;
                let from = op - offset;
                if (offset >= ml && ml > 32) {
                    out.copyWithin(op, from, from + ml);
                    op += ml;
                } else {
                    // Byte by byte: an overlapping match (offset < length)
                    // re-reads bytes it has just written.
                    for (const stop = op + ml; op < stop;) out[op++] = out[from++];
                }
            }
            return [total, out];
        }

        /** Streaming compressor: each `push` is compressed as one independent block. */
        class Lz4CompressStream {
            /**
             * Checked at construction, so a bad mode throws before any push.
             * @type {{ mode: 'speed'|'ratio' }}
             */
            #opts;

            /**
             * @param {(chunk: Uint8Array, isFinal: boolean) => void} ondata
             * @param {{ mode?: 'speed'|'ratio' }} [opts] Same as `compress`.
             * @throws {RangeError} when `opts.mode` is neither 'speed' nor 'ratio'.
             */
            constructor(ondata, opts) {
                this.#opts = { mode: settingsOf(opts) === MODES.ratio ? 'ratio' : 'speed' };
                this.ondata = typeof ondata === 'function' ? ondata : null;
            }

            /**
             * Compress `chunk` and forward the block (or the raw chunk when the
             * result is not a block) to `ondata`.
             * @param {Uint8Array} chunk
             * @param {boolean} [final]
             */
            push(chunk, final) {
                const [size, data] = compress(chunk, chunk.length, this.#opts);
                if (this.ondata) this.ondata(size > 0 ? data : chunk, !!final);
            }
        }

        /** Streaming decompressor: each `push` is decoded as one independent block. */
        class Lz4DecompressStream {
            /** @param {(chunk: Uint8Array, isFinal: boolean) => void} ondata */
            constructor(ondata) {
                this.ondata = typeof ondata === 'function' ? ondata : null;
            }

            /**
             * Decode `chunk` as one block and forward the result to `ondata`.
             * @param {Uint8Array} chunk
             * @param {boolean} [final]
             * @throws {Error} `'lz4 decompression error'` on a malformed block.
             */
            push(chunk, final) {
                const [size, data] = decompress(chunk);
                if (size < 0) throw new Error('lz4 decompression error');
                if (this.ondata) this.ondata(data, !!final);
            }
        }

        return { compress, decompress, Lz4CompressStream, Lz4DecompressStream };
    }
};
