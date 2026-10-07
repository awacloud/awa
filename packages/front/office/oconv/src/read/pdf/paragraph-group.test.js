// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { groupParagraphs } from './paragraph-group.js';

/** Positioned text piece helper (PDF origin bottom-left; y decreases down). */
const piece = (text, y, fontSize = 12, x = 72) => ({ text, x, y, fontSize });

describe('groupParagraphs — text-positioning heuristic (F5 tier 1)', () => {
    test('empty input yields no paragraphs', () => {
        expect(groupParagraphs([])).toEqual([]);
        expect(groupParagraphs(null)).toEqual([]);
    });

    test('pieces on the same baseline concatenate into one line/paragraph', () => {
        const paras = groupParagraphs([
            piece('Hello ', 700), piece('world', 700)
        ]);
        expect(paras).toEqual(['Hello world']);
    });

    test('close successive lines stay in one paragraph (joined by a space)', () => {
        // 12pt lines 14 units apart (< 1.6×12 = 19.2) → same paragraph.
        const paras = groupParagraphs([
            piece('first line', 700), piece('second line', 686)
        ]);
        expect(paras).toEqual(['first line second line']);
    });

    test('a blank-line-sized vertical gap opens a new paragraph', () => {
        // gap 40 > 1.6×12 = 19.2 → new paragraph.
        const paras = groupParagraphs([
            piece('para one', 700), piece('para two', 660)
        ]);
        expect(paras).toEqual(['para one', 'para two']);
    });

    test('an upward baseline move opens a new paragraph (new region/column)', () => {
        const paras = groupParagraphs([
            piece('bottom', 600), piece('above', 640)
        ]);
        expect(paras).toEqual(['bottom', 'above']);
    });

    test('font size scales the gap threshold', () => {
        // 24pt heading; next line 30 below. 30 < 1.6×24 = 38.4 → same paragraph.
        const same = groupParagraphs([piece('Big', 700, 24), piece('cont', 670, 24)]);
        expect(same).toEqual(['Big cont']);
        // 12pt; 30 below. 30 > 1.6×12 = 19.2 → split.
        const split = groupParagraphs([piece('Small', 700, 12), piece('next', 670, 12)]);
        expect(split).toEqual(['Small', 'next']);
    });

    test('empty-text pieces are ignored, never emitted as empty paragraphs', () => {
        const paras = groupParagraphs([
            piece('', 700), piece('real', 700), piece('', 660)
        ]);
        expect(paras).toEqual(['real']);
    });
});

describe('groupParagraphs — one space on a real horizontal gap (line pass)', () => {
    /** A piece with an end position: `x` .. `xEnd` on baseline `y`. */
    const at = (text, x, xEnd, y = 700, fontSize = 10) => ({ text, x, xEnd, y, fontSize });

    test('a gap wider than 0.15 em inserts exactly one space', () => {
        // 10 pt → threshold 1.5; gap 2 (0.2 em) → space.
        expect(groupParagraphs([at('Il', 72, 80), at('constitue', 82, 120)])).toEqual(['Il constitue']);
    });

    test('a gap at or under 0.15 em, a zero gap and an overlap over 0.15 em', () => {
        expect(groupParagraphs([at('ab', 72, 80), at('cd', 81.5, 90)])).toEqual(['abcd']);   // exactly 0.15 em
        expect(groupParagraphs([at('ab', 72, 80), at('cd', 80.5, 90)])).toEqual(['abcd']);   // 0.05 em
        expect(groupParagraphs([at('ab', 72, 80), at('cd', 80, 90)])).toEqual(['abcd']);     // touching
        // Re-pinned 2026-10-02 (office/BATCH_49/02, BL-1600, owner ruling A):
        // an overlap of more than 0.15 em (here 0.2 em) now inserts one space;
        // it used to be glued, 'abcd'.
        expect(groupParagraphs([at('ab', 72, 80), at('cd', 78, 90)])).toEqual(['ab cd']);    // overlap 0.2 em
    });

    // BL-1600 overlap half (office/BATCH_49/02, owner ruling A, 2026-10-02):
    // a piece that starts LEFT of the previous piece's end gets one space iff
    // the overlap exceeds wordGap × em — the same 0.15 em as a forward gap.
    // Red before the fix: the 0.2 em and 0.151 em overlaps came back glued.
    test('an overlap at or under 0.15 em still glues; over it, one space', () => {
        expect(groupParagraphs([at('d', 72, 80), at('’', 79.9, 82)])).toEqual(['d’']);     // 0.01 em (kerned apostrophe)
        expect(groupParagraphs([at('ab', 72, 80), at('cd', 78.5, 90)])).toEqual(['abcd']);   // exactly 0.15 em
        expect(groupParagraphs([at('ab', 72, 80), at('cd', 78.49, 90)])).toEqual(['ab cd']); // 0.151 em
    });

    test('the overlap threshold honours the wordGap option', () => {
        const ps = [at('ab', 72, 80), at('cd', 77, 90)];                   // overlap 0.3 em
        expect(groupParagraphs(ps, { wordGap: 0.25 })).toEqual(['ab cd']);
        expect(groupParagraphs(ps, { wordGap: 0.35 })).toEqual(['abcd']);
    });

    test('an overlap never doubles a space already on either side', () => {
        expect(groupParagraphs([at('ab ', 72, 80), at('cd', 78, 90)])).toEqual(['ab cd']);
        expect(groupParagraphs([at('ab', 72, 80), at(' cd', 78, 90)])).toEqual(['ab cd']);
    });

    test('the em is the PREVIOUS piece\'s font size', () => {
        // gap 2: 0.2 em of a 10 pt piece (space), 0.1 em of a 20 pt piece (none).
        expect(groupParagraphs([at('a', 72, 80, 700, 10), at('b', 82, 90, 700, 20)])).toEqual(['a b']);
        expect(groupParagraphs([at('a', 72, 80, 700, 20), at('b', 82, 90, 700, 10)])).toEqual(['ab']);
    });

    test('never doubles a space already at the end of the line so far or the start of the piece', () => {
        expect(groupParagraphs([at('Gamma ', 72, 110), at('Delta', 120, 150)])).toEqual(['Gamma Delta']);
        expect(groupParagraphs([at('Gamma', 72, 110), at(' Delta', 120, 150)])).toEqual(['Gamma Delta']);
    });

    test('a line whose pieces go backwards (right-to-left, rotated) gets no insertion at all', () => {
        // The second step goes backwards → the whole line joins as before.
        expect(groupParagraphs([at('a', 72, 80), at('b', 90, 98), at('c', 60, 68)])).toEqual(['abc']);
        // A piece whose end lies left of its start (rotated 180°).
        expect(groupParagraphs([at('a', 80, 72), at('b', 90, 82)])).toEqual(['ab']);
    });

    test('pieces without an end position join as before (no space inferred)', () => {
        const legacy = (text, x) => ({ text, x, y: 700, fontSize: 10 });
        expect(groupParagraphs([legacy('ab', 72), legacy('cd', 200)])).toEqual(['abcd']);
    });

    test('a zero font size never inserts', () => {
        expect(groupParagraphs([at('a', 72, 80, 700, 0), at('b', 90, 98, 700, 0)])).toEqual(['ab']);
    });

    test('the wordGap option sets the threshold (fraction of the em)', () => {
        const ps = [at('a', 72, 80), at('b', 83, 90)];                    // gap 0.3 em
        expect(groupParagraphs(ps, { wordGap: 0.25 })).toEqual(['a b']);
        expect(groupParagraphs(ps, { wordGap: 0.35 })).toEqual(['ab']);
    });

    test('the space rule never crosses lines — lines still join with one space', () => {
        expect(groupParagraphs([at('end', 72, 90, 700), at('next', 72, 92, 686)])).toEqual(['end next']);
    });
});

