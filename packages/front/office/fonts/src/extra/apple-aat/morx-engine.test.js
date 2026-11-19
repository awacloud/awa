// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T15 (a), D38: the morx engine on morx tables built here byte by byte,
// parsed by aatMorx and applied to glyph runs.

import { describe, test, expect } from 'bun:test';
import { aatMorxEngine } from './morx-engine.js';
import { testRuntime } from '../_test-runtime.js';
import { lookup6, lookup8, morx, stx, substitutionList } from './_test-aat.js';

const { applyMorx, chainFlags } = testRuntime.resolve('aatMorxEngine');
const { parseMorx } = testRuntime.resolve('aatMorx');

const run = (glyphs) => glyphs.map((g, k) => ({ glyph: g, cluster: k }));
const ids = (r) => r.glyphs.map((g) => g.glyph);
const apply = (table, glyphs, opts) => applyMorx(parseMorx(table), run(glyphs), opts);

// Glyph names of the rearrangement legs: the range A B x C D, marked first at A and last at D.
const A = 10, B = 11, X = 12, C = 13, D = 20;

/** A rearrangement machine: glyph 10 marks first, glyph 20 marks last and runs `verb`. */
const rearrange = (verb) => stx({
    nClasses: 6, classes: lookup6({ 10: 4, 20: 5 }), states: [[0, 0, 0, 0, 1, 2]],
    entries: [{ newState: 0, flags: 0 }, { newState: 0, flags: 0x8000 }, { newState: 0, flags: 0x2000 | verb }]
});
const table0 = (verb, sub = {}) => morx([{ subtables: [{ type: 0, body: rearrange(verb), ...sub }] }]);

describe('aatMorxEngine — descriptor', () => {
    test('a strict factory descriptor without dependencies, registered in the extras', async () => {
        const { extras } = await import('../../main.js');
        expect([aatMorxEngine.name, aatMorxEngine.dependencies]).toEqual(['aatMorxEngine', []]);
        expect(extras).toContain(aatMorxEngine);
    });
});

describe('aatMorxEngine — type 0, rearrangement', () => {
    const expected = [
        [A, B, X, C, D], [B, X, C, D, A], [D, A, B, X, C], [D, B, X, C, A],
        [X, C, D, A, B], [X, C, D, B, A], [C, D, A, B, X], [D, C, A, B, X],
        [C, D, B, X, A], [D, C, B, X, A], [D, X, C, A, B], [D, X, C, B, A],
        [C, D, X, A, B], [C, D, X, B, A], [D, C, X, A, B], [D, C, X, B, A]
    ];
    for (let verb = 0; verb < 16; verb++) {
        test(`verb ${verb}`, () => {
            expect(ids(apply(table0(verb), [A, B, X, C, D]))).toEqual(expected[verb]);
        });
    }
    test('the glyphs around the range stay; the range\'s clusters merge to its first', () => {
        const r = apply(table0(1), [5, A, B, D, 6]);
        expect(ids(r)).toEqual([5, B, D, A, 6]);
        expect(r.glyphs.map((g) => g.cluster)).toEqual([0, 1, 1, 1, 4]);
    });
    test('a range shorter than the verb needs, or longer than 64 glyphs, is left alone', () => {
        expect(ids(apply(table0(15), [A, B, D]))).toEqual([A, B, D]);
        const long = [A, ...Array(63).fill(B), D];
        expect(ids(apply(table0(1), long))).toEqual(long);
        expect(ids(apply(table0(1), [A, ...Array(62).fill(B), D]))).toEqual([...Array(62).fill(B), D, A]);
    });
    test('no mark last, no verb: nothing moves', () => {
        expect(ids(apply(table0(1), [A, B, X]))).toEqual([A, B, X]);
    });
});

/** A contextual machine: glyph 10 sets the mark; glyph 20 substitutes the mark (lookup 0) and itself (lookup 1); at end of text, the current glyph through lookup 2. */
const contextual = () => stx({
    nClasses: 6, classes: lookup6({ 10: 4, 20: 5 }), states: [[2, 0, 0, 0, 1, 3]],
    entries: [
        { newState: 0, flags: 0, data: [0xFFFF, 0xFFFF] },
        { newState: 0, flags: 0x8000, data: [0xFFFF, 0xFFFF] },
        { newState: 0, flags: 0, data: [0xFFFF, 2] },
        { newState: 0, flags: 0, data: [0, 1] }
    ],
    extras: [substitutionList([lookup6({ 10: 30 }), lookup6({ 20: 40 }), lookup8(7, [8])])]
});
const table1 = (sub = {}) => morx([{ subtables: [{ type: 1, body: contextual(), ...sub }] }]);

