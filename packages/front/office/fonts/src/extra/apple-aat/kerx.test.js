// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { aatKerx } from './kerx.js';
import { testRuntime } from '../_test-runtime.js';
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
        expect(aatKerx.dependencies).toEqual(['fontErrors', 'fontReader']);
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

    test('recognises format 2 as unparsed with decoded flags', () => {
        const body = new Uint8Array(16);
        const bytes = buildKerx({
            subtables: [{ coverage: 0x80000002, body }]   // vertical, format 2
        });
        const k = parseKerx(bytes);
        const sub = k.tables[0];
        expect(sub.format).toBe(2);
        expect(sub.vertical).toBe(true);
        expect(sub.crossStream).toBe(false);
        expect(sub.parsed).toBe(false);
        expect(sub.body).toBeInstanceOf(Uint8Array);
        expect(sub.body.length).toBe(16);
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
