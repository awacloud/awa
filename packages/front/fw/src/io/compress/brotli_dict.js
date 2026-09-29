// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Brotli static dictionary + 121 transforms (RFC 7932 Appendix A/B).
 *
 * Two-part module:
 *
 * 1. **Word dictionary** (Appendix A) - 122,784 bytes indexed by
 *    `(length, index)` via the `NDBITS` / `DOFFSET` tables. The blob itself
 *    is **not** owned by this module: it lives in
 *    [`brotliDictWords`](./brotli_dict_words.md) (lazy-loadable). Imperative
 *    wiring via `setWords(blob)`. Before injection, `hasWords()` returns
 *    `false` and `lookupWord` throws `EDICT_UNLOADED`.
 * 2. **Transforms** (Appendix B) - the 121 canonical transformations
 *    (`Identity`, `FermentFirst`, `FermentAll`, `OmitFirst1..9` except 8,
 *    `OmitLast1..9`) with UTF-8 prefix + suffix. Round-trippable against
 *    the CRC-32 `0x3d965f81` (over the concatenation of the 648 bytes of
 *    the canonical form).
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `NDBITS` | `Uint8Array(25)` - bit-depths per length |
 * | `NWORDS(length)` | `number` - number of words at this length (0 if `< 4`) |
 * | `DOFFSET(length)` | `number` - offset of the first word in the blob |
 * | `DICTSIZE` | `number` - `122,784` (fixed by the spec) |
 * | `transforms` | `Array(121)` of `{ prefix, kind, param, suffix }` |
 * | `applyTransform(id, baseWord)` | `Uint8Array` - `prefix + T_id(baseWord) + suffix` |
 * | `setWords(blob)` | `void` - injects the Appendix A blob (size-checked) |
 * | `hasWords()` | `boolean` - `true` after a successful `setWords` |
 * | `lookupWord(length, index)` | `Uint8Array` - view into the blob; throws if not loaded |
 *
 */

/**
 * One entry of the 121-element transform table (Appendix B).
 * @typedef {object} BrotliTransform
 * @property {Uint8Array} prefix UTF-8 prefix bytes.
 * @property {number} kind Transform kind id (0=Identity, 1=FermentFirst, 2=FermentAll, 3..11=OmitFirstk, 12..20=OmitLastk).
 * @property {number} param `k` for OmitFirstk/OmitLastk, else 0.
 * @property {Uint8Array} suffix UTF-8 suffix bytes.
 */

/**
 * Public surface of `brotliDict.factory()`.
 * @typedef {object} BrotliDictAPI
 * @property {Uint8Array} NDBITS Bit-depths per word length (length 25).
 * @property {(length: number) => number} NWORDS Number of words at a length (0 if `< 4`).
 * @property {(length: number) => number} DOFFSET Blob offset of the first word at a length.
 * @property {number} DICTSIZE Fixed dictionary size (122784).
 * @property {BrotliTransform[]} transforms The 121 canonical transforms.
 * @property {(id: number, baseWord: Uint8Array) => Uint8Array} applyTransform Apply `transforms[id]` to `baseWord`, returning `prefix + T(baseWord) + suffix`.
 * @property {(blob: Uint8Array) => void} setWords Inject the size-checked Appendix A word blob.
 * @property {() => boolean} hasWords Whether the word blob has been injected.
 * @property {(length: number, index: number) => Uint8Array} lookupWord View into the blob for word `(length, index)`; throws if unloaded.
 */

