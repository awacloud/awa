// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Canonical prefix codes: code lengths from symbol
 * frequencies, and encode/decode tables from code lengths.
 *
 * Both DEFLATE (RFC 1951 §3.2.2) and Brotli (RFC 7932 §3.2) describe a
 * prefix code by its per-symbol code lengths alone; the codes themselves
 * follow from the canonical rule - shorter codes first, equal lengths in
 * increasing symbol order, consecutive values within a length.
 *
 * - `buildMap` applies that rule. Codes are sent most-significant bit
 *   first (RFC 1951 §3.1.1) while every other field travels LSB-first, so
 *   the encode map stores each code already mirrored over its own length
 *   (one `writeBits` call emits it), and the decode table is indexed by the
 *   next `maxBits` stream bits exactly as `readBits` returns them.
 * - `buildTree` chooses the lengths: an optimal code under a maximum length,
 *   computed with the package-merge algorithm (Larmore & Hirschberg, 1990).
 *   It minimises `sum(freq[s] * len[s])` over every prefix code whose lengths
 *   stay within `maxBits`, so no separate "shorten the deep branches" pass
 *   exists, and frequencies are plain numbers with no ceiling. A plain
 *   two-queue Huffman pass runs first: when its deepest code already fits in
 *   `maxBits` it is that same optimal code, found in linear time after the
 *   sort, and package-merge only runs when the limit binds.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `buildMap(codeLengths, maxBits, reversed)` | encode table (`reversed=0`) or decode table (`reversed=1`) |
 * | `buildTree(freqs, maxBits)` | `{ t, l }` - `t` = code lengths, `l` = max bits used |
 *
 * ## Package-merge in one paragraph
 *
 * A symbol of length `len` is worth `2^-len` of a unit budget (the Kraft
 * sum). Give every symbol one "coin" per level `1..maxBits`, level `j`
 * coins being worth `2^-j` and costing the symbol's frequency. Buying the
 * cheapest set of coins worth `n - 1` units, where `n` is the number of used
 * symbols, is solved greedily from the deepest level up: pair the level's
 * cheapest items into packages, merge those packages with the fresh coins of
 * the level above, repeat. At the top, the first `2n - 2` items of the list
 * are bought; unpacking them level by level, a symbol's code length is the
 * number of its coins that were bought.
 */

import { bitstream } from './bitstream.js';

/**
 * Public surface of `huffman.factory(...)`.
 * @typedef {object} HuffmanAPI
 * @property {(codeLengths: Uint8Array|number[], maxBits: number, reversed: 0|1|number) => Uint16Array} buildMap Build the encode map (`reversed=0`) or reversed-code decode table (`reversed=1`) from canonical code lengths.
 * @property {(freqs: Uint16Array|number[], maxBits: number) => { t: Uint8Array, l: number }} buildTree Derive a length-limited canonical code; `t` = per-symbol code lengths, `l` = max bits used.
 */

