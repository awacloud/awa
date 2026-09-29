// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Unicode helpers: NFC/NFD/NFKC/NFKD normalization, casefold, collation,
 * grapheme clusters, visual width estimation, strip diacritics. Delegates
 * to native `Intl` / `String` primitives.
 */

/**
 * Collator options accepted by `unicode.compare` and `unicode.collator`.
 * @typedef {object} UnicodeCollatorOptions
 * @property {string|string[]} [locale]
 * @property {'base'|'accent'|'case'|'variant'} [sensitivity]
 * @property {boolean} [numeric]
 * @property {'upper'|'lower'|'false'} [caseFirst]
 * @property {boolean} [ignorePunctuation]
 */

/**
 * Reusable collator returned by `unicode.collator`.
 * @typedef {object} UnicodeCollator
 * @property {(a: string, b: string) => number} compare Compare two strings (`-1`/`0`/`1`).
 * @property {(arr: string[]) => string[]} sort Return a sorted copy (non-mutating).
 */

/**
 * Public API returned by `unicode.factory()`.
 * @typedef {object} UnicodeAPI
 * @property {(str: string, form?: 'NFC'|'NFD'|'NFKC'|'NFKD') => string} normalize Apply a Unicode normalization form.
 * @property {(str: string, locale?: string|string[]) => string} casefold Locale-aware lowercase (case folding).
 * @property {(a: string, b: string, options?: UnicodeCollatorOptions) => number} compare Compare two strings via `Intl.Collator`.
 * @property {(options?: UnicodeCollatorOptions) => UnicodeCollator} collator Build a reusable collator.
 * @property {(str: string) => Generator<string, void, unknown>} graphemes Iterate over grapheme clusters.
 * @property {(str: string) => number} width Estimate visual width in terminal cells.
 * @property {(str: string) => string} stripDiacritics Remove combining diacritical marks.
 */

