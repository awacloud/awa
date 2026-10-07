// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CJK shaping helpers.
 *
 * Two narrow responsibilities live here:
 *
 *   1. **Vertical form substitution.** In vertical layout, certain
 *      punctuation and kana code points are replaced with rotated /
 *      shifted glyph variants. The OpenType `vert` / `vrt2` features
 *      do the heavy lifting at the GSUB level, but a *fallback* table
 *      is useful when a font has no `vert` lookup or when the caller
 *      simply wants the recommended Unicode-preferred substitution.
 *
 *   2. **Ideographic Variation Sequence (IVS) extraction.**
 *      An IVS is a base ideograph U+XXXX followed by a variation
 *      selector from U+E0100..U+E01EF (VS17..VS256). The shaper splits
 *      a run into a sequence of `{ base, selector }` records — the
 *      variation selector is then matched against a `cmap` Format 14
 *      sub-table by the rest of the pipeline.
 *
 * @module fonts/extra/shaper-cjk
 */

import { fontErrors } from '../errors.js';

export const extraShaperCjk = {
    name: 'extraShaperCjk',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ContractError } = errors;

        /**
         * Unicode-preferred vertical-form mapping for CJK punctuation and a
         * handful of related code points.
         *
         * @type {Readonly<Object<number, number>>}
         */
        const VERTICAL_FORMS_CONST = Object.freeze({
    // CJK Symbols & Punctuation block
    0x3001: 0xFE11,    // IDEOGRAPHIC COMMA
    0x3002: 0xFE12,    // IDEOGRAPHIC FULL STOP
    0x3008: 0xFE3F,    // LEFT ANGLE BRACKET
    0x3009: 0xFE40,    // RIGHT ANGLE BRACKET
    0x300A: 0xFE3D,    // LEFT DOUBLE ANGLE BRACKET
    0x300B: 0xFE3E,    // RIGHT DOUBLE ANGLE BRACKET
    0x300C: 0xFE41,    // LEFT CORNER BRACKET
    0x300D: 0xFE42,    // RIGHT CORNER BRACKET
    0x300E: 0xFE43,    // LEFT WHITE CORNER BRACKET
    0x300F: 0xFE44,    // RIGHT WHITE CORNER BRACKET
    0x3010: 0xFE3B,    // LEFT BLACK LENTICULAR BRACKET
    0x3011: 0xFE3C,    // RIGHT BLACK LENTICULAR BRACKET
    0x3014: 0xFE39,    // LEFT TORTOISE SHELL BRACKET
    0x3015: 0xFE3A,    // RIGHT TORTOISE SHELL BRACKET
    0x3016: 0xFE17,    // LEFT WHITE LENTICULAR BRACKET
    0x3017: 0xFE18,    // RIGHT WHITE LENTICULAR BRACKET
    // ASCII brackets when used vertically
    0x0028: 0xFE35,    // LEFT PARENTHESIS
    0x0029: 0xFE36,    // RIGHT PARENTHESIS
    0x007B: 0xFE37,    // LEFT CURLY BRACKET
    0x007D: 0xFE38,    // RIGHT CURLY BRACKET
    0x005B: 0xFE47,    // LEFT SQUARE BRACKET
    0x005D: 0xFE48,    // RIGHT SQUARE BRACKET
    // CJK dashes & punctuation
    0x2014: 0xFE31,    // EM DASH
    0x2013: 0xFE32,    // EN DASH (presentation form)
    0x2025: 0xFE30,    // TWO DOT LEADER (vertical form U+FE30)
    0x2026: 0xFE19,    // HORIZONTAL ELLIPSIS → vertical ellipsis
    0xFF0C: 0xFE10,    // FULLWIDTH COMMA
    0xFF0E: 0xFE12,    // FULLWIDTH FULL STOP
    0xFF1A: 0xFE13,    // FULLWIDTH COLON
    0xFF1B: 0xFE14,    // FULLWIDTH SEMICOLON
    0xFF01: 0xFE15,    // FULLWIDTH EXCLAMATION MARK
    0xFF1F: 0xFE16,    // FULLWIDTH QUESTION MARK
            // Small kana — vertical forms are the small-kana code points
            // themselves (no substitution needed) but listed here for caller
            // discovery via `hasVerticalForm`.
        });

        /**
         * Range descriptor for code points that *rotate* in vertical layout
         * (90° CW) but have no precomposed vertical variant. Glyph-level
         * rotation is the caller's responsibility; this list just lets a
         * caller decide whether to apply it.
         *
         * @type {ReadonlyArray<[number, number]>}
         */
        const VERTICAL_ROTATE_RANGES_CONST = Object.freeze([
            [0x0020, 0x007E],   // ASCII (mostly)
            [0x00A0, 0x00FF],   // Latin-1 supplement
            [0x2000, 0x206F]    // General punctuation
        ]);

        const VS17_CONST = 0xE0100;
        const VS256_CONST = 0xE01EF;
        const VS1_CONST = 0xFE00;
        const VS16_CONST = 0xFE0F;

        function isVariationSelector(cp) {
            return (cp >= VS1_CONST && cp <= VS16_CONST) || (cp >= VS17_CONST && cp <= VS256_CONST);
        }

        function isIdeographicVS(cp) {
            return cp >= VS17_CONST && cp <= VS256_CONST;
        }

        function isCJKIdeograph(cp) {
            return (cp >= 0x4E00 && cp <= 0x9FFF)
                || (cp >= 0x3400 && cp <= 0x4DBF)
                || (cp >= 0x20000 && cp <= 0x2A6DF)
                || (cp >= 0x2A700 && cp <= 0x2B73F)
                || (cp >= 0xF900 && cp <= 0xFAFF);
        }

        function hasVerticalForm(cp) {
            return Object.prototype.hasOwnProperty.call(VERTICAL_FORMS_CONST, cp);
        }

        function cjkVertical(codePoints, isVertical) {
            if (!Array.isArray(codePoints))
                throw new ContractError('fonts/cjk-input', 'cjkVertical expects an array');
            if (typeof isVertical !== 'boolean')
                throw new ContractError('fonts/cjk-input', 'isVertical must be a boolean');

            const out = new Array(codePoints.length);
            for (let i = 0; i < codePoints.length; i++) {
                const v = codePoints[i];
                let cp;
                if (typeof v === 'number') cp = v;
                else if (typeof v === 'string' && v.length > 0) cp = v.codePointAt(0);
                else throw new ContractError('fonts/cjk-input',
                    `invalid code point at index ${i}`, { context: { index: i } });

                if (isVertical && VERTICAL_FORMS_CONST[cp] != null) {
                    out[i] = VERTICAL_FORMS_CONST[cp];
                } else {
                    out[i] = cp;
                }
            }
            return out;
        }

        function extractIVS(codePoints) {
            if (!Array.isArray(codePoints))
                throw new ContractError('fonts/cjk-input', 'extractIVS expects an array');

            const cps = new Array(codePoints.length);
            for (let i = 0; i < codePoints.length; i++) {
                const v = codePoints[i];
                if (typeof v === 'number') cps[i] = v;
                else if (typeof v === 'string' && v.length > 0) cps[i] = v.codePointAt(0);
                else throw new ContractError('fonts/cjk-input',
                    `invalid code point at index ${i}`, { context: { index: i } });
            }

            const out = [];
            for (let i = 0; i < cps.length; i++) {
                const cp = cps[i];
                if (isVariationSelector(cp)) continue;
                let selector = null;
                if (i + 1 < cps.length && isIdeographicVS(cps[i + 1]) && isCJKIdeograph(cp)) {
                    selector = cps[i + 1];
                    i++;
                }
                out.push({ base: cp, selector });
            }
            return out;
        }

        function shouldRotateVertical(cp) {
            if (hasVerticalForm(cp)) return false;
            if (isCJKIdeograph(cp)) return false;
            for (const [a, b] of VERTICAL_ROTATE_RANGES_CONST) {
                if (cp >= a && cp <= b) return true;
            }
            return false;
        }

        return {
            cjkVertical, extractIVS,
            isVariationSelector, isIdeographicVS, isCJKIdeograph,
            hasVerticalForm, shouldRotateVertical,
            VERTICAL_FORMS: VERTICAL_FORMS_CONST,
            VERTICAL_ROTATE_RANGES: VERTICAL_ROTATE_RANGES_CONST,
            VS1: VS1_CONST, VS16: VS16_CONST, VS17: VS17_CONST, VS256: VS256_CONST
        };
    }
};