export const brotliDict = {
    name: 'brotliDict',
    version: '0.1.0',
    type: 'fw.io.compress',
    dependencies: [],

    /** @returns {BrotliDictAPI} */
    factory() {

        const u8 = Uint8Array;

        // RFC 7932 §8 - NDBITS table (lengths 0..24)
        const NDBITS = new u8([
            0, 0, 0, 0, 10, 10, 11, 11, 10, 10,
            10, 10, 10, 9, 9, 8, 7, 7, 8, 7,
            7, 6, 6, 5, 5,
        ]);

        // NWORDS[length] = (1 << NDBITS[length]) if length >= 4 else 0
        const _nwords = new Int32Array(25);
        for (let i = 4; i <= 24; ++i) _nwords[i] = 1 << NDBITS[i];

        // DOFFSET[length+1] = DOFFSET[length] + length * NWORDS[length]
        const _doffset = new Int32Array(26);
        for (let l = 0; l < 25; ++l) _doffset[l + 1] = _doffset[l] + l * _nwords[l];

        const DICTSIZE = _doffset[25]; // = 122784

        function NWORDS(length) { return _nwords[length] | 0; }
        function DOFFSET(length) { return _doffset[length] | 0; }

        // --- Transform table (Appendix B, 121 entries) ---
        // kind: 0=Identity, 1=FermentFirst, 2=FermentAll, 3..11=OmitFirst1..9, 12..20=OmitLast1..9
        // param = k for OmitFirstk (1..9, skipping 8) and OmitLastk (1..9)
        // Encoded compactly: each entry as [prefix, kind, suffix] tuples.

        const I = 0, FF = 1, FA = 2;
        const OF = k => 2 + k;       // OmitFirstk → kind id (3..11), e.g. OmitFirst1 = 3
        const OL = k => 11 + k;      // OmitLastk  → kind id (12..20)

        // Build transforms from a compact spec; strings are UTF-8 by encoding via TextEncoder.
        const enc = new TextEncoder();
        const _bs = s => s.length === 0 ? new u8(0) : enc.encode(s);

        const _spec = [
            ['',         I,       ''],         // 0
            ['',         I,       ' '],
            [' ',        I,       ' '],
            ['',         OF(1),   ''],
            ['',         FF,      ' '],
            ['',         I,       ' the '],
            [' ',        I,       ''],
            ['s ',       I,       ' '],
            ['',         I,       ' of '],
            ['',         FF,      ''],
            ['',         I,       ' and '],   // 10
            ['',         OF(2),   ''],
            ['',         OL(1),   ''],
            [', ',       I,       ' '],
            ['',         I,       ', '],
            [' ',        FF,      ' '],
            ['',         I,       ' in '],
            ['',         I,       ' to '],
            ['e ',       I,       ' '],
            ['',         I,       '"'],
            ['',         I,       '.'],        // 20
            ['',         I,       '">'],
            ['',         I,       '\n'],
            ['',         OL(3),   ''],
            ['',         I,       ']'],
            ['',         I,       ' for '],
            ['',         OF(3),   ''],
            ['',         OL(2),   ''],
            ['',         I,       ' a '],
            ['',         I,       ' that '],
            [' ',        FF,      ''],         // 30
            ['',         I,       '. '],
            ['.',        I,       ''],
            [' ',        I,       ', '],
            ['',         OF(4),   ''],
            ['',         I,       ' with '],
            ['',         I,       "'"],
            ['',         I,       ' from '],
            ['',         I,       ' by '],
            ['',         OF(5),   ''],
            ['',         OF(6),   ''],         // 40
            [' the ',    I,       ''],
            ['',         OL(4),   ''],
            ['',         I,       '. The '],
            ['',         FA,      ''],
            ['',         I,       ' on '],
            ['',         I,       ' as '],
            ['',         I,       ' is '],
            ['',         OL(7),   ''],
            ['',         OL(1),   'ing '],
            ['',         I,       '\n\t'],     // 50
            ['',         I,       ':'],
            [' ',        I,       '. '],
            ['',         I,       'ed '],
            ['',         OF(9),   ''],
            ['',         OF(7),   ''],
            ['',         OL(6),   ''],
            ['',         I,       '('],
            ['',         FF,      ', '],
            ['',         OL(8),   ''],
            ['',         I,       ' at '],     // 60
            ['',         I,       'ly '],
            [' the ',    I,       ' of '],
            ['',         OL(5),   ''],
            ['',         OL(9),   ''],
            [' ',        FF,      ', '],
            ['',         FF,      '"'],
            ['.',        I,       '('],
            ['',         FA,      ' '],
            ['',         FF,      '">'],
            ['',         I,       '="'],       // 70
            [' ',        I,       '.'],
            ['.com/',    I,       ''],
            [' the ',    I,       ' of the '],
            ['',         FF,      "'"],
            ['',         I,       '. This '],
            ['',         I,       ','],
            ['.',        I,       ' '],
            ['',         FF,      '('],
            ['',         FF,      '.'],
            ['',         I,       ' not '],    // 80
            [' ',        I,       '="'],
            ['',         I,       'er '],
            [' ',        FA,      ' '],
            ['',         I,       'al '],
            [' ',        FA,      ''],
            ['',         I,       "='"],
            ['',         FA,      '"'],
            ['',         FF,      '. '],
            [' ',        I,       '('],
            ['',         I,       'ful '],     // 90
            [' ',        FF,      '. '],
            ['',         I,       'ive '],
            ['',         I,       'less '],
            ['',         FA,      "'"],
            ['',         I,       'est '],
            [' ',        FF,      '.'],
            ['',         FA,      '">'],
            [' ',        I,       "='"],
            ['',         FF,      ','],
            ['',         I,       'ize '],     // 100
            ['',         FA,      '.'],
            [' ',   I,       ''],          // U+00A0 NBSP (RFC: "\xc2\xa0")
            [' ',        I,       ','],
            ['',         FF,      '="'],
            ['',         FA,      '="'],
            ['',         I,       'ous '],
            ['',         FA,      ', '],
            ['',         FF,      "='"],
            [' ',        FF,      ','],
            [' ',        FA,      '="'],       // 110
            [' ',        FA,      ', '],
            ['',         FA,      ','],
            ['',         FA,      '('],
            ['',         FA,      '. '],
            [' ',        FA,      '.'],
            ['',         FA,      "='"],
            [' ',        FA,      '. '],
            [' ',        FF,      '="'],
            [' ',        FA,      "='"],
            [' ',        FF,      "='"],       // 120
        ];

        const transforms = new Array(_spec.length);
        for (let i = 0; i < _spec.length; ++i) {
            const [pfx, kind, sfx] = _spec[i];
            let param = 0;
            if (kind >= 3 && kind <= 11) param = kind - 2;        // OmitFirstk
            else if (kind >= 12 && kind <= 20) param = kind - 11; // OmitLastk
            transforms[i] = {
                prefix: _bs(pfx),
                kind,
                param,
                suffix: _bs(sfx),
            };
        }

        // --- Ferment helpers (RFC 7932 §8) ---
        // Returns number of bytes consumed (1, 2, or 3) - UTF-8 codepoint length
        function _ferment(word, pos, len) {
            const b = word[pos];
            if (b < 192) {
                if (b >= 97 && b <= 122) word[pos] = b ^ 32;
                return 1;
            }
            if (b < 224) {
                if (pos + 1 < len) word[pos + 1] ^= 32;
                return 2;
            }
            if (pos + 2 < len) word[pos + 2] ^= 5;
            return 3;
        }

        function _fermentFirst(word, len) {
            if (len > 0) _ferment(word, 0, len);
        }

        function _fermentAll(word, len) {
            let i = 0;
            while (i < len) i += _ferment(word, i, len);
        }

        /**
         * Apply a transform from `transforms[id]` to `baseWord`, returning a
         * fresh `Uint8Array` of the form `prefix + T(baseWord) + suffix`.
         */
        function applyTransform(id, baseWord) {
            const t = transforms[id];
            if (!t) throw new Error(`brotliDict: unknown transform id ${id}`);
            const { prefix, kind, param, suffix } = t;

            let body;
            if (kind === 0) {
                body = new u8(baseWord);
            } else if (kind === 1) {
                body = new u8(baseWord);
                _fermentFirst(body, body.length);
            } else if (kind === 2) {
                body = new u8(baseWord);
                _fermentAll(body, body.length);
            } else if (kind >= 3 && kind <= 11) {
                // OmitFirstk: drop first k bytes (empty if length < k)
                const k = param;
                body = baseWord.length < k ? new u8(0) : new u8(baseWord.subarray(k));
            } else if (kind >= 12 && kind <= 20) {
                // OmitLastk
                const k = param;
                body = baseWord.length < k ? new u8(0) : new u8(baseWord.subarray(0, baseWord.length - k));
            } else {
                throw new Error(`brotliDict: invalid transform kind ${kind}`);
            }

            const out = new u8(prefix.length + body.length + suffix.length);
            out.set(prefix, 0);
            out.set(body, prefix.length);
            out.set(suffix, prefix.length + body.length);
            return out;
        }

        // --- Word dictionary (Appendix A) - lazy-injected via setWords() ---
        // The blob lives in the separate `brotliDictWords` module; this
        // module is decoupled from it so that consumers that only need
        // transforms / tables avoid pulling the 120 KB payload.

        let _words = null;

        function setWords(blob) {
            if (!(blob instanceof u8)) {
                throw new Error('brotliDict.setWords: expected Uint8Array');
            }
            if (blob.length !== DICTSIZE) {
                throw new Error(
                    `brotliDict.setWords: blob size ${blob.length} ≠ DICTSIZE ${DICTSIZE}`
                );
            }
            _words = blob;
        }

        function hasWords() { return _words !== null; }

        function lookupWord(length, index) {
            if (!_words) {
                const e = new Error('brotliDict: static word dictionary not loaded (call setWords first)');
                // @ts-ignore - Error.code/context is a non-standard but widely-used extension
                e.code = 'EDICT_UNLOADED';
                throw e;
            }
            if (length < 4 || length > 24) {
                throw new Error(`brotliDict: invalid word length ${length}`);
            }
            const nw = _nwords[length];
            if (index < 0 || index >= nw) {
                throw new Error(`brotliDict: word index ${index} out of range [0, ${nw})`);
            }
            const off = _doffset[length] + length * index;
            return _words.subarray(off, off + length);
        }

        return {
            NDBITS,
            NWORDS,
            DOFFSET,
            DICTSIZE,
            transforms,
            applyTransform,
            setWords,
            hasWords,
            lookupWord,
        };
    }
};
