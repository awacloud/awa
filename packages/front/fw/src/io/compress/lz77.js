// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Lempel-Ziv 77 - hash-chain string-match encoder.
 *
 * Generic LZ77 primitive consumed by codecs that emit `(literal | <length,
 * distance>)` token streams (e.g. DEFLATE, Brotli). Implementation is a
 * classic hash-chain scanner with configurable:
 *
 * - **windowBits** - log2 of the sliding window (max backward distance).
 * - **minMatch** - shortest accepted match length (3 for DEFLATE, 4 for
 *   Brotli). Determines the hash key length.
 * - **maxMatch** - longest match length the encoder will report.
 * - **chainDepth** - maximum hash-chain probes per position. Higher
 *   values trade speed for ratio.
 * - **niceLength** - a match this long ends the search at a position.
 * - **lazy** - if true, on every match also probe the next position and
 *   prefer the next match if it is strictly longer ("lazy matching"),
 *   throttled by **goodLength** / **maxLazy** (zlib semantics).
 * - **chainSkip** - walk heuristic that follows the sparsest chain inside
 *   the current best match instead of the position's own chain.
 *
 * The scan runs once, in `encodeTokens`, and packs the token stream as
 * `(len|0, dist|byte)` pairs into an `Int32Array`; `encode` replays that
 * stream through two callbacks (`literal(pos)`, `match(pos, len, dist)`).
 * Both accept `opts.tokens` to reuse a caller-owned buffer.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `encode(data, opts, callbacks)` | `void` - drives the scan, reports via callbacks |
 * | `encodeTokens(data, opts)` | `{ tokens, count }` - packed token pairs |
 * | `findMatch(data, pos, head, prev, opts)` | `{ len, dist } \| null` - single-position probe |
 *
 * ## Hash function
 *
 * Knuth-style multiplicative hash over the first `minMatch` bytes (3 or
 * 4), folded to `hashBits`. `opts.hashFn` replaces it; its result is
 * masked to `hashBits` internally.
 */

/**
 * Public surface of `lz77.factory()`.
 * @typedef {object} Lz77API
 * @property {(data: Uint8Array, opts: object, callbacks: { literal: (pos: number) => void, match: (pos: number, len: number, dist: number) => void }) => void} encode Run the hash-chain encoder, reporting tokens via callbacks.
 * @property {(data: Uint8Array, opts?: object) => { tokens: Int32Array, count: number }} encodeTokens Callback-free fast path: same token sequence as `encode`, packed as `(len|0, dist|byte)` pairs into an `Int32Array`.
 * @property {(data: Uint8Array, pos: number, head: Int32Array, prev: Int32Array, opts: object) => ({ len: number, dist: number } | null)} findMatch Single-position match probe.
 * @property {(dst: Uint8Array, ops: Array<{ lit?: number, pos?: number, len?: number, dist?: number }>) => number} decodeStream Replay a token stream into `dst`; returns bytes written.
 * @property {{ windowBits: number, minMatch: number, maxMatch: number, chainDepth: number, lazy: boolean, hashBits: number, niceLength: number, goodLength: number, maxLazy: number, chainSkip: boolean, start: number, hashFn: (((data: Uint8Array, pos: number) => number) | null) }} DEFAULT Frozen default option set.
 */

