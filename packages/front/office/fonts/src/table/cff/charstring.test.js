// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T14 (b), D39: a CFF2 charstring's blend at region scalars
// (decodeCharstring's ctx.cff2.scalars).

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../../main.js';

let decodeCharstring;
beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    ({ decodeCharstring } = rt.resolve('tableCff'));
});

const n = (v) => v + 139;
const pts = (r) => r.commands.filter((c) => c.x !== undefined).map((c) => [c.x, c.y]);

describe('tableCff.decodeCharstring — the CFF2 blend at scalars (T14 b)', () => {
    // 10 20 (+5 -4 at the one region) 2 blend rmoveto; 30 (+6, +2 at vsindex 1's two regions) 0 1 blend... rlineto
    const one = new Uint8Array([n(10), n(20), n(5), n(-4), n(2), 16, 21]);
    test('without scalars a blend keeps its default operands', () => {
        expect(pts(decodeCharstring(one, { cff2: { regionCounts: [1] } }))).toEqual([[10, 20]]);
    });
    test('with scalars each default gains its deltas times their regions\' scalars', () => {
        expect(pts(decodeCharstring(one, { cff2: { regionCounts: [1], scalars: [[0.5]] } }))).toEqual([[12.5, 18]]);
        expect(pts(decodeCharstring(one, { cff2: { regionCounts: [1], scalars: [[0]] } }))).toEqual([[10, 20]]);
    });
    test('vsindex picks the region count and the scalars of another item variation data', () => {
        // 1 vsindex; 30 0 6 2 0 0 2 blend: 30 + 6*0.5 + 2*1 = 35, 0 + 0 = 0; rmoveto
        const cs = new Uint8Array([n(1), 15, n(30), n(0), n(6), n(2), n(0), n(0), n(2), 16, 21]);
        expect(pts(decodeCharstring(cs, { cff2: { regionCounts: [1, 2], scalars: [[9], [0.5, 1]] } }))).toEqual([[35, 0]]);
        expect(pts(decodeCharstring(cs, { cff2: { regionCounts: [1, 2], vsindex: 0, scalars: [[9]] } }))).toEqual([[30, 0]]);
    });
});

describe('tableCff.decodeCharstring — the width before stem hints (T17 b)', () => {
    // hstem / vstem / hstemhm / vstemhm take pairs, hintmask / cntrmask the
    // implicit vstems' pairs: an odd count means a width first.
    const ctx = { nominalWidthX: 100 };
    test('an even count before a stem operator is no width', () => {
        expect(decodeCharstring(new Uint8Array([n(10), n(20), 1, n(0), n(0), 21, 14]), ctx).width).toBeUndefined();
        expect(decodeCharstring(new Uint8Array([n(10), n(20), n(30), n(40), 18, n(5), n(5), 23, n(0), n(0), 21, 14]), ctx).width).toBeUndefined();
        expect(decodeCharstring(new Uint8Array([n(10), n(20), 3, n(0), n(0), 21, 14]), ctx).width).toBeUndefined();
    });
    test('an odd count before a stem operator holds the width', () => {
        expect(decodeCharstring(new Uint8Array([n(50), n(10), n(20), 1, n(0), n(0), 21, 14]), ctx).width).toBe(150);
        expect(decodeCharstring(new Uint8Array([n(50), n(10), n(20), 23, n(0), n(0), 21, 14]), ctx).width).toBe(150);
    });
    test('before hintmask, the implicit vstems: an odd count holds the width', () => {
        // 10 20 hstem, then 7 30 40 hintmask <1 byte> : width 7, one vstem pair
        const cs = new Uint8Array([n(10), n(20), 1, n(7), n(30), n(40), 19, 0xC0, n(0), n(0), 21, 14]);
        expect(decodeCharstring(cs, ctx).width).toBeUndefined(); // the width can only come first: the hstem already took the first op
        const first = new Uint8Array([n(7), n(30), n(40), 19, 0x80, n(0), n(0), 21, 14]);
        expect(decodeCharstring(first, ctx).width).toBe(107);
        const even = new Uint8Array([n(30), n(40), 19, 0x80, n(0), n(0), 21, 14]);
        expect(decodeCharstring(even, ctx).width).toBeUndefined();
    });
});
