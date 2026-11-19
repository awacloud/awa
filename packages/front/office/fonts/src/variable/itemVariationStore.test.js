// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T14 (a), D39: the item variation store and the delta-set index map, on
// structures built here byte by byte.

import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { varItemStore } from './itemVariationStore.js';

let parseItemVariationStore, parseDeltaSetIndexMap, ParseError;
beforeAll(() => {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    ({ parseItemVariationStore, parseDeltaSetIndexMap } = rt.resolve('varItemStore'));
    ({ ParseError } = rt.resolve('fontErrors'));
});

const be16 = (v) => [(v >> 8) & 0xFF, v & 0xFF];
const be32 = (v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
const f2 = (v) => be16(Math.round(v * 16384) & 0xFFFF);
const code = (fn) => { try { fn(); } catch (e) { return e instanceof ParseError ? e.code : `not a ParseError: ${e}`; } return null; };

/**
 * A store: `regions` as [[start, peak, end] per axis], `data` as
 * { indexes, words, long, rows: [[delta…]] }.
 */
function store(regions, data) {
    const axisCount = regions.length ? regions[0].length : 1;
    const regionList = [...be16(axisCount), ...be16(regions.length), ...regions.flatMap((r) => r.flatMap(([s, p, e]) => [...f2(s), ...f2(p), ...f2(e)]))];
    const blobs = data.map((d) => {
        const head = [...be16(d.rows.length), ...be16((d.long ? 0x8000 : 0) | d.words), ...be16(d.indexes.length), ...d.indexes.flatMap(be16)];
        const rows = d.rows.flatMap((row) => row.flatMap((v, n) => (n < d.words ? (d.long ? be32(v >>> 0) : be16(v & 0xFFFF)) : (d.long ? be16(v & 0xFFFF) : [v & 0xFF]))));
        return [...head, ...rows];
    });
    const head = 8 + 4 * data.length;
    let at = head + regionList.length;
    const offs = blobs.map((b) => { const o = at; at += b.length; return o; });
    return new Uint8Array([...be16(1), ...be32(head), ...be16(data.length), ...offs.flatMap(be32), ...regionList, ...blobs.flat()]);
}

describe('varItemStore — descriptor', () => {
    test('a strict factory descriptor on fontErrors, registered in the modules', () => {
        expect([varItemStore.name, varItemStore.dependencies]).toEqual(['varItemStore', ['fontErrors']]);
        expect(modules).toContain(varItemStore);
    });
});

describe('varItemStore — parseItemVariationStore', () => {
    const s = () => parseItemVariationStore(store(
        [[[0, 1, 1]], [[-1, -1, 0]], [[0, 0.5, 1]]],
        [{ indexes: [0, 1, 2], words: 1, long: false, rows: [[100, -20, 10], [-300, 5, 0]] }]
    ), 0);
    test('an item: its deltas scaled by their regions, summed', () => {
        expect(s().delta(0, 0, [1])).toBe(100 + 0 + 0);
        expect(s().delta(0, 0, [0.5])).toBe(50 + 10);
        expect(s().delta(0, 0, [0.75])).toBe(75 + 5);
        expect(s().delta(0, 0, [-0.5])).toBe(-10);
        expect(s().delta(0, 1, [-1])).toBe(5);
        expect(s().regionCount).toBe(3);
    });
    test('an item or a data set it does not hold gives 0', () => {
        expect([s().delta(0, 2, [1]), s().delta(3, 0, [1]), s().delta(0, -1, [1])]).toEqual([0, 0, 0]);
    });
    test('long words: 32-bit word deltas and 16-bit others', () => {
        const l = parseItemVariationStore(store([[[0, 1, 1]], [[0, 1, 1]]], [{ indexes: [0, 1], words: 1, long: true, rows: [[70000, -300]] }]), 0);
        expect(l.delta(0, 0, [1])).toBe(70000 - 300);
    });
    test('invalid region axes count as 1: peak 0, start past peak, a range across 0', () => {
        const inv = parseItemVariationStore(store([[[0, 0, 0]], [[0.5, 0.2, 1]], [[-0.5, 0.5, 1]]], [{ indexes: [0, 1, 2], words: 3, rows: [[1, 10, 100]] }]), 0);
        expect(inv.delta(0, 0, [0.9])).toBe(111);
    });
    test('outside a region its scalar is 0; a missing coordinate is 0; two axes multiply', () => {
        const two = parseItemVariationStore(store([[[0, 1, 1], [0, 1, 1]]], [{ indexes: [0], words: 1, rows: [[100]] }]), 0);
        expect([two.delta(0, 0, [1, 0.5]), two.delta(0, 0, [1]), two.delta(0, 0, [-0.5, 1])]).toEqual([50, 0, 0]);
    });
    test('errors: a short header or region list, another format', () => {
        expect(code(() => parseItemVariationStore(new Uint8Array(4), 0))).toBe('fonts/ivs-short');
        expect(code(() => parseItemVariationStore(new Uint8Array([0, 2, 0, 0, 0, 8, 0, 0]), 0))).toBe('fonts/ivs-format');
        const cut = store([[[0, 1, 1]]], [{ indexes: [0], words: 1, rows: [[1]] }]);
        expect(code(() => parseItemVariationStore(cut.subarray(0, cut.length - 1), 0))).toBe('fonts/ivs-short');
        expect(code(() => parseItemVariationStore('x', 0))).toBe('fonts/ivs-short');
    });
});

describe('varItemStore — parseDeltaSetIndexMap', () => {
    test('format 0, 1-byte entries: outer and inner from the entry format; the last entry past the map', () => {
        // entryFormat 0x03: 1-byte entries, 4 inner bits.
        const m = parseDeltaSetIndexMap(new Uint8Array([0, 0x03, ...be16(2), 0x12, 0x05]), 0);
        expect([m.mapCount, m.get(0), m.get(1), m.get(9)]).toEqual([2, { outer: 1, inner: 2 }, { outer: 0, inner: 5 }, { outer: 0, inner: 5 }]);
    });
    test('format 1, 2-byte entries with 16 inner bits', () => {
        const m = parseDeltaSetIndexMap(new Uint8Array([1, 0x1F, ...be32(1), 0x00, 0x07]), 0);
        expect(m.get(0)).toEqual({ outer: 0, inner: 7 });
    });
    test('errors: another format, entries past the bytes', () => {
        expect(code(() => parseDeltaSetIndexMap(new Uint8Array([2, 0, 0, 0]), 0))).toBe('fonts/ivs-format');
        expect(code(() => parseDeltaSetIndexMap(new Uint8Array([0, 0x10, ...be16(2), 0]), 0))).toBe('fonts/ivs-short');
    });
});

// T14 (b): the scalars of an item variation data's regions, what a CFF2 blend multiplies.
describe('varItemStore — scalars (T14 b)', () => {
    test("scalars(outer, coords): its regions' scalars, in its order; [] for data it does not hold", () => {
        const s = parseItemVariationStore(store([[[0, 1, 1]], [[0, 0.5, 1]]], [{ indexes: [1, 0], words: 0, rows: [[1, 1]] }]), 0);
        expect(s.scalars(0, [0.75])).toEqual([0.5, 0.75]);
        expect(s.scalars(4, [0.75])).toEqual([]);
    });
});