describe('aatMorxEngine — type 1, contextual', () => {
    test('the marked glyph and the current glyph through their lookups', () => {
        expect(ids(apply(table1(), [10, 5, 20]))).toEqual([30, 5, 40]);
    });
    test('without a mark, the mark index acts on glyph 0', () => {
        expect(ids(apply(table1(), [10, 20].reverse()))).toEqual([40, 10]);
    });
    test('at end of text: nothing before a mark is set; the last glyph after', () => {
        expect(ids(apply(table1(), [7]))).toEqual([7]);
        expect(ids(apply(table1(), [10, 7]))).toEqual([10, 8]);
        expect(ids(apply(table1(), []))).toEqual([]);
    });
});

describe('aatMorxEngine — type 4, noncontextual; deleted glyphs', () => {
    const table4 = (map) => morx([{ subtables: [{ type: 4, body: lookup6(map) }] }]);
    test('every glyph through the lookup', () => {
        expect(ids(apply(table4({ 1: 2, 3: 4 }), [1, 3, 5]))).toEqual([2, 4, 5]);
    });
    test('a glyph turned into 0xFFFF is removed after the last chain', () => {
        const r = apply(table4({ 3: 0xFFFF }), [1, 3, 5]);
        expect(r.glyphs).toEqual([{ glyph: 1, cluster: 0 }, { glyph: 5, cluster: 2 }]);
    });
});

describe('aatMorxEngine — flags, features, orientation, direction', () => {
    const nc = (sub, chain = {}) => morx([{ ...chain, subtables: [{ type: 4, body: lookup6({ 1: 2 }), ...sub }] }]);
    test('a subtable runs when its feature flags meet the chain\'s', () => {
        expect(ids(apply(nc({ flags: 2 }), [1]))).toEqual([1]);
        expect(ids(apply(nc({ flags: 3 }), [1]))).toEqual([2]);
    });
    test('a requested feature setting applies its entries\' disable then enable flags, in order', () => {
        const chain = { defaultFlags: 1, features: [{ type: 1, setting: 2, enable: 2, disable: 0xFFFFFFFE }, { type: 1, setting: 3, enable: 0, disable: 0xFFFFFFFD }] };
        const t = nc({ flags: 2 }, chain);
        expect(ids(apply(t, [1], { features: [{ type: 1, setting: 2 }] }))).toEqual([2]);
        expect(ids(apply(t, [1], { features: [{ type: 1, setting: 2 }, { type: 1, setting: 3 }] }))).toEqual([1]);
        expect(ids(apply(t, [1], { features: [{ type: 9, setting: 2 }] }))).toEqual([1]);
        const parsed = parseMorx(t).chains[0];
        expect([chainFlags(parsed, []), chainFlags(parsed, [{ type: 1, setting: 2 }])]).toEqual([1, 2]);
    });
    test('a vertical-only subtable does not run on horizontal text; with both orientations it does', () => {
        expect(ids(apply(nc({ coverage: 0x80000000 }), [1]))).toEqual([1]);
        expect(ids(apply(nc({ coverage: 0xA0000000 }), [1]))).toEqual([2]);
    });
    test('the processing order, as HarfBuzz reads the logical-order and descending bits with the direction', () => {
        // Forward, glyph 10 is marked and glyph 20 substitutes it; backward, 20 comes first and the mark is never 10.
        const cases = [
            [0x00000000, 'ltr', [30, 40]], [0x40000000, 'ltr', [10, 40]],
            [0x10000000, 'ltr', [30, 40]], [0x50000000, 'ltr', [10, 40]],
            [0x00000000, 'rtl', [10, 40]], [0x40000000, 'rtl', [30, 40]],
            [0x10000000, 'rtl', [30, 40]], [0x50000000, 'rtl', [10, 40]]
        ];
        for (const [coverage, direction, want] of cases) {
            expect([coverage, direction, ids(apply(table1({ coverage }), [10, 20], { direction }))]).toEqual([coverage, direction, want]);
        }
    });
    test('a subtable that did not decode, or of a type the engine does not run, is skipped', () => {
        const t = morx([{ subtables: [{ type: 0, body: [0, 0, 0, 3] }, { type: 3, body: [1, 2, 3, 4] }, { type: 4, body: lookup6({ 1: 2 }) }] }]);
        expect(ids(apply(t, [1]))).toEqual([2]);
    });
});

