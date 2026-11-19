// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// T15 (a), D38: the AAT lookup tables and extended state tables, on
// tables built here byte by byte.

import { describe, test, expect } from 'bun:test';
import { aatLookup } from './lookup.js';
import { testRuntime } from '../_test-runtime.js';
import { be16, be32, lookup0, lookup2, lookup4, lookup6, lookup8, lookup10, stx } from './_test-aat.js';


const { parseLookup, parseStateTable, DELETED_GLYPH } = testRuntime.resolve('aatLookup');
const { ParseError } = testRuntime.resolve('fontErrors');

const bytes = (a) => new Uint8Array(a);
const values = (l, glyphs) => glyphs.map((g) => l.get(g));
const code = (fn) => { try { fn(); } catch (e) { return e instanceof ParseError ? e.code : `not a ParseError: ${e}`; } return null; };

describe('aatLookup — descriptor', () => {
    test('a strict factory descriptor on fontErrors, registered in the extras', async () => {
        const { extras } = await import('../../main.js');
        expect(aatLookup.name).toBe('aatLookup');
        expect(aatLookup.dependencies).toEqual(['fontErrors']);
        expect(extras).toContain(aatLookup);
        expect(DELETED_GLYPH).toBe(0xFFFF);
    });
});

describe('aatLookup — parseLookup', () => {
    test('format 0: one value per glyph, bounded by numGlyphs or the bytes', () => {
        const l = parseLookup(bytes(lookup0([7, 8, 9])), 0);
        expect([l.format, ...values(l, [0, 1, 2, 3])]).toEqual([0, 7, 8, 9, null]);
        expect(values(parseLookup(bytes(lookup0([7, 8, 9])), 0, { numGlyphs: 2 }), [1, 2])).toEqual([8, null]);
    });
    test('format 2: segments by binary search; the terminator is not a segment', () => {
        const l = parseLookup(bytes(lookup2([[5, 9, 1], [20, 20, 2], [30, 40, 3]])), 0);
        expect([l.format, ...values(l, [4, 5, 9, 10, 20, 35, 41, 0xFFFF])]).toEqual([2, null, 1, 1, null, 2, 3, null, null]);
        expect(values(parseLookup(bytes(lookup2([[1, 2, 6]], false)), 0), [1, 2, 3])).toEqual([6, 6, null]);
    });
    test('format 4: a value array per segment', () => {
        const l = parseLookup(bytes(lookup4([[10, 12, [100, 101, 102]], [3, 3, [33]]])), 0);
        expect([l.format, ...values(l, [2, 3, 10, 11, 12, 13])]).toEqual([4, null, 33, 100, 101, 102, null]);
    });
    test('format 6: single glyphs by binary search', () => {
        const l = parseLookup(bytes(lookup6({ 4: 40, 9: 90, 200: 2000 })), 0);
        expect([l.format, ...values(l, [4, 5, 9, 200, 0xFFFF])]).toEqual([6, 40, null, 90, 2000, null]);
    });
    test('format 8: a trimmed array', () => {
        const l = parseLookup(bytes(lookup8(10, [1, 2, 3])), 0);
        expect([l.format, ...values(l, [9, 10, 12, 13])]).toEqual([8, null, 1, 3, null]);
    });
    test('format 10: values of 1, 2 or 4 bytes', () => {
        expect(values(parseLookup(bytes(lookup10(1, 5, [250, 251])), 0), [4, 5, 6, 7])).toEqual([null, 250, 251, null]);
        expect(values(parseLookup(bytes(lookup10(2, 0, [0x1234])), 0), [0])).toEqual([0x1234]);
        expect(values(parseLookup(bytes(lookup10(4, 1, [0x89ABCDEF])), 0), [1])).toEqual([0x89ABCDEF]);
    });
    test('at an offset; a glyph that is not a 16-bit integer has no value', () => {
        const l = parseLookup(bytes([0xAA, 0xBB, ...lookup6({ 1: 11 })]), 2);
        expect(values(l, [1, -1, 1.5, 0x10000])).toEqual([11, null, null, null]);
    });
    test('malformed tables throw a ParseError with their code', () => {
        expect(code(() => parseLookup([0, 0], 0))).toBe('fonts/aat-input');
        expect(code(() => parseLookup(bytes([0, 0]), -1))).toBe('fonts/aat-input');
        expect(code(() => parseLookup(bytes([0]), 0))).toBe('fonts/aat-lookup-short');
        expect(code(() => parseLookup(bytes([...be16(3), 0, 0]), 0))).toBe('fonts/aat-lookup-format');
        expect(code(() => parseLookup(bytes([...be16(2), ...be16(4), ...be16(1), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 0))).toBe('fonts/aat-lookup-unit');
        expect(code(() => parseLookup(bytes(lookup2([[1, 2, 3]])).subarray(0, 20), 0))).toBe('fonts/aat-lookup-short');
        expect(code(() => parseLookup(bytes(lookup8(0, [1, 2])).subarray(0, 8), 0))).toBe('fonts/aat-lookup-short');
        expect(code(() => parseLookup(bytes([...be16(10), ...be16(3), 0, 0, 0, 0]), 0))).toBe('fonts/aat-lookup-unit');
        expect(code(() => parseLookup(bytes([...be16(8), 0, 0]), 0))).toBe('fonts/aat-lookup-short');
    });
});

describe('aatLookup — parseStateTable', () => {
    const entries = [{ newState: 0, flags: 0, data: [5] }, { newState: 1, flags: 0x8000, data: [6] }];
    const table = stx({ nClasses: 5, classes: lookup6({ 10: 4, 11: 3 }), states: [[0, 0, 0, 0, 1], [0, 0, 1, 0, 1]], entries });

    test('the classes: the deleted glyph, the lookup\'s value, else out of bounds', () => {
        const t = parseStateTable(bytes(table), 0, 1);
        expect([0xFFFF, 10, 11, 12].map((g) => t.classOf(g))).toEqual([2, 4, 3, 1]);
        expect(t.nClasses).toBe(5);
    });
    test('the entries: new state, flags and data words; a class past nClasses reads as out of bounds', () => {
        const t = parseStateTable(bytes(table), 0, 1);
        expect(t.entry(0, 4)).toEqual({ newState: 1, flags: 0x8000, data: [6] });
        expect(t.entry(1, 2)).toEqual({ newState: 1, flags: 0x8000, data: [6] });
        expect(t.entry(0, 1)).toEqual({ newState: 0, flags: 0, data: [5] });
        expect(t.entry(1, 9)).toEqual(t.entry(1, 1));
        expect([t.nStates, t.entries.length]).toEqual([2, 2]);
    });
    test('only the reachable states are read: a state array cut after them is enough', () => {
        // One state whose entries all stay in state 0; the state array is the last part.
        const head = 16;
        const cls = lookup6({ 10: 4 });
        const ent = [...be16(0), ...be16(0)];
        const row = [0, 0, 0, 0, 0].flatMap(be16);
        const t = [...be32(5), ...be32(head), ...be32(head + cls.length + ent.length), ...be32(head + cls.length), ...cls, ...ent, ...row];
        const st = parseStateTable(bytes(t), 0, 0);
        expect([st.nStates, st.entries.length, st.entry(0, 4).newState]).toEqual([1, 1, 0]);
    });
    test('malformed tables throw a ParseError with their code', () => {
        expect(code(() => parseStateTable(bytes(table).subarray(0, 12), 0, 1))).toBe('fonts/aat-state-short');
        expect(code(() => parseStateTable(bytes([...be32(3), ...table.slice(4)]), 0, 1))).toBe('fonts/aat-state-classes');
        // An entry that moves to state 1 when the state array has one row.
        const cls = lookup6({});
        const ent = [...be16(1), ...be16(0)];
        const row = [0, 0, 0, 0].flatMap(be16);
        const cut = [...be32(4), ...be32(16), ...be32(16 + cls.length + ent.length), ...be32(16 + cls.length), ...cls, ...ent, ...row];
        expect(code(() => parseStateTable(bytes(cut), 0, 0))).toBe('fonts/aat-state-short');
        expect(code(() => parseStateTable(bytes(table), 0, 40))).toBe('fonts/aat-state-short');
        expect(code(() => parseStateTable('x', 0, 0))).toBe('fonts/aat-input');
    });
});

// T15 (c), D38: 32-bit values, for kerx format 6's long tables.
describe('aatLookup — 32-bit values (T15 c)', () => {
    const w = (v) => be32(v);
    const bs = (unitSize, n) => [...be16(unitSize), ...be16(n), 0, 0, 0, 0, 0, 0];
    test('formats 0, 2, 4, 6 and 8 read 32-bit values with valueSize: 4', () => {
        const v4 = { valueSize: 4 };
        expect(parseLookup(bytes([...be16(0), ...w(70000), ...w(5)]), 0, v4).get(0)).toBe(70000);
        const f2 = [...be16(2), ...bs(8, 1), ...be16(9), ...be16(3), ...w(80000)];
        expect(values(parseLookup(bytes(f2), 0, v4), [3, 9, 10])).toEqual([80000, 80000, null]);
        const f4 = [...be16(4), ...bs(6, 1), ...be16(4), ...be16(3), ...be16(18), ...w(1), ...w(90000)];
        expect(values(parseLookup(bytes(f4), 0, v4), [3, 4])).toEqual([1, 90000]);
        const f6 = [...be16(6), ...bs(6, 1), ...be16(7), ...w(100000)];
        expect(parseLookup(bytes(f6), 0, v4).get(7)).toBe(100000);
        const f8 = [...be16(8), ...be16(2), ...be16(1), ...w(65536)];
        expect(values(parseLookup(bytes(f8), 0, v4), [2, 3])).toEqual([65536, null]);
    });
    test('a unit too small for a 32-bit value throws', () => {
        expect(code(() => parseLookup(bytes([...be16(6), ...bs(4, 1), ...be16(7), ...be16(1)]), 0, { valueSize: 4 }))).toBe('fonts/aat-lookup-unit');
    });
});