export const huffman = {
    name: 'huffman',
    version: '1.0.0',
    type: 'fw.io.compress',
    dependencies: ['bitstream'],
    deps: [bitstream],

    /** @returns {HuffmanAPI} */
    factory(bitstream) {

        // 15-bit mirror table: flips a canonical code into stream order.
        const mirror15 = bitstream.rev;

        // Code lengths run 1..15 in both RFCs; index 0 counts unused symbols.
        const LENGTH_SLOTS = 16;

        // --- RFC 1951 §3.2.2 canonical assignment ---

        /**
         * First canonical code of every length, per §3.2.2 steps 1-2: count
         * the codes of each length, then each length starts right after the
         * last code of the previous length, shifted one bit deeper.
         *
         * @param {Uint8Array|number[]} codeLengths
         * @returns {Int32Array} `firstCode[len]`, incremented by the caller as codes are handed out.
         */
        function _firstCodes(codeLengths) {
            const perLength = new Int32Array(LENGTH_SLOTS);
            for (let s = 0; s < codeLengths.length; ++s) perLength[codeLengths[s]]++;
            perLength[0] = 0;

            const firstCode = new Int32Array(LENGTH_SLOTS);
            let code = 0;
            for (let len = 1; len < LENGTH_SLOTS; ++len) {
                code = (code + perLength[len - 1]) << 1;
                firstCode[len] = code;
            }
            return firstCode;
        }

        /**
         * Encode map or decode table for a canonical code (§3.2.2 step 3:
         * symbols in increasing order take consecutive codes of their length).
         *
         * @param {Uint8Array|number[]} codeLengths Per-symbol length, 0 = unused.
         * @param {number} maxBits Longest length present; sizes the decode table.
         * @param {0|1|number} reversed Falsy = encode map, truthy = decode table.
         * @returns {Uint16Array}
         */
        function buildMap(codeLengths, maxBits, reversed) {
            const next = _firstCodes(codeLengths);
            const count = codeLengths.length;

            if (!reversed) {
                // Encode map: the code mirrored over its own length, so an
                // LSB-first write puts its most-significant bit on the wire first.
                const codes = new Uint16Array(count);
                for (let s = 0; s < count; ++s) {
                    const len = codeLengths[s];
                    if (len) codes[s] = mirror15[next[len]++] >>> (15 - len);
                }
                return codes;
            }

            // Decode table: slot `k` = the next `maxBits` stream bits, first
            // stream bit in bit 0. A code of length `len` owns every slot
            // whose low `len` bits spell it in stream order.
            const size = 1 << maxBits;
            const table = new Uint16Array(size);
            for (let s = 0; s < count; ++s) {
                const len = codeLengths[s];
                if (!len) continue;
                const entry = (s << 4) | len;
                const stride = 1 << len;
                for (let k = mirror15[next[len]++] >>> (15 - len); k < size; k += stride) table[k] = entry;
            }
            return table;
        }

        // --- Length-limited optimal lengths (package-merge) ---

        /**
         * Used symbols sorted by ascending frequency, ties by ascending
         * symbol. Each `(frequency, symbol)` pair is folded into one float
         * key `frequency * span + symbol` so a plain numeric sort orders
         * both at once (exact while `frequency * span < 2^53`).
         *
         * @param {ArrayLike<number>} freqs
         * @param {number} span Highest used symbol + 1.
         * @param {number} used Number of symbols with a nonzero frequency.
         * @returns {{ symbols: Int32Array, weights: Float64Array }}
         */
        function _sortedLeaves(freqs, span, used) {
            const keys = new Float64Array(used);
            let n = 0;
            for (let s = 0; s < span; ++s) {
                if (freqs[s] > 0) keys[n++] = freqs[s] * span + s;
            }
            keys.sort();

            const symbols = new Int32Array(used);
            const weights = new Float64Array(used);
            for (let i = 0; i < used; ++i) {
                const symbol = keys[i] % span;
                symbols[i] = symbol;
                weights[i] = (keys[i] - symbol) / span;
            }
            return { symbols, weights };
        }

        /**
         * Optimal code lengths bounded by `levels`, one per sorted leaf.
         *
         * Level 0 is the deepest (coins worth `2^-levels`); each list is
         * recorded as one flag per item, 1 = fresh leaf coin, 0 = package of
         * two items of the level below. Only the flags are needed to unpack.
         *
         * @param {Float64Array} weights Ascending leaf weights, length >= 2.
         * @param {number} levels Maximum code length.
         * @returns {Uint8Array} Length of each sorted leaf.
         */
        function _packageMerge(weights, levels) {
            const n = weights.length;
            const room = 2 * n;
            const isLeaf = new Uint8Array(levels * room);
            const listSize = new Int32Array(levels);
            let below = new Float64Array(room);
            let here = new Float64Array(room);

            below.set(weights);
            isLeaf.fill(1, 0, n);
            listSize[0] = n;

            for (let level = 1; level < levels; ++level) {
                const packages = listSize[level - 1] >>> 1;
                const base = level * room;
                let leaf = 0;
                let pkg = 0;
                let size = 0;
                while (leaf < n || pkg < packages) {
                    const pkgWeight = pkg < packages
                        ? below[2 * pkg] + below[2 * pkg + 1]
                        : Infinity;
                    // On a tie the fresh coin goes first: it keeps the
                    // selection shallow without changing the total cost.
                    if (leaf < n && weights[leaf] <= pkgWeight) {
                        here[size] = weights[leaf++];
                        isLeaf[base + size] = 1;
                    } else {
                        here[size] = pkgWeight;
                        ++pkg;
                    }
                    ++size;
                }
                listSize[level] = size;
                const swap = below;
                below = here;
                here = swap;
            }

            // Unpack the purchase: at every level the bought leaf coins are
            // the cheapest leaves (they were merged in sorted order), and the
            // bought packages open into twice as many items one level down.
            const lengths = new Uint8Array(n);
            let bought = 2 * n - 2;
            for (let level = levels - 1; level >= 0 && bought > 0; --level) {
                const base = level * room;
                let leaves = 0;
                for (let i = 0; i < bought; ++i) leaves += isLeaf[base + i];
                for (let i = 0; i < leaves; ++i) lengths[i]++;
                bought = 2 * (bought - leaves);
            }
            return lengths;
        }

        /**
         * Unlimited Huffman lengths for the sorted leaves, or `null` when the
         * deepest one would exceed `limit`.
         *
         * Two queues stand in for a priority queue: the leaves, already
         * sorted, and the merged nodes, which come out in non-decreasing
         * weight order because every step adds the two lightest items left.
         * A step therefore only compares the heads of the two queues, and a
         * tie goes to the leaf, the same rule as the package-merge list. Each
         * item records the step that absorbed it; the last step is the root,
         * so one reverse pass over the steps turns those links into depths.
         *
         * An unlimited Huffman code that fits in `limit` is optimal under the
         * limit as well, and it is the code `_packageMerge` returns for the
         * same leaves: the tests hold the two paths equal on exhaustive small
         * alphabets and on seeded random vectors, ties included. When the
         * limit binds, `null` sends the caller to package-merge.
         *
         * @param {Float64Array} weights Ascending leaf weights, length >= 2.
         * @param {number} limit Maximum code length.
         * @returns {Uint8Array|null} Length of each sorted leaf, or `null`.
         */
        function _huffmanLengths(weights, limit) {
            const n = weights.length;
            const steps = n - 1;
            const merged = new Float64Array(steps);
            // absorbedBy[k]: the step that took the node of step k;
            // absorbedBy[steps + i]: the step that took leaf i.
            const absorbedBy = new Int32Array(steps + n);
            let leaf = 0;
            let node = 0;
            for (let step = 0; step < steps; ++step) {
                let sum = 0;
                for (let pick = 0; pick < 2; ++pick) {
                    if (leaf < n && (node === step || weights[leaf] <= merged[node])) {
                        sum += weights[leaf];
                        absorbedBy[steps + leaf++] = step;
                    } else {
                        sum += merged[node];
                        absorbedBy[node++] = step;
                    }
                }
                merged[step] = sum;
            }

            const depth = new Int32Array(steps);
            for (let step = steps - 2; step >= 0; --step) depth[step] = depth[absorbedBy[step]] + 1;

            const lengths = new Uint8Array(n);
            for (let i = 0; i < n; ++i) {
                const len = depth[absorbedBy[steps + i]] + 1;
                if (len > limit) return null;
                lengths[i] = len;
            }
            return lengths;
        }

        /**
         * Length-limited optimal canonical code lengths for `freqs`.
         *
         * @param {ArrayLike<number>} freqs Non-negative integer frequencies.
         * @param {number} maxBits Maximum code length (1..15).
         * @returns {{ t: Uint8Array, l: number }} `t` sized to the highest used symbol + 1.
         */
        function buildTree(freqs, maxBits) {
            let used = 0;
            let top = -1;
            for (let s = 0; s < freqs.length; ++s) {
                if (freqs[s] > 0) {
                    ++used;
                    top = s;
                }
            }
            if (used === 0) return { t: new Uint8Array(0), l: 0 };

            const t = new Uint8Array(top + 1);
            if (used === 1) {
                t[top] = 1;
                return { t, l: 1 };
            }

            const { symbols, weights } = _sortedLeaves(freqs, top + 1, used);
            const lengths = _huffmanLengths(weights, maxBits) || _packageMerge(weights, maxBits);
            for (let i = 0; i < used; ++i) t[symbols[i]] = lengths[i];
            // The rarest symbol sits first in sorted order: it holds the longest code.
            return { t, l: lengths[0] };
        }

        return { buildTree, buildMap };
    },
};
