// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T15 (c), D38: the kerx and kern engine on tables built here byte by
// byte, parsed by aatKerx and tableKern and applied to positioned runs.

import { describe, test, expect } from 'bun:test';
import { aatKerxEngine } from './kerx-engine.js';
import { testRuntime } from '../_test-runtime.js';
import { be16, be32, kerx, lookup6, offsetBody, stx } from './_test-aat.js';

const { applyKerx, applyKern } = testRuntime.resolve('aatKerxEngine');
const { parseKerx } = testRuntime.resolve('aatKerx');

const i16s = (vals) => vals.flatMap((v) => be16(v & 0xFFFF));
const run = (glyphs) => glyphs.map((glyph) => ({ glyph, xAdvance: 100, yAdvance: 0, xOffset: 0, yOffset: 0, attach: null }));
const pos = (buf) => buf.map((g) => [g.glyph, g.xAdvance, g.xOffset, g.yOffset]);
const apply = (table, glyphs, opts) => { const buf = run(glyphs); const r = applyKerx(parseKerx(table), buf, opts); return { buf, r }; };

/** A format 0 kerx table of `[left, right, value]` pairs. */
const pairs0 = (list, coverage = 0) => kerx([{ format: 0, coverage, body: [...be32(list.length), ...be32(0), ...be32(0), ...be32(0), ...list.flatMap(([l, r, v]) => [...be16(l), ...be16(r), ...be16(v & 0xFFFF)])] }]);

describe('aatKerxEngine — descriptor', () => {
    test('a strict factory descriptor without dependencies, registered in the extras', async () => {
        const { extras } = await import('../../main.js');
        expect([aatKerxEngine.name, aatKerxEngine.dependencies]).toEqual(['aatKerxEngine', []]);
        expect(extras).toContain(aatKerxEngine);
    });
});

describe('aatKerxEngine — the pair machine (formats 0, 2, 6)', () => {
    test("each pair's value on the first glyph's advance", () => {
        expect(pos(apply(pairs0([[1, 2, -30], [2, 3, 15]]), [1, 2, 3, 1]).buf)).toEqual([[1, 70, 0, 0], [2, 115, 0, 0], [3, 100, 0, 0], [1, 100, 0, 0]]);
    });
    test('a mark between the two is skipped', () => {
        const isMark = (g) => g === 7;
        expect(pos(apply(pairs0([[1, 2, -30]]), [1, 7, 2], { isMark }).buf)).toEqual([[1, 70, 0, 0], [7, 100, 0, 0], [2, 100, 0, 0]]);
        expect(pos(apply(pairs0([[1, 2, -30]]), [1, 7, 2]).buf)[0][1]).toBe(100);
    });
    test('cross-stream: the second glyph\'s y offset is set, and the chain adds the y offsets up', () => {
        const { buf } = apply(pairs0([[1, 2, 40]], 0x40000000), [1, 2, 3]);
        expect(pos(buf)).toEqual([[1, 100, 0, 0], [2, 100, 0, 40], [3, 100, 0, 0]]);
        expect(buf.map((g) => g.attach)).toEqual([null, { to: 0, kind: 'cursive' }, { to: 1, kind: 'cursive' }]);
    });
    test('formats 2 and 6 through their kern(left, right)', () => {
        const f2 = kerx([{ format: 2, body: offsetBody([4, { part: 0 }, { part: 1 }, { part: 2 }], [lookup6({ 1: 1 }), lookup6({ 2: 0 }), i16s([0, -50])]) }]);
        expect(pos(apply(f2, [1, 2]).buf)[0][1]).toBe(50);
        const f6 = kerx([{ format: 6, body: offsetBody([0, (1 << 16) | 1, { part: 0 }, { part: 1 }, { part: 2 }], [lookup6({ 1: 0 }), lookup6({ 2: 1 }), i16s([0, 25])]) }]);
        expect(pos(apply(f6, [1, 2]).buf)[0][1]).toBe(125);
    });
    test('kern: false turns the pair machine off; a vertical subtable is skipped', () => {
        expect(pos(apply(pairs0([[1, 2, -30]]), [1, 2], { kern: false }).buf)[0][1]).toBe(100);
        expect(pos(apply(pairs0([[1, 2, -30]], 0x80000000), [1, 2]).buf)[0][1]).toBe(100);
    });
    test('the backwards bit reverses the order against left-to-right text, and right-to-left text reverses it', () => {
        // Reversed, the pair (2, 1) of [1, 2] is kerned on glyph 2.
        expect(pos(apply(pairs0([[2, 1, -30]], 0x10000000), [1, 2]).buf).map((p) => p[1])).toEqual([100, 70]);
        expect(pos(apply(pairs0([[2, 1, -30]]), [1, 2], { direction: 'rtl' }).buf).map((p) => p[1])).toEqual([100, 70]);
        expect(pos(apply(pairs0([[2, 1, -30]], 0x10000000), [1, 2], { direction: 'rtl' }).buf).map((p) => p[1])).toEqual([100, 100]);
    });
});

