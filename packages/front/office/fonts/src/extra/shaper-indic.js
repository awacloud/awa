// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Indic text shaper — Devanagari focus.
 *
 * Indic scripts require a *re-ordering* pass before any GSUB lookup is
 * applied: matras (dependent vowels) that visually appear to the
 * **left** of the base consonant are encoded *after* it in the input
 * string, and certain consonant + virama (halant) sequences form
 * "half" forms or a reph (the floating Ra mark) that has to migrate to
 * a later position in the cluster.
 *
 * This module implements a deliberately small subset, sufficient for
 * the common patterns of Devanagari, Bengali, Gujarati, etc. — script
 * differences are handled via a tiny per-script table. It covers the
 * Devanagari block U+0900..U+097F and exposes a `indicReorder(cps,
 * script)` entry point.
 *
 * Algorithm (per Unicode §12 / Microsoft "Indic Shaping" docs):
 *
 *  1. Split the input into *clusters*. A cluster starts at a base
 *     consonant or independent vowel and runs up to (but not
 *     including) the next base consonant or end-of-run.
 *  2. Within each cluster:
 *      - If it begins with `Ra + Halant`, mark that as a reph that
 *        must move just before the base's matra (here: to the *end*
 *        of the cluster's pre-base section).
 *      - Move any pre-base matra (left-side dependent vowel) from
 *        after the base consonant to *before* it.
 *      - Keep nukta/halant/marks in their original cluster-relative
 *        order otherwise.
 *  3. Concatenate clusters back into a flat array.
 *
 * @module fonts/extra/shaper-indic
 */

/**
 * @typedef {(
 *   'consonant'|'vowel'|'vowel_mark_pre'|'vowel_mark_post'|
 *   'vowel_mark_above'|'vowel_mark_below'|
 *   'virama'|'nukta'|'mark'|'other'
 * )} IndicCategory
 */

import { fontErrors } from '../errors.js';

