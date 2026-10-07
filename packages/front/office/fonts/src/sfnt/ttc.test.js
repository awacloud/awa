// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontTtc } from './ttc.js';
import { fontSfnt } from './sfnt.js';
import { testRuntime } from './_test-runtime.js';
const { parseTtc, extractFont, TTC_MAGIC } = testRuntime.resolve('fontTtc');
const { packSfnt, parseSfnt, SFNT_FLAVOR } = testRuntime.resolve('fontSfnt');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

function buildTtc(fontBytes) {
    // ttcf header
    const headerLen = 12 + fontBytes.length * 4;
    const offsets = [];
    let cursor = headerLen;
    for (const fb of fontBytes) {
        offsets.push(cursor);
        cursor += fb.length;
        if (cursor & 3) cursor += 4 - (cursor & 3);
    }
    const w = new BinaryWriter();
    w.writeUint32(TTC_MAGIC);
    w.writeUint16(1).writeUint16(0);
    w.writeUint32(fontBytes.length);
    for (const o of offsets) w.writeUint32(o);
    for (let i = 0; i < fontBytes.length; i++) {
        // Pad to declared offset
        while (w.pos < offsets[i]) w.writeUint8(0);
        w.writeBytes(fontBytes[i]);
    }
    return w.finalize();
}

function tinyFont(tag) {
    // Minimal SFNT with just a head-table-sized blob (not a valid head,
    // but parseTtc / extractFont don't validate semantics).
    const data = new Uint8Array(8); data[0] = tag.charCodeAt(0);
    return packSfnt({ flavor: SFNT_FLAVOR.TRUETYPE, tables: { aaaa: data } });
}

describe('fontTtc', () => {
    test('module metadata', () => { expect(fontTtc.name).toBe('fontTtc'); });

    test('parses 2-font TTC', () => {
        const ttc = buildTtc([tinyFont('A'), tinyFont('B')]);
        const r = parseTtc(ttc);
        expect(r.numFonts).toBe(2);
        expect(r.offsets.length).toBe(2);
    });

    test('extractFont returns standalone SFNT bytes', () => {
        const fA = tinyFont('A');
        const ttc = buildTtc([fA, tinyFont('B')]);
        const extracted = extractFont(ttc, 0);
        // Should parse as a normal SFNT
        const p = parseSfnt(extracted);
        expect(p.flavor).toBe(SFNT_FLAVOR.TRUETYPE);
        expect(Object.keys(p.tables)).toEqual(['aaaa']);
    });

    test('rejects bad index', () => {
        const ttc = buildTtc([tinyFont('A')]);
        expect(() => extractFont(ttc, 5)).toThrow(ParseError);
    });

    test('rejects bad magic', () => {
        expect(() => parseTtc(new Uint8Array(20))).toThrow(ParseError);
    });
});