/** A format 1 machine: glyphs 1 and 2 push; glyph 3 pushes and acts from `at`; glyph 4 resets. */
const machine1 = (values, at = 0, tupleCount = 0, coverage = 0) => kerx([{
    format: 1, coverage, tupleCount, body: stx({
        nClasses: 8, classes: lookup6({ 1: 4, 2: 4, 3: 5, 4: 6 }), states: [[0, 0, 0, 0, 1, 2, 3, 0]],
        entries: [{ newState: 0, flags: 0, data: [0xFFFF] }, { newState: 0, flags: 0x8000, data: [0xFFFF] },
            { newState: 0, flags: 0x8000, data: [at] }, { newState: 0, flags: 0x2000, data: [0xFFFF] }],
        extras: [i16s(values)]
    })
}]);

describe('aatKerxEngine — format 1, state-machine kerning', () => {
    test('an action pops the stack, each value on the advance and the x offset, an odd value ending it', () => {
        // Popped: 3 takes -20, then 2 takes 11 (odd: 10, last); 1 is left on the stack.
        expect(pos(apply(machine1([-20, 11, 30]), [1, 2, 3]).buf)).toEqual([[1, 100, 0, 0], [2, 110, 10, 0], [3, 80, -20, 0]]);
    });
    test('reset clears the stack; a tuple count strides the values', () => {
        expect(pos(apply(machine1([-20, 11]), [1, 4, 3]).buf)).toEqual([[1, 100, 0, 0], [4, 100, 0, 0], [3, 80, -20, 0]]);
        expect(pos(apply(machine1([-20, 99, 11, 99], 0, 2), [2, 3]).buf)).toEqual([[2, 110, 10, 0], [3, 80, -20, 0]]);
    });
    test('values past the table clear the stack; a full stack (8) is cleared', () => {
        expect(pos(apply(machine1([-20]), [1, 2, 3]).buf).map((p) => p[1])).toEqual([100, 100, 100]);
        const nine = [1, 1, 1, 1, 1, 1, 1, 1, 3];
        // The ninth push finds the stack full and clears it: the action then has nothing to pop.
        expect(pos(apply(machine1([-21]), nine).buf).map((p) => p[1])).toEqual(Array(9).fill(100));
    });
    test('kern: false turns it off; cross-stream adds to a chained glyph\'s y offset, -0x8000 unchains it', () => {
        expect(pos(apply(machine1([-20, 11]), [2, 3], { kern: false }).buf).map((p) => p[1])).toEqual([100, 100]);
        const { buf } = apply(machine1([-20, 11], 0, 0, 0x40000000), [2, 3]);
        // The first glyph is chained to nothing, so its value is not applied.
        expect(pos(buf)).toEqual([[2, 100, 0, 0], [3, 100, 0, -20]]);
        // One glyph pushed (glyph 5 does not push), one value: -0x8000, odd-marked as the last.
        const un = apply(machine1([-0x8000 + 1], 0, 0, 0x40000000), [5, 3]).buf;
        expect([un[1].attach, un[1].yOffset]).toEqual([null, 0]);
    });
    test("a step that does not advance spends the budget", () => {
        const loop = kerx([{ format: 1, body: stx({ nClasses: 5, classes: lookup6({ 1: 4 }), states: [[0, 0, 0, 0, 1]], entries: [{ newState: 0, flags: 0, data: [0xFFFF] }, { newState: 0, flags: 0x4000, data: [0xFFFF] }], extras: [[]] }) }]);
        const state = { budget: 3, truncated: false };
        expect(apply(loop, [1, 1], { state }).r.truncated).toBe(true);
    });
});