// BL-1600 (office/BATCH_49/02): a piece that exactly duplicates the previous
// piece of its line (same text, |Δx| ≤ 0.5 pt, |Δy| ≤ 0.5 pt — a label drawn
// twice at one place, e.g. a shadowed diagram label) is dropped. Red before
// the fix (measured 2026-10-02): the line read "Contrôler les
// autorisationsContrôler les autorisations" (ANSSI zero-trust guide).
describe('groupParagraphs — an exact duplicate of the previous piece is dropped (BL-1600)', () => {
    const at = (text, x, xEnd, y = 700, fontSize = 10) => ({ text, x, xEnd, y, fontSize });
    const LABEL = 'Contrôler les autorisations';
    const count = (s, sub) => s.split(sub).length - 1;

    test('the same text at the same position is kept once', () => {
        expect(groupParagraphs([at(LABEL, 72, 138), at(LABEL, 72, 138)])).toEqual([LABEL]);
    });

    test('|Δx| and |Δy| up to 0.5 pt are the same position (either sign)', () => {
        expect(groupParagraphs([at(LABEL, 72, 138), at(LABEL, 72.5, 138.5, 700.5)])).toEqual([LABEL]);
        expect(groupParagraphs([at(LABEL, 72, 138), at(LABEL, 71.5, 137.5, 699.5)])).toEqual([LABEL]);
    });

    test('a run of identical draws collapses to one', () => {
        expect(groupParagraphs([at('.', 72, 75), at('.', 72, 75), at('.', 72, 75)])).toEqual(['.']);
    });

    test('a duplicate dropped first leaves the rest of the line to the word-gap rule', () => {
        // The duplicate sits 0.3 pt LEFT of the original: dropped before the
        // line's direction is judged, so `cd` (0.2 em away) still gets its space.
        expect(groupParagraphs([at('ab', 72, 80), at('ab', 71.7, 79.7), at('cd', 82, 90)])).toEqual(['ab cd']);
    });

    // Kept WITH a space (owner ruling A, 2026-10-02): the copy overlaps the
    // original by far more than 0.15 em. Red before the overlap branch: both
    // came back glued, "…autorisationsContrôler…".
    test('a near-duplicate (Δx 0.6 pt, or Δy 0.6 pt) is kept, with a space', () => {
        expect(groupParagraphs([at(LABEL, 72, 138), at(LABEL, 72.6, 138.6)])).toEqual([`${LABEL} ${LABEL}`]);
        expect(groupParagraphs([at(LABEL, 72, 138), at(LABEL, 72, 138, 700.6)])).toEqual([`${LABEL} ${LABEL}`]);
    });

    test('a different text at the same position is kept, with a space', () => {
        expect(groupParagraphs([at(LABEL, 72, 138), at('Contrôler', 72, 110)])).toEqual([`${LABEL} Contrôler`]);
    });

    test('only the PREVIOUS piece is compared: a repeat further along the line is kept', () => {
        const out = groupParagraphs([at('ab', 72, 80), at('cd', 82, 90), at('ab', 72, 80)]);
        expect(out).toHaveLength(1);
        expect(count(out[0], 'ab')).toBe(2);
    });
});