describe('aatMorxEngine — the budget', () => {
    const loop = morx([{ subtables: [{ type: 0, body: stx({ nClasses: 5, classes: lookup6({ 10: 4 }), states: [[0, 0, 0, 0, 1]], entries: [{ newState: 0, flags: 0 }, { newState: 0, flags: 0x4000 }] }) }] }]);
    test('a step that does not advance spends a unit; past the budget the driver advances and says so', () => {
        const state = { budget: 5, truncated: false };
        const r = apply(loop, [10, 1], { state });
        expect([ids(r), r.truncated, state.budget]).toEqual([[10, 1], true, 0]);
    });
    test('the default budget is fresh per call', () => {
        expect(apply(table0(1), [A, D]).truncated).toBe(false);
    });
});

// T15 (b), D38: ligature and insertion, through the output buffer.
const be32s = (vals) => vals.flatMap((v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]);
const be16s = (vals) => vals.flatMap((v) => [(v >> 8) & 0xFF, v & 0xFF]);

/**
 * A ligature machine: glyphs 1, 2, 3 push themselves (set-component); glyph 3
 * also performs the actions from `start`; `eot` makes the end of text perform
 * them instead. The component values are `components`, indexed by glyph +
 * offset; the ligature at the summed index is `ligatures`.
 */
const ligMachine = ({ actions, components = [0, 0, 0, 0], ligatures = [50], start = 0, eot = false }) => stx({
    nClasses: 7, classes: lookup6({ 1: 4, 2: 5, 3: 6 }), states: [[eot ? 3 : 0, 0, 0, 0, 1, 1, eot ? 1 : 2]],
    entries: [
        { newState: 0, flags: 0, data: [0] },
        { newState: 0, flags: 0x8000, data: [0] },
        { newState: 0, flags: 0x8000 | 0x2000, data: [start] },
        { newState: 0, flags: 0x2000, data: [start] }
    ],
    extras: [be32s(actions), be16s(components), be16s(ligatures)]
});
const table2 = (o) => morx([{ subtables: [{ type: 2, body: ligMachine(o) }] }]);
const LAST = 0x80000000, STORE = 0x40000000;

describe('aatMorxEngine — type 2, ligature', () => {
    test('the components popped, their values summed, the ligature written at the first; the others deleted, the clusters merged', () => {
        const r = apply(table2({ actions: [0, 0, LAST] }), [9, 1, 2, 3, 9]);
        expect(r.glyphs).toEqual([{ glyph: 9, cluster: 0 }, { glyph: 50, cluster: 1 }, { glyph: 9, cluster: 4 }]);
    });
    test('the ligature index sums component(glyph + offset), the offset a signed 30-bit value', () => {
        // Offset -1 (0x3FFFFFFF): component(glyph - 1); 3 -> comp[2] = 1, 2 -> comp[1] = 1, 1 -> comp[0] = 1: ligature 3.
        const t = table2({ actions: [0x3FFFFFFF, 0x3FFFFFFF, LAST | 0x3FFFFFFF], components: [1, 1, 1, 0], ligatures: [0, 0, 0, 77] });
        expect(ids(apply(t, [1, 2, 3]))).toEqual([77]);
    });
    test('glyphs between the components that push nothing stay', () => {
        expect(ids(apply(table2({ actions: [0, 0, LAST] }), [1, 7, 2, 3]))).toEqual([50, 7]);
    });
    test('store writes a ligature and goes on; last ends the run', () => {
        // 3 stored as ligature 0 (50); then 2 and 1 summed (index 0 again) and written at 1, the stored one deleted.
        expect(ids(apply(table2({ actions: [STORE, 0, LAST], ligatures: [50] }), [1, 2, 3]))).toEqual([50]);
        expect(ids(apply(table2({ actions: [LAST], ligatures: [50] }), [1, 2, 3]))).toEqual([1, 2, 50]);
    });
    test('more actions than components: the stack underflows and the run stops', () => {
        expect(ids(apply(table2({ actions: [0, 0, 0, LAST] }), [2, 3]))).toEqual([2, 3]);
    });
    test('a read past the body stops the run', () => {
        expect(ids(apply(table2({ actions: [0, 0, LAST], start: 9 }), [1, 2, 3]))).toEqual([1, 2, 3]);
        expect(ids(apply(table2({ actions: [LAST], ligatures: [] }), [3]))).toEqual([3]);
        expect(ids(apply(table2({ actions: [LAST | 50] }), [3]))).toEqual([3]);
    });
    test('no action at the end of text', () => {
        expect(ids(apply(table2({ actions: [0, LAST], eot: true }), [1, 2]))).toEqual([1, 2]);
    });
    test('a component pushed twice at one position counts once', () => {
        // Glyph 1 pushes itself and does not advance once (state 1), then pushes again.
        const body = stx({
            nClasses: 6, classes: lookup6({ 1: 4, 3: 5 }), states: [[0, 0, 0, 0, 1, 3], [0, 0, 0, 0, 2, 3]],
            entries: [{ newState: 0, flags: 0, data: [0] }, { newState: 1, flags: 0xC000, data: [0] }, { newState: 0, flags: 0x8000, data: [0] }, { newState: 0, flags: 0xA000, data: [0] }],
            extras: [be32s([0, LAST]), be16s([0, 0, 0, 0]), be16s([50])]
        });
        expect(ids(apply(morx([{ subtables: [{ type: 2, body }] }]), [1, 3]))).toEqual([50]);
    });
});

