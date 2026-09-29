// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * String utilities: case conversions, slug, truncate, pad, format,
 * escapeHTML/RegExp, similarity.
 */

/**
 * Public API returned by `str.factory()`.
 * @typedef {object} StrAPI
 * @property {(s: string) => string[]} splitWords Split into words across case/digit/separator boundaries.
 * @property {(s: string) => string} camelCase Convert to camelCase.
 * @property {(s: string) => string} pascalCase Convert to PascalCase.
 * @property {(s: string) => string} kebabCase Convert to kebab-case.
 * @property {(s: string) => string} snakeCase Convert to snake_case.
 * @property {(s: string) => string} constantCase Convert to CONSTANT_CASE.
 * @property {(s: string) => string} titleCase Convert to Title Case.
 * @property {(s: string, options?: { separator?: string, lower?: boolean }) => string} slug Build a URL-safe slug.
 * @property {(s: string, length: number, options?: { suffix?: string, wordBoundary?: boolean }) => string} truncate Truncate with optional suffix.
 * @property {(s: string, length: number, char?: string, side?: 'left'|'right'|'both') => string} pad Pad to a length.
 * @property {(template: string, params: Record<string, *>) => string} format Replace `{key}` placeholders.
 * @property {(s: string) => string} escapeRegExp Escape for literal use in a RegExp.
 * @property {(s: string) => string} escapeHTML Escape for safe HTML inclusion.
 * @property {(a: string, b: string) => number} similarity Levenshtein-based similarity in `[0, 1]`.
 */

import { unicode } from './unicode.js';