export const extraShaperIndic = {
    name: 'extraShaperIndic',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ContractError } = errors;

        /** Devanagari category table (U+0900..U+097F). */
        const DEVANAGARI_CATEGORIES_CONST = Object.freeze({
    // Various signs / marks
    0x0900: 'mark', 0x0901: 'mark', 0x0902: 'mark', 0x0903: 'vowel_mark_post',
    // Independent vowels
    0x0904: 'vowel', 0x0905: 'vowel', 0x0906: 'vowel', 0x0907: 'vowel',
    0x0908: 'vowel', 0x0909: 'vowel', 0x090A: 'vowel', 0x090B: 'vowel',
    0x090C: 'vowel', 0x090D: 'vowel', 0x090E: 'vowel', 0x090F: 'vowel',
    0x0910: 'vowel', 0x0911: 'vowel', 0x0912: 'vowel', 0x0913: 'vowel',
    0x0914: 'vowel',
    // Consonants (U+0915..U+0939) — all 'consonant'
    // (filled below in a loop, but listed here for documentation)
    // Nukta
    0x093C: 'nukta',
    // Avagraha
    0x093D: 'mark',
    // Dependent vowel signs (matras)
    0x093A: 'vowel_mark_above', 0x093B: 'vowel_mark_post',
    0x093E: 'vowel_mark_post',    // AA
    0x093F: 'vowel_mark_pre',     // I  — pre-base
    0x0940: 'vowel_mark_post',    // II
    0x0941: 'vowel_mark_below',   // U
    0x0942: 'vowel_mark_below',   // UU
    0x0943: 'vowel_mark_below',   // VOCALIC R
    0x0944: 'vowel_mark_below',   // VOCALIC RR
    0x0945: 'vowel_mark_above',
    0x0946: 'vowel_mark_above',
    0x0947: 'vowel_mark_above',   // E
    0x0948: 'vowel_mark_above',   // AI
    0x0949: 'vowel_mark_post',
    0x094A: 'vowel_mark_post',
    0x094B: 'vowel_mark_post',    // O
    0x094C: 'vowel_mark_post',    // AU
    0x094D: 'virama',             // HALANT
    0x094E: 'vowel_mark_pre',     // PRISHTHAMATRA E
    0x094F: 'vowel_mark_post',
    // Stress / accents
    0x0951: 'mark', 0x0952: 'mark', 0x0953: 'mark', 0x0954: 'mark',
    // Additional vowels / vocalic letters
    0x0960: 'vowel', 0x0961: 'vowel',
    0x0962: 'vowel_mark_below', 0x0963: 'vowel_mark_below',
    // Danda / double danda
    0x0964: 'other', 0x0965: 'other',
    // Digits
    0x0966: 'other', 0x0967: 'other', 0x0968: 'other', 0x0969: 'other',
    0x096A: 'other', 0x096B: 'other', 0x096C: 'other', 0x096D: 'other',
            0x096E: 'other', 0x096F: 'other'
        });

        // Fill in the consonant range as a mutable copy → re-freeze.
        const _devaMut = { ...DEVANAGARI_CATEGORIES_CONST };
        for (let cp = 0x0915; cp <= 0x0939; cp++) _devaMut[cp] = 'consonant';
        for (let cp = 0x0958; cp <= 0x095F; cp++) _devaMut[cp] = 'consonant';
        for (let cp = 0x0978; cp <= 0x097F; cp++) _devaMut[cp] = 'consonant';
        const DEVA_CATEGORIES_CONST = Object.freeze(_devaMut);

        const INDIC_SCRIPTS_CONST = Object.freeze({
            deva: DEVA_CATEGORIES_CONST
        });

        const DEVA_RA_CONST = 0x0930;

        function categorize(cp, script = 'deva') {
            const tbl = INDIC_SCRIPTS_CONST[script] || DEVA_CATEGORIES_CONST;
            return tbl[cp] || 'other';
        }

        function isBase(c) { return c === 'consonant' || c === 'vowel'; }

        function splitClusters(cps, script = 'deva') {
            const clusters = [];
            let start = 0;
            let cats = [];
            let lastWasVirama = false;

            for (let i = 0; i < cps.length; i++) {
                const c = categorize(cps[i], script);
                if (isBase(c) && cats.length > 0 && !lastWasVirama) {
                    clusters.push({ start, end: i, cats });
                    start = i;
                    cats = [];
                }
                cats.push(c);
                lastWasVirama = (c === 'virama');
            }
            if (cats.length > 0) clusters.push({ start, end: cps.length, cats });
            return clusters;
        }

        function reorderCluster(cps, cl, script) {
            const len = cl.end - cl.start;
            if (len <= 1) return cps.slice(cl.start, cl.end);

            let rephSlice = null;
            let bodyStart = cl.start;
            if (len >= 3
                && cps[cl.start] === DEVA_RA_CONST
                && cl.cats[1] === 'virama'
                && cl.cats[2] === 'consonant') {
                rephSlice = [cps[cl.start], cps[cl.start + 1]];
                bodyStart = cl.start + 2;
            }

            let baseIdx = -1;
            for (let i = bodyStart; i < cl.end; i++) {
                const c = categorize(cps[i], script);
                if (isBase(c)) { baseIdx = i; break; }
            }
            if (baseIdx < 0) return cps.slice(cl.start, cl.end);

            const preBase = [];
            const postBase = [];
            for (let i = baseIdx + 1; i < cl.end; i++) {
                const c = categorize(cps[i], script);
                if (c === 'vowel_mark_pre') preBase.push(cps[i]);
                else postBase.push(cps[i]);
            }

            const prefix = [];
            for (let i = bodyStart; i < baseIdx; i++) prefix.push(cps[i]);

            const out = [];
            for (const x of preBase) out.push(x);
            for (const x of prefix) out.push(x);
            out.push(cps[baseIdx]);
            for (const x of postBase) out.push(x);
            if (rephSlice) for (const x of rephSlice) out.push(x);
            return out;
        }

        function indicReorder(codePoints, script = 'deva') {
            if (!Array.isArray(codePoints))
                throw new ContractError('fonts/indic-input',
                    'indicReorder expects an array');
            if (typeof script !== 'string')
                throw new ContractError('fonts/indic-script',
                    'script must be a string');

            const cps = new Array(codePoints.length);
            for (let i = 0; i < codePoints.length; i++) {
                const v = codePoints[i];
                if (typeof v === 'number') cps[i] = v;
                else if (typeof v === 'string' && v.length > 0) cps[i] = v.codePointAt(0);
                else throw new ContractError('fonts/indic-input',
                    `invalid code point at index ${i}`, { context: { index: i, value: v } });
            }

            const clusters = splitClusters(cps, script);
            const out = [];
            for (const cl of clusters) {
                const r = reorderCluster(cps, cl, script);
                for (const x of r) out.push(x);
            }
            return out;
        }

        return {
            indicReorder, categorize, splitClusters,
            INDIC_SCRIPTS: INDIC_SCRIPTS_CONST,
            DEVA_CATEGORIES: DEVA_CATEGORIES_CONST,
            DEVANAGARI_CATEGORIES: DEVANAGARI_CATEGORIES_CONST,
            DEVA_RA: DEVA_RA_CONST
        };
    }
};