/**
 * An insertion machine: glyph 1 (M) sets the mark; 2 inserts [20, 21] before
 * the mark, 3 after it; 4 inserts them before the current glyph, 5 after it;
 * 6 sets the mark and inserts after itself; 7 inserts [22] after itself without
 * advancing and moves to state 1, where nothing happens; 8 inserts [22] after
 * itself without advancing and stays in state 0.
 */
const insMachine = () => stx({
    nClasses: 13,
    classes: lookup6({ 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9, 7: 10, 8: 11 }),
    states: [[0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 9, 0], [0, 0, 0, 0, 8, 8, 8, 8, 8, 8, 8, 8, 8]],
    entries: [
        { newState: 0, flags: 0, data: [0xFFFF, 0xFFFF] },
        { newState: 0, flags: 0x8000, data: [0xFFFF, 0xFFFF] },
        { newState: 0, flags: 0x0400 | 2, data: [0xFFFF, 0] },
        { newState: 0, flags: 2, data: [0xFFFF, 0] },
        { newState: 0, flags: 0x0800 | (2 << 5), data: [0, 0xFFFF] },
        { newState: 0, flags: 2 << 5, data: [0, 0xFFFF] },
        { newState: 0, flags: 0x8000 | (2 << 5), data: [0, 0xFFFF] },
        { newState: 1, flags: 0x4000 | (1 << 5), data: [2, 0xFFFF] },
        { newState: 1, flags: 0, data: [0xFFFF, 0xFFFF] },
        { newState: 0, flags: 0x4000 | (1 << 5), data: [2, 0xFFFF] }
    ],
    extras: [be16s([20, 21, 22])]
});
const table5 = morx([{ subtables: [{ type: 5, body: insMachine() }] }]);

describe('aatMorxEngine — type 5, insertion', () => {
    test('at the mark: before it or after it', () => {
        expect(ids(apply(table5, [1, 2]))).toEqual([20, 21, 1, 2]);
        expect(ids(apply(table5, [1, 3]))).toEqual([1, 20, 21, 3]);
        expect(ids(apply(table5, [9, 1, 9, 3]))).toEqual([9, 1, 20, 21, 9, 3]);
    });
    test('at the current glyph: before it or after it; the inserted glyphs copy its cluster', () => {
        expect(ids(apply(table5, [4]))).toEqual([20, 21, 4]);
        const r = apply(table5, [9, 5]);
        expect(r.glyphs).toEqual([{ glyph: 9, cluster: 0 }, { glyph: 5, cluster: 1 }, { glyph: 20, cluster: 1 }, { glyph: 21, cluster: 1 }]);
    });
    test('a mark never set is the first glyph; several insertions on one mark', () => {
        expect(ids(apply(table5, [2]))).toEqual([20, 21, 2]);
        expect(ids(apply(table5, [1, 2, 2]))).toEqual([20, 21, 20, 21, 1, 2, 2]);
    });
    test('set-mark on the inserting step marks where the step started', () => {
        expect(ids(apply(table5, [6, 2]))).toEqual([20, 21, 6, 20, 21, 2]);
    });
    test("with don't-advance the cursor stays on the current glyph, so the machine reads the insertion", () => {
        expect(ids(apply(table5, [7]))).toEqual([7, 22]);
    });
    test('each glyph inserted spends the budget; past it nothing is inserted and the run says so', () => {
        const state = { budget: 3, truncated: false };
        const r = apply(table5, [8], { state });
        // Budget 3: an insertion (1), a step that does not advance (1), an insertion (1); then the driver advances.
        expect([ids(r), r.truncated, state.budget]).toEqual([[8, 22, 22], true, 0]);
    });
    test('an insertion index past the body inserts nothing', () => {
        const body = stx({
            nClasses: 5, classes: lookup6({ 4: 4 }), states: [[0, 0, 0, 0, 1]],
            entries: [{ newState: 0, flags: 0, data: [0xFFFF, 0xFFFF] }, { newState: 0, flags: 2 << 5, data: [5, 0xFFFF] }],
            extras: [be16s([20])]
        });
        expect(ids(apply(morx([{ subtables: [{ type: 5, body }] }]), [4]))).toEqual([4]);
    });
});