/** A format 4 machine: glyph 1 marks; glyph 2 attaches by action `0`; the action type and data as given. */
const machine4 = (type, data) => {
    const body = stx({
        nClasses: 6, classes: lookup6({ 1: 4, 2: 5 }), states: [[0, 0, 0, 0, 1, 2]],
        entries: [{ newState: 0, flags: 0, data: [0xFFFF] }, { newState: 0, flags: 0x8000, data: [0xFFFF] }, { newState: 0, flags: 0, data: [0] }],
        extras: [data]
    });
    const off = ((body[16] << 24) | (body[17] << 16) | (body[18] << 8) | body[19]) >>> 0;
    return kerx([{ format: 4, body: [...body.slice(0, 16), ...be32(((type << 30) | off) >>> 0), ...body.slice(20)] }]);
};

describe('aatKerxEngine — format 4, attachment', () => {
    test('control points: the mark\'s point minus the current one, attached to the mark', () => {
        const point = (g, i) => (g === 1 && i === 3 ? { x: 400, y: 600 } : g === 2 && i === 1 ? { x: 50, y: 10 } : null);
        const { buf } = apply(machine4(0, i16s([3, 1])), [1, 5, 2], { point });
        expect(pos(buf)[2]).toEqual([2, 100, 350, 590]);
        expect(buf[2].attach).toEqual({ to: 0, kind: 'mark' });
        expect(apply(machine4(0, i16s([3, 2])), [1, 2], { point }).buf[1].attach).toBe(null);
    });
    test('anchors: from opts.anchors, a missing one at 0, 0', () => {
        const anchors = (g) => (g === 1 ? [{ x: 7, y: 8 }, { x: 300, y: 500 }] : g === 2 ? [{ x: 20, y: 30 }] : []);
        expect(pos(apply(machine4(1, i16s([1, 0])), [1, 2], { anchors }).buf)[1]).toEqual([2, 100, 280, 470]);
        expect(pos(apply(machine4(1, i16s([1, 5])), [1, 2], { anchors }).buf)[1]).toEqual([2, 100, 300, 500]);
    });
    test('coordinates: the action\'s mark and current points', () => {
        expect(pos(apply(machine4(2, i16s([100, -20, 30, 40])), [1, 2]).buf)[1]).toEqual([2, 100, 70, -60]);
        expect(apply(machine4(2, i16s([100])), [1, 2]).buf[1].attach).toBe(null);
    });
    test('no action before a mark is set; kern: false leaves attachments on', () => {
        expect(apply(machine4(2, i16s([100, 0, 0, 0])), [2, 1]).buf.map((g) => g.attach)).toEqual([null, null]);
        expect(pos(apply(machine4(2, i16s([100, 0, 0, 0])), [1, 2], { kern: false }).buf)[1][2]).toBe(100);
    });
});

describe('aatKerxEngine — applyKern', () => {
    const kernTable = (list) => ({ tables: [{ format: 0, horizontal: true, kern: (l, r) => list.find((p) => p[0] === l && p[1] === r)?.[2] || 0 },
        { format: 0, horizontal: false, kern: () => 999 }, { format: 2, parsed: false }] });
    test('the horizontal format 0 subtables through the pair machine; vertical and unparsed ones skipped', () => {
        const buf = run([1, 2]);
        applyKern(kernTable([[1, 2, -40]]), buf);
        expect(pos(buf)).toEqual([[1, 60, 0, 0], [2, 100, 0, 0]]);
        const off = run([1, 2]);
        applyKern(kernTable([[1, 2, -40]]), off, { kern: false });
        expect(pos(off)[0][1]).toBe(100);
    });
});
