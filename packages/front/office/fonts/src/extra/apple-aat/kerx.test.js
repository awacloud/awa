// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { aatKerx } from './kerx.js';
import { testRuntime } from '../_test-runtime.js';
import { be16, be32, kerx, lookup6, offsetBody, stx } from './_test-aat.js';
const { parseKerx } = testRuntime.resolve('aatKerx');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

function encodeSubtable({ coverage, tupleCount = 0, body }) {
    const cw = new BinaryWriter();
    const length = 12 + body.length;
    cw.writeUint32(length).writeUint32(coverage >>> 0).writeUint32(tupleCount).writeBytes(body);
    return cw.finalize();
}

function buildKerx({ version = 2, subtables }) {
    const w = new BinaryWriter();
    w.writeUint16(version).writeUint16(0).writeUint32(subtables.length);
    for (const s of subtables) w.writeBytes(encodeSubtable(s));
    return w.finalize();
}

function buildFormat0Body(pairs) {
    const w = new BinaryWriter();
    w.writeUint32(pairs.length);
    w.writeUint32(0).writeUint32(0).writeUint32(0); // search / entry / range
    for (const p of pairs) {
        w.writeUint16(p.left).writeUint16(p.right).writeInt16(p.value);
    }
    return w.finalize();
}

describe('aatKerx', () => {
    test('module metadata', () => {
        expect(aatKerx.name).toBe('aatKerx');
        expect(aatKerx.dependencies).toEqual(['fontErrors', 'fontReader', 'aatLookup']);
    });

    test('parses format 0 (pair list)', () => {
        const body = buildFormat0Body([
            { left: 5, right: 8, value: -40 },
            { left: 5, right: 9, value: -20 }
        ]);
        const bytes = buildKerx({
            subtables: [{ coverage: 0x00000000, body }]
        });
        const k = parseKerx(bytes);
        expect(k.version).toBe(2);
        expect(k.tables[0].format).toBe(0);
        expect(k.tables[0].parsed).toBe(true);
        expect(k.tables[0].pairs).toHaveLength(2);
        expect(k.tables[0].kern(5, 8)).toBe(-40);
        expect(k.tables[0].kern(5, 9)).toBe(-20);
        expect(k.tables[0].kern(1, 1)).toBe(0);
    });

    test('recognises format 2 with decoded flags; a body that does not decode stays unparsed', () => {
        const body = new Uint8Array(12);
        const bytes = buildKerx({
            subtables: [{ coverage: 0x80000002, body }]   // vertical, format 2
        });
        const k = parseKerx(bytes);
        const sub = k.tables[0];
        expect(sub.format).toBe(2);
        expect(sub.vertical).toBe(true);
        expect(sub.crossStream).toBe(false);
        expect(sub.parsed).toBe(false);
        expect(sub.error).toBe('fonts/kerx-format-short');
        expect(sub.body).toBeInstanceOf(Uint8Array);
        expect(sub.body.length).toBe(12);
    });

    test('recognises format 4 and format 6 too', () => {
        const bytes = buildKerx({
            subtables: [
                { coverage: 0x40000004, body: new Uint8Array(4) },   // cross-stream, format 4
                { coverage: 0x00000006, body: new Uint8Array(4) }
            ]
        });
        const k = parseKerx(bytes);
        expect(k.tables[0].format).toBe(4);
        expect(k.tables[0].crossStream).toBe(true);
        expect(k.tables[1].format).toBe(6);
        expect(k.tables[0].parsed).toBe(false);
        expect(k.tables[1].parsed).toBe(false);
    });

    test('rejects short buffer', () => {
        expect(() => parseKerx(new Uint8Array(4))).toThrow(ParseError);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0).writeUint32(0);
        expect(() => parseKerx(w.finalize())).toThrow(ParseError);
    });
});

// T15 (c), D38: the formats 1, 2, 4 and 6 decoded.
describe('aatKerx — formats 1, 2, 4, 6 (T15 c)', () => {
    const i16s = (vals) => vals.flatMap((v) => be16(v & 0xFFFF));
    const machine = (extras) => stx({ nClasses: 4, classes: lookup6({}), states: [[0, 0, 0, 0]], entries: [{ newState: 0, flags: 0, data: [0xFFFF] }], extras });
    const one = (format, body, tupleCount = 0) => parseKerx(kerx([{ format, body, tupleCount }])).tables[0];

    test('format 1: the state table and the action values, from the state table start', () => {
        const t = one(1, machine([i16s([-30, 41])]), 2);
        expect([t.parsed, t.tupleCount, t.stateTable.entry(0, 0).data, t.action(0), t.action(1), t.action(2)]).toEqual([true, 2, [0xFFFF], -30, 41, null]);
    });
    test('format 2: class values summed into the array (offsets from the subtable start), 0 when missing', () => {
        const body = offsetBody([4, { part: 0 }, { part: 1 }, { part: 2 }], [lookup6({ 5: 2 }), lookup6({ 8: 1, 9: 0 }), i16s([0, 0, -40, 70])]);
        const t = one(2, body);
        expect([t.parsed, t.rowWidth, t.kern(5, 8), t.kern(5, 9), t.kern(6, 8), t.kern(5, 7)]).toEqual([true, 4, 70, -40, 0, -40]);
    });
    test('format 4: the state table, the action type and the data, from the state table start', () => {
        const body = machine([be16(7).concat(be16(9))]);
        const off = (body[16] << 24) | (body[17] << 16) | (body[18] << 8) | body[19];
        const typed = [...body.slice(0, 16), ...be32(((1 << 30) | off) >>> 0), ...body.slice(20)];
        const t = one(4, typed);
        expect([t.parsed, t.actionType, t.data(0), t.data(1), t.data(2)]).toEqual([true, 1, 7, 9, null]);
    });
    test('format 6: row plus column value into the array, short or long', () => {
        const short = offsetBody([0, (2 << 16) | 2, { part: 0 }, { part: 1 }, { part: 2 }], [lookup6({ 5: 2 }), lookup6({ 8: 1 }), i16s([0, 0, 0, -25])]);
        const s = one(6, short);
        expect([s.parsed, s.long, s.kern(5, 8), s.kern(5, 9), s.kern(4, 4)]).toEqual([true, false, -25, 0, 0]);
        const l6 = (map) => [...be16(6), ...be16(8), ...be16(Object.keys(map).length + 1), 0, 0, 0, 0, 0, 0,
            ...Object.entries(map).flatMap(([g, v]) => [...be16(Number(g)), ...be32(v)]), ...be16(0xFFFF), ...be32(0)];
        const long = offsetBody([1, (2 << 16) | 2, { part: 0 }, { part: 1 }, { part: 2 }], [l6({ 5: 2 }), l6({ 8: 1 }), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...be32(-70000 >>> 0)]]);
        const l = one(6, long);
        expect([l.long, l.kern(5, 8)]).toEqual([true, -70000]);
    });
    test('a body that does not decode keeps parsed: false and its error; parseKerx does not throw', () => {
        expect(one(1, [0, 0, 0, 4]).error).toBe('fonts/kerx-format-short');
        const badLookup = offsetBody([4, { part: 0 }, { part: 0 }, { part: 0 }], [[0, 3, 0, 0]]);
        expect([one(2, badLookup).parsed, one(2, badLookup).error]).toEqual([false, 'fonts/aat-lookup-format']);
        expect(one(4, machine([])).parsed).toBe(true);
        expect(one(6, [0, 0, 0, 0]).error).toBe('fonts/kerx-format-short');
    });
});