export const unicode = {
    name: 'unicode',
    version: '1.0.0',
    type: 'fw.io.text',
    dependencies: [],

    /** @returns {UnicodeAPI} */
    factory() {
        const _forms = new Set(['NFC', 'NFD', 'NFKC', 'NFKD']);

        /**
         * Apply a Unicode normalization form to `str`.
         * @param {string} str
         * @param {'NFC'|'NFD'|'NFKC'|'NFKD'} [form='NFC']
         * @returns {string}
         * @throws {Error} If `str` is not a string or `form` is unknown.
         */
        function normalize(str, form = 'NFC') {
            if (typeof str !== 'string') throw new Error('unicode.normalize: str must be a string');
            if (!_forms.has(form)) throw new Error(`unicode.normalize: unknown form "${form}"`);
            return str.normalize(form);
        }

        /**
         * Locale-aware lowercase (case folding).
         * @param {string} str
         * @param {string|string[]} [locale] Locale tag(s) for `toLocaleLowerCase`.
         * @returns {string}
         */
        function casefold(str, locale) {
            if (locale) return str.toLocaleLowerCase(locale);
            return str.toLowerCase();
        }

        /**
         * Compare two strings using `Intl.Collator`.
         * @param {string} a
         * @param {string} b
         * @param {{ locale?: string|string[], sensitivity?: 'base'|'accent'|'case'|'variant', numeric?: boolean, caseFirst?: 'upper'|'lower'|'false', ignorePunctuation?: boolean }} [options]
         * @returns {number} `-1`, `0`, or `1` (per `Intl.Collator.compare`).
         */
        function compare(a, b, options = {}) {
            const { locale, ...collatorOptions } = options;
            return new Intl.Collator(locale, collatorOptions).compare(a, b);
        }

        /**
         * Build a reusable collator with `compare` and `sort` helpers.
         * `sort` returns a copy (non-mutating).
         * @param {{ locale?: string|string[], sensitivity?: 'base'|'accent'|'case'|'variant', numeric?: boolean, caseFirst?: 'upper'|'lower'|'false', ignorePunctuation?: boolean }} [options]
         * @returns {{ compare: (a: string, b: string) => number, sort: (arr: string[]) => string[] }}
         */
        function collator(options = {}) {
            const { locale, ...collatorOptions } = options;
            const coll = new Intl.Collator(locale, collatorOptions);
            return {
                compare: coll.compare.bind(coll),
                sort: (arr) => [...arr].sort(coll.compare.bind(coll)),
            };
        }

        /**
         * Iterate over the grapheme clusters of `str`.
         * Uses `Intl.Segmenter` when available; otherwise falls back to
         * iterating Unicode code points (ZWJ sequences will not be merged).
         * @param {string} str
         * @yields {string}
         */
        function* graphemes(str) {
            if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
                const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
                for (const { segment } of segmenter.segment(str)) {
                    yield segment;
                }
            } else {
                // Fallback: iterate by Unicode code points (approximation -- ZWJ sequences not merged)
                for (const cp of str) {
                    yield cp;
                }
            }
        }

        // Wide chars: CJK unified, CJK compat, fullwidth forms, some ranges
        const _wideRanges = [
            [0x1100, 0x115F],  // Hangul Jamo
            [0x2E80, 0x2EFF],  // CJK Radicals
            [0x2F00, 0x2FFF],  // Kangxi Radicals
            [0x3000, 0x303F],  // CJK Symbols
            [0x3040, 0x33FF],  // Hiragana/Katakana/CJK compat
            [0x3400, 0x4DBF],  // CJK Extension A
            [0x4E00, 0x9FFF],  // CJK Unified Ideographs
            [0xA000, 0xA4CF],  // Yi
            [0xA960, 0xA97F],  // Hangul
            [0xAC00, 0xD7FF],  // Hangul Syllables
            [0xF900, 0xFAFF],  // CJK Compat
            [0xFE10, 0xFE1F],  // Vertical forms
            [0xFE30, 0xFE6F],  // CJK compat forms
            [0xFF00, 0xFF60],  // Fullwidth forms
            [0xFFE0, 0xFFE6],  // Fullwidth signs
            [0x1B000, 0x1B0FF], // Kana supplement
            [0x1F300, 0x1F9FF], // Emoji (approximation)
            [0x20000, 0x2A6DF], // CJK Extension B
            [0x2A700, 0x2CEAF], // CJK Extensions
            [0x2CEB0, 0x2EBEF], // CJK Compat supplement
        ];

        function _charWidth(cp) {
            if (cp === 0) return 0; // null
            if (cp < 32 || (cp >= 0x7F && cp < 0xA0)) return 0; // control chars
            if (cp >= 0x300 && cp <= 0x36F) return 0; // combining diacritics
            if (cp >= 0x200B && cp <= 0x200F) return 0; // zero-width
            for (const [lo, hi] of _wideRanges) {
                if (cp >= lo && cp <= hi) return 2;
            }
            return 1;
        }

        /**
         * Estimate the visual width of `str` in terminal cells. Each grapheme
         * cluster contributes 0 (control / zero-width / combining), 1 (regular),
         * or 2 (CJK / fullwidth / wide emoji) based on its first code point.
         * @param {string} str
         * @returns {number}
         */
        function width(str) {
            // Use grapheme clusters (or code points) for accurate measurement
            let w = 0;
            for (const grapheme of graphemes(str)) {
                // Width is based on the first code point of the grapheme cluster
                const cp = grapheme.codePointAt(0);
                w += _charWidth(cp);
            }
            return w;
        }

        /**
         * Remove combining diacritical marks from `str`
         * (NFD decompose -> strip `\p{Mn}` -> NFC recompose).
         * @param {string} str
         * @returns {string}
         */
        function stripDiacritics(str) {
            return str.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC');
        }

        return { normalize, casefold, compare, collator, graphemes, width, stripDiacritics };
    },
};