export const lz77 = {
    name: 'lz77',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: [],

    /** @returns {Lz77API} */
    factory() {

        const u8  = Uint8Array;
        const i32 = Int32Array;

        const DEFAULT = Object.freeze({
            windowBits: 16,
            minMatch: 4,
            maxMatch: 258,
            chainDepth: 16,
            lazy: false,
            hashBits: 17,
            niceLength: 258,   // a match this long ends the search at a position
            goodLength: 258,   // lazy: probe with a quarter of the chain once the current match is this long
            maxLazy: 258,      // lazy: no probe at all once the current match is this long (capped at niceLength)
            chainSkip: false,  // walk heuristic: continue on the sparsest chain inside the new best match
            start: 0,          // positions [0, start) prime the hash chains and are never emitted
            hashFn: null,      // (data, pos) => integer — replaces the built-in hasher when given
        });

        // Knuth-style multiplicative constants
        const _M1 = 506832829, _M2 = 982451653, _M3 = 1610612741, _M4 = 805306457;

        function _resolveOpts(opts) {
            opts = opts || {};
            const minMatch = Math.max(opts.minMatch ?? DEFAULT.minMatch, 3);
            const maxMatch = opts.maxMatch ?? DEFAULT.maxMatch;
            const niceLength = Math.min(Math.max(opts.niceLength ?? maxMatch, minMatch), maxMatch);
            return {
                windowBits: Math.min(opts.windowBits ?? DEFAULT.windowBits, 24),
                minMatch,
                maxMatch,
                chainDepth: Math.max(opts.chainDepth ?? DEFAULT.chainDepth, 1),
                lazy:       opts.lazy       ?? DEFAULT.lazy,
                hashBits:   Math.min(opts.hashBits ?? DEFAULT.hashBits, 22),
                niceLength,
                goodLength: Math.min(opts.goodLength ?? DEFAULT.goodLength, maxMatch),
                // A match the search was content with is never re-probed.
                maxLazy:    Math.min(opts.maxLazy ?? DEFAULT.maxLazy, niceLength),
                chainSkip:  opts.chainSkip  ?? DEFAULT.chainSkip,
                start:      Math.max(0, opts.start | 0),
                hashFn:     typeof opts.hashFn === 'function' ? opts.hashFn : null,
            };
        }

        /**
         * Position hasher for a resolved option set, as `(data, i) => bucket`.
         * Built once per scan and called straight from the loop, so `data`
         * travels as an argument rather than through a per-call closure.
         *
         * @param {object} o Resolved options.
         * @returns {(data: Uint8Array, i: number) => number}
         */
        function _hasherFor(o) {
            const mask = (1 << o.hashBits) - 1;
            const shift = 32 - o.hashBits;
            const fn = o.hashFn;
            if (fn) return function hashInjected(data, i) { return fn(data, i) & mask; };
            if (o.minMatch <= 3) {
                return function hash3(data, i) {
                    let h = (data[i] * _M1) >>> 0;
                    h = (h ^ (data[i + 1] * _M2)) >>> 0;
                    h = (h ^ (data[i + 2] * _M3)) >>> 0;
                    return (h >>> shift) & mask;
                };
            }
            return function hash4(data, i) {
                let h = (data[i] * _M1) >>> 0;
                h = (h ^ (data[i + 1] * _M2)) >>> 0;
                h = (h ^ (data[i + 2] * _M3)) >>> 0;
                h = (h ^ (data[i + 3] * _M4)) >>> 0;
                return (h >>> shift) & mask;
            };
        }

        /**
         * Distance of the match reported by the last `_longestMatch` call that
         * returned a non-zero length. A side channel on purpose: the probe
         * runs once per input position and returning `{ len, dist }` would
         * allocate one object per match — measured at −15 % scan time on a
         * 256 KiB text corpus when removed, together with the hoisted
         * options. Read it immediately after the call, never later.
         */
        let matchDist = 0;

        /**
         * Walk the hash chain of bucket `h` and return the longest match at
         * `pos` that is STRICTLY longer than `atLeast`, or 0 when there is
         * none; the distance of a reported match is left in `matchDist`.
         *
         * @param {Uint8Array} data
         * @param {number} pos Position being matched.
         * @param {number} h Hash bucket of `pos` (`head[h]` starts the chain).
         * @param {Int32Array} head Bucket → newest position.
         * @param {Int32Array} prev Position (masked) → previous position of the same bucket.
         * @param {number} wndSize Sliding-window size.
         * @param {number} wndMask `wndSize - 1`.
         * @param {number} maxLen Longest match `pos` can hold (`maxMatch`, capped by the input end).
         * @param {number} niceLength A match this long ends the walk.
         * @param {number} chainDepth Maximum candidates visited.
         * @param {boolean} chainSkip Enable the chain-skip walk (see below).
         * @param {number} atLeast Length the result must exceed.
         * @returns {number} Match length, or 0.
         */
        function _longestMatch(data, pos, h, head, prev, wndSize, wndMask, maxLen, niceLength, chainDepth, chainSkip, atLeast) {
            // A floor already at the nice or maximum length cannot be beaten
            // — the lazy re-probe of a full-length match hits this every time.
            if (atLeast >= niceLength || atLeast >= maxLen) return 0;
            const first = data[pos], second = data[pos + 1];
            let best = atLeast, bestDist = 0;
            // The walk follows the chain of position `pos + align` and derives
            // each candidate as `link - align`; it starts on pos's own chain.
            let link = head[h], align = 0;
            let probes = chainDepth;
            while (link !== -1 && probes-- > 0) {
                const cand = link - align;
                if (cand < 0 || pos - cand >= wndSize) break;   // chains only get older: nothing left in the window
                // Cheap rejection (zlib order): the bytes at and just before
                // the current best length, then the first two bytes.
                if (data[cand + best] === data[pos + best] && data[cand + best - 1] === data[pos + best - 1] &&
                    data[cand] === first && data[cand + 1] === second) {
                    let m = 0;
                    while (m < maxLen && data[cand + m] === data[pos + m]) ++m;
                    if (m > best) {
                        best = m;
                        bestDist = pos - cand;
                        if (m >= niceLength || m >= maxLen) break;
                        // Chain skip: every position `cand + j` inside the new
                        // best match carries the same bytes as `pos + j`, so a
                        // longer match is reachable from any of their chains,
                        // and the one with the widest first step back skips
                        // the densest stretch of near-duplicate candidates.
                        // Measured on the 256 KiB JSON corpus at level 8:
                        // 749 K full comparisons → 188 K, 25.8 ms → 21.1 ms.
                        // A position absent from every chain (`prev` = -1)
                        // is not followed — it would end the walk early.
                        if (chainSkip) {
                            let widest = 0;
                            for (let j = 0, n = Math.min(bestDist, m - 2); j < n; ++j) {
                                const at = cand + j;
                                const back = prev[at & wndMask];
                                if (back === -1) continue;
                                const gap = at - back;
                                if (gap > widest) { widest = gap; link = at; align = j; }
                            }
                        }
                    }
                }
                link = prev[link & wndMask];
            }
            if (bestDist === 0) return 0;
            matchDist = bestDist;
            return best;
        }

        /**
         * Find the best match starting at `pos` against a hash chain built by
         * the caller.
         *
         * @param {Uint8Array} data
         * @param {number} pos
         * @param {Int32Array} head
         * @param {Int32Array} prev
         * @param {object} opts See `DEFAULT`.
         * @returns {{ len: number, dist: number } | null} A match of length
         *   >= `minMatch`, or `null`.
         */
        function findMatch(data, pos, head, prev, opts) {
            const o = _resolveOpts(opts);
            if (pos + o.minMatch > data.length) return null;
            const wndSize = 1 << o.windowBits;
            const hash = _hasherFor(o);
            const maxLen = Math.min(o.maxMatch, data.length - pos);
            const len = _longestMatch(data, pos, hash(data, pos), head, prev, wndSize, wndSize - 1,
                maxLen, o.niceLength, o.chainDepth, o.chainSkip, o.minMatch - 1);
            return len ? { len, dist: matchDist } : null;
        }

        /**
         * Run the hash-chain encoder over `data` and report every token
         * through the callbacks, in input order. Scans with `encodeTokens`
         * and replays its buffer: pass `opts.tokens` to reuse one across calls.
         *
         * @param {Uint8Array} data
         * @param {object} opts See `DEFAULT`.
         * @param {{literal: (pos:number) => void, match: (pos:number, len:number, dist:number) => void}} callbacks
         * @throws {Error} When `data` is not a `Uint8Array` or a callback is missing.
         */
        function encode(data, opts, callbacks) {
            if (!(data instanceof u8)) throw new Error('lz77.encode: data must be Uint8Array');
            const onLit = callbacks.literal;
            const onMatch = callbacks.match;
            if (typeof onLit !== 'function' || typeof onMatch !== 'function') {
                throw new Error('lz77.encode: callbacks.literal and callbacks.match required');
            }
            const { tokens, count } = encodeTokens(data, opts);
            let pos = _resolveOpts(opts).start;
            for (let k = 0, p = 0; k < count; ++k, p += 2) {
                const len = tokens[p];
                if (len === 0) { onLit(pos); pos += 1; }
                else { onMatch(pos, len, tokens[p + 1]); pos += len; }
            }
        }

        /**
         * Scan `data` and pack its token stream as `(len|0, dist|byte)` pairs
         * into an `Int32Array`: `tokens[2k] === 0` marks a literal whose byte
         * is `tokens[2k + 1]`, otherwise the pair is a match length and its
         * distance.
         *
         * @param {Uint8Array} data
         * @param {object} [opts] See `DEFAULT`; `opts.tokens` (Int32Array)
         *   is reused when it holds `2 × (data.length - start)` entries.
         * @returns {{ tokens: Int32Array, count: number }} `count` token
         *   pairs are valid at `tokens[0 .. 2*count)`.
         * @throws {Error} When `data` is not a `Uint8Array` or `opts.tokens` is too small.
         */
        function encodeTokens(data, opts) {
            if (!(data instanceof u8)) throw new Error('lz77.encodeTokens: data must be Uint8Array');
            const o = _resolveOpts(opts);
            const len = data.length;
            const cap = 2 * Math.max(0, len - o.start);

            const provided = opts && opts.tokens;
            let tokens;
            if (provided) {
                if (provided.length < cap) throw new Error('lz77.encodeTokens: tokens buffer too small');
                tokens = provided;
            } else {
                tokens = new i32(cap);
            }

            let p = 0;
            if (o.start >= len) return { tokens, count: 0 };

            // Every option the loop reads, as a local.
            const maxMatch = o.maxMatch, niceLength = o.niceLength, chainDepth = o.chainDepth;
            const lazy = o.lazy, goodLength = o.goodLength, maxLazy = o.maxLazy, chainSkip = o.chainSkip;
            const wndSize = 1 << o.windowBits;
            const wndMask = wndSize - 1;
            const head = new i32(1 << o.hashBits).fill(-1);
            // One chain link per input position, capped at the window: a
            // short input never touches the higher slots.
            const prev = new i32(Math.min(wndSize, len)).fill(-1);
            const hash = _hasherFor(o);
            /** Last position with a complete hash key (inclusive). */
            const lastKey = len - o.minMatch;
            /** Floor of the first probe at a position: a match must exceed it. */
            const atLeast = o.minMatch - 1;

            // Prime the chains with [0, start): never emitted, still matchable.
            for (let k = 0; k < o.start && k <= lastKey; ++k) {
                const h = hash(data, k);
                prev[k & wndMask] = head[h];
                head[h] = k;
            }

            let i = o.start;
            while (i <= lastKey) {
                const h = hash(data, i);
                let matchLen = _longestMatch(data, i, h, head, prev, wndSize, wndMask,
                    Math.min(maxMatch, len - i), niceLength, chainDepth, chainSkip, atLeast);
                let dist = matchDist;
                // Insert `i` now: every path below needs it in the chain before
                // moving on, and the lazy probe at `i + 1` must be able to reach it.
                prev[i & wndMask] = head[h];
                head[h] = i;

                if (matchLen === 0) {
                    tokens[p++] = 0;
                    tokens[p++] = data[i];
                    i++;
                    continue;
                }

                if (lazy && matchLen < maxLazy && i < lastKey) {
                    // Probe `i + 1` and prefer it when strictly longer; a
                    // match that is already "good" only gets a quarter of
                    // the chain (at least one probe).
                    const h1 = hash(data, i + 1);
                    const nextLen = _longestMatch(data, i + 1, h1, head, prev, wndSize, wndMask,
                        Math.min(maxMatch, len - i - 1), niceLength,
                        matchLen >= goodLength ? (chainDepth >> 2) || 1 : chainDepth, chainSkip, matchLen);
                    if (nextLen) {
                        tokens[p++] = 0;
                        tokens[p++] = data[i];
                        i++;
                        matchLen = nextLen;
                        dist = matchDist;
                        // The match now starts at `i`: insert it like any other
                        // match start so later probes can reach it.
                        prev[i & wndMask] = head[h1];
                        head[h1] = i;
                    }
                }

                tokens[p++] = matchLen;
                tokens[p++] = dist;
                const end = i + matchLen;
                for (let k = i + 1; k < end && k <= lastKey; ++k) {
                    const hk = hash(data, k);
                    prev[k & wndMask] = head[hk];
                    head[hk] = k;
                }
                i = end;
            }
            // Tail: the last `minMatch - 1` bytes cannot form a hash key.
            while (i < len) {
                tokens[p++] = 0;
                tokens[p++] = data[i];
                i++;
            }
            return { tokens, count: p / 2 };
        }

        /**
         * Convenience: decode a literal/match stream back into the
         * original bytes. Mostly used for testing the encoder.
         *
         * @param {Uint8Array} dst - preallocated output buffer
         * @param {Array<{lit?:number,pos?:number,len?:number,dist?:number}>} ops
         * @returns {number} Bytes written.
         */
        function decodeStream(dst, ops) {
            let p = 0;
            for (const op of ops) {
                if ('lit' in op) {
                    dst[p++] = op.lit;
                } else {
                    for (let k = 0; k < op.len; ++k) {
                        dst[p] = dst[p - op.dist];
                        p++;
                    }
                }
            }
            return p;
        }

        return {
            encode,
            encodeTokens,
            findMatch,
            decodeStream,
            DEFAULT,
        };
    }
};