export const str = {
    name: 'str',
    version: '1.0.0',
    type: 'fw.io.text',
    dependencies: ['unicode'],
    deps: [unicode],

    /** @returns {StrAPI} */
    factory(unicodeDep) {
        /**
         * Split a string into words, handling case transitions, digit
         * boundaries, and `-`/`_`/whitespace separators.
         * @param {string} s
         * @returns {string[]}
         */
        function splitWords(s) {
            // Insert separator at transitions: lowerToUpper, letterToDigit, digitToLetter
            const r = s
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                .replace(/([a-zA-Z])(\d)/g, '$1 $2')
                .replace(/(\d)([a-zA-Z])/g, '$1 $2');
            return r.split(/[\s\-_]+/).filter(w => w.length > 0);
        }

        /**
         * Convert to camelCase.
         * @param {string} s
         * @returns {string}
         */
        function camelCase(s) {
            const words = splitWords(s);
            if (!words.length) return '';
            return words[0].toLowerCase() + words.slice(1).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
        }

        /**
         * Convert to PascalCase.
         * @param {string} s
         * @returns {string}
         */
        function pascalCase(s) {
            return splitWords(s).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
        }

        /**
         * Convert to kebab-case.
         * @param {string} s
         * @returns {string}
         */
        function kebabCase(s) {
            return splitWords(s).map(w => w.toLowerCase()).join('-');
        }

        /**
         * Convert to snake_case.
         * @param {string} s
         * @returns {string}
         */
        function snakeCase(s) {
            return splitWords(s).map(w => w.toLowerCase()).join('_');
        }

        /**
         * Convert to CONSTANT_CASE.
         * @param {string} s
         * @returns {string}
         */
        function constantCase(s) {
            return splitWords(s).map(w => w.toUpperCase()).join('_');
        }

        /**
         * Convert to Title Case (space-separated, each word capitalised).
         * @param {string} s
         * @returns {string}
         */
        function titleCase(s) {
            return splitWords(s).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }

        /**
         * Build a URL-safe slug from `s`.
         * Strips diacritics via the injected `unicode` module, lowercases by
         * default, collapses non-alphanumeric runs into `separator`, and trims
         * leading/trailing separators.
         * @param {string} s
         * @param {{ separator?: string, lower?: boolean }} [options]
         * @returns {string}
         */
        function slug(s, options = {}) {
            const { separator = '-', lower = true } = options;
            let result = unicodeDep.stripDiacritics(s);
            if (lower) result = unicodeDep.casefold(result);
            result = result.replace(/[^a-zA-Z0-9]+/g, separator);
            result = result.replace(new RegExp(`^${escapeRegExp(separator)}+|${escapeRegExp(separator)}+$`, 'g'), '');
            result = result.replace(new RegExp(`${escapeRegExp(separator)}{2,}`, 'g'), separator);
            return result;
        }

        /**
         * Truncate `s` to `length` characters, appending `suffix` when it had
         * to be cut. When `wordBoundary` is true the cut is moved back to the
         * last space within the allowed range.
         * @param {string} s
         * @param {number} length Maximum total length including `suffix`.
         * @param {{ suffix?: string, wordBoundary?: boolean }} [options]
         * @returns {string}
         */
        function truncate(s, length, options = {}) {
            const { suffix = '…', wordBoundary = true } = options;
            if (s.length <= length) return s;
            const maxContent = length - suffix.length;
            if (maxContent <= 0) return suffix.slice(0, length);
            let cut = s.slice(0, maxContent);
            if (wordBoundary) {
                const lastSpace = cut.lastIndexOf(' ');
                if (lastSpace > 0) cut = cut.slice(0, lastSpace);
            }
            return cut + suffix;
        }

        /**
         * Pad `s` to `length` using `char`. `side` controls which side(s) are
         * padded: `'left'` (default), `'right'`, or `'both'`.
         * @param {string} s
         * @param {number} length
         * @param {string} [char=' ']
         * @param {'left'|'right'|'both'} [side='left']
         * @returns {string}
         */
        function pad(s, length, char = ' ', side = 'left') {
            if (s.length >= length) return s;
            const padLen = length - s.length;
            const padStr = char.repeat(Math.ceil(padLen / char.length)).slice(0, padLen);
            if (side === 'right') return s + padStr;
            if (side === 'both') {
                const leftPad = Math.floor(padLen / 2);
                const rightPad = padLen - leftPad;
                return char.repeat(leftPad).slice(0, leftPad) + s + char.repeat(rightPad).slice(0, rightPad);
            }
            return padStr + s; // left (default)
        }

        /**
         * Replace `{key}` placeholders in `template` with values from `params`.
         * Unknown keys are kept verbatim (e.g. `"{missing}"`).
         * @param {string} template
         * @param {Record<string, *>} params
         * @returns {string}
         */
        function format(template, params) {
            return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
        }

        /**
         * Escape `s` so it can be embedded literally inside a RegExp pattern.
         * @param {string} s
         * @returns {string}
         */
        function escapeRegExp(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        /**
         * Escape `s` for safe inclusion in HTML text or attribute values.
         * @param {string} s
         * @returns {string}
         */
        function escapeHTML(s) {
            return s
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        /**
         * Return a similarity score in `[0, 1]` between `a` and `b`, based on
         * Levenshtein edit distance normalised by the longer length.
         * @param {string} a
         * @param {string} b
         * @returns {number}
         */
        function similarity(a, b) {
            if (a === b) return 1;
            const la = a.length, lb = b.length;
            if (la === 0 && lb === 0) return 1;
            if (la === 0 || lb === 0) return 0;
            // Levenshtein
            const dp = Array.from({ length: lb + 1 }, (_, j) => j);
            for (let i = 1; i <= la; i++) {
                let prev = dp[0];
                dp[0] = i;
                for (let j = 1; j <= lb; j++) {
                    const temp = dp[j];
                    dp[j] = a[i - 1] === b[j - 1]
                        ? prev
                        : 1 + Math.min(prev, dp[j], dp[j - 1]);
                    prev = temp;
                }
            }
            return 1 - dp[lb] / Math.max(la, lb);
        }

        return {
            splitWords, camelCase, pascalCase, kebabCase, snakeCase, constantCase, titleCase,
            slug, truncate, pad, format, escapeRegExp, escapeHTML, similarity,
        };
    },
};
