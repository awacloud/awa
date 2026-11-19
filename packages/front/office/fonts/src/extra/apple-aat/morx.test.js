// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { aatMorx } from './morx.js';
import { testRuntime } from '../_test-runtime.js';
import { lookup0, lookup6, morx, stx, substitutionList } from './_test-aat.js';
const { parseMorx } = testRuntime.resolve('aatMorx');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { BinaryReader } = testRuntime.resolve('fontReader');

function buildMorx({ version = 0x00020000, chains }) {
    const w = new BinaryWriter();
    w.writeUint32(version);
    w.writeUint32(chains.length);
    for (const chain of chains) {
        // Encode chain to a temp buffer to compute chainLength precisely.
        const cw = new BinaryWriter();
        cw.writeUint32(chain.defaultFlags >>> 0);
        const lenPos = cw.pos;
        cw.writeUint32(0);                          // chainLength placeholder
        cw.writeUint32(chain.features.length);
        cw.writeUint32(chain.subtables.length);
        for (const f of chain.features) {
            cw.writeUint16(f.featureType);
            cw.writeUint16(f.featureSetting);
            cw.writeUint32(f.enableFlags >>> 0);
            cw.writeUint32(f.disableFlags >>> 0);
        }
        for (const s of chain.subtables) {
            const subLen = 12 + s.body.length;
            cw.writeUint32(subLen);
            cw.writeUint32(s.coverage >>> 0);
            cw.writeUint32(s.subFeatureFlags >>> 0);
            cw.writeBytes(s.body);
        }
        const total = cw.length;
        const buf = cw.finalize();
        // Patch chainLength
        buf[lenPos]     = (total >>> 24) & 0xFF;
        buf[lenPos + 1] = (total >>> 16) & 0xFF;
        buf[lenPos + 2] = (total >>>  8) & 0xFF;
        buf[lenPos + 3] =  total         & 0xFF;
        w.writeBytes(buf);
    }
    return w.finalize();
}

describe('aatMorx', () => {
    test('module metadata', () => {
        expect(aatMorx.name).toBe('aatMorx');
        expect(aatMorx.dependencies).toEqual(['fontErrors', 'fontReader', 'aatLookup']);
        expect(typeof aatMorx.factory(testRuntime.resolve('fontErrors'), { BinaryReader }, testRuntime.resolve('aatLookup')).parseMorx).toBe('function');
    });

    test('parses a single chain with one feature and one subtable', () => {
        const bytes = buildMorx({
            chains: [{
                defaultFlags: 0x00000001,
                features: [
                    { featureType: 1, featureSetting: 0, enableFlags: 0x00000001, disableFlags: 0xFFFFFFFE }
                ],
                subtables: [
                    {
                        // type 2 (ligature), vertical bit set
                        coverage: 0x80000002,
                        subFeatureFlags: 0x00000001,
                        body: new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF])
                    }
                ]
            }]
        });
        const m = parseMorx(bytes);
        expect(m.version).toBe(0x00020000);
        expect(m.nChains).toBe(1);
        expect(m.chains[0].features).toHaveLength(1);
        expect(m.chains[0].features[0].featureType).toBe(1);
        expect(m.chains[0].subtables).toHaveLength(1);
        const sub = m.chains[0].subtables[0];
        expect(sub.type).toBe(2);
        expect(sub.vertical).toBe(true);
        expect(sub.descending).toBe(false);
        expect(sub.subFeatureFlags).toBe(1);
        expect(sub.parsed).toBe(false);
        expect(Array.from(sub.body)).toEqual([0xDE, 0xAD, 0xBE, 0xEF]);
    });

    test('supports morx version 3', () => {
        const bytes = buildMorx({
            version: 0x00030000,
            chains: [{ defaultFlags: 0, features: [], subtables: [] }]
        });
        const m = parseMorx(bytes);
        expect(m.version).toBe(0x00030000);
        expect(m.chains[0].features).toEqual([]);
    });

    test('rejects short buffer', () => {
        expect(() => parseMorx(new Uint8Array(4))).toThrow(ParseError);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeUint32(0x00010000).writeUint32(0);
        expect(() => parseMorx(w.finalize())).toThrow(ParseError);
    });

    test('rejects non-Uint8Array input', () => {
        expect(() => parseMorx(/** @type {any} */ ([1, 2, 3]))).toThrow(ParseError);
    });
});

// T15 (a), D38: the bodies of the types 0, 1 and 4 are decoded.
describe('aatMorx — decoded bodies (T15 a)', () => {
    const machine = (entryWords, extras = []) => stx({
        nClasses: 5, classes: lookup6({ 10: 4 }), states: [[0, 0, 0, 0, 1]],
        entries: [{ newState: 0, flags: 0, data: Array(entryWords).fill(0xFFFF) }, { newState: 0, flags: 0x8000, data: Array(entryWords).fill(0) }],
        extras
    });
    const sub = (type, body, coverage = 0) => parseMorx(morx([{ subtables: [{ type, coverage, body }] }])).chains[0].subtables[0];

    test('type 0: its state table', () => {
        const s = sub(0, machine(0));
        expect([s.parsed, s.stateTable.nClasses, s.stateTable.classOf(10), s.stateTable.entry(0, 4).flags]).toEqual([true, 5, 4, 0x8000]);
        expect(s.body).toBeInstanceOf(Uint8Array);
    });
    test('type 1: its state table, the mark and current indices, and its substitution lookups', () => {
        const s = sub(1, machine(2, [substitutionList([lookup6({ 10: 30 })])]));
        expect([s.parsed, s.stateTable.entry(0, 4).data, s.substitutions.length, s.substitutions[0].get(10)]).toEqual([true, [0, 0], 1, 30]);
    });
    test('type 4: its lookup; numGlyphs bounds a format 0 lookup', () => {
        const s = sub(4, lookup6({ 3: 4 }));
        expect([s.parsed, s.lookup.get(3), s.lookup.get(5)]).toEqual([true, 4, null]);
        const t = parseMorx(morx([{ subtables: [{ type: 4, body: lookup0([5, 6, 7]) }] }]), { numGlyphs: 2 }).chains[0].subtables[0];
        expect([t.lookup.get(1), t.lookup.get(2)]).toEqual([6, null]);
    });
    test('a body that does not decode keeps parsed: false and its error code; parseMorx does not throw', () => {
        const s = sub(0, [0, 0, 0, 3]);
        expect([s.parsed, s.error, s.body.length]).toEqual([false, 'fonts/aat-state-short', 4]);
        const c = sub(1, machine(2, []).slice(0, 18));
        expect(c.parsed).toBe(false);
        const short = sub(1, [...machine(2, [substitutionList([lookup6({})])]).slice(0, 16), 0xFF, 0xFF]);
        expect(short.parsed).toBe(false);
        const list = sub(1, machine(2, [[0, 0, 0xFF, 0xFF]]));
        expect([list.parsed, list.error]).toEqual([false, 'fonts/aat-lookup-short']);
        const gone = sub(1, machine(2, [[0, 0]]));
        expect([gone.parsed, gone.error]).toEqual([false, 'fonts/morx-contextual-short']);
    });
    test('a type it does not know stays raw (parsed: false, no error)', () => {
        expect([sub(3, machine(1)).parsed, sub(3, machine(1)).error]).toEqual([false, undefined]);
    });
});

// T15 (b), D38: the ligature and insertion bodies.
describe('aatMorx — ligature and insertion bodies (T15 b)', () => {
    const be32s = (vals) => vals.flatMap((v) => [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]);
    const be16s = (vals) => vals.flatMap((v) => [(v >> 8) & 0xFF, v & 0xFF]);
    const st = (words, extras) => stx({ nClasses: 4, classes: lookup6({}), states: [[0, 0, 0, 0]], entries: [{ newState: 0, flags: 0, data: Array(words).fill(0) }], extras });
    const sub = (type, body) => parseMorx(morx([{ subtables: [{ type, body }] }])).chains[0].subtables[0];

    test('type 2: its state table and the action, component and ligature readers, null past the body', () => {
        const s = sub(2, st(1, [be32s([0x80000001, 7]), be16s([4, 5]), be16s([60])]));
        expect([s.parsed, s.stateTable.entry(0, 0).data.length]).toEqual([true, 1]);
        expect([s.action(0), s.action(1), s.component(1), s.ligature(0)]).toEqual([0x80000001, 7, 5, 60]);
        expect([s.ligature(1), s.ligature(-1), s.ligature(0.5)]).toEqual([null, null, null]);
    });
    test('type 5: its state table and the insertion reader', () => {
        const s = sub(5, st(2, [be16s([20, 21])]));
        expect([s.parsed, s.stateTable.entry(0, 0).data.length, s.insertion(0), s.insertion(1), s.insertion(2)]).toEqual([true, 2, 20, 21, null]);
    });
    test('a header or an offset past the body keeps parsed: false with its error', () => {
        const lig = st(1, [be32s([0]), be16s([0]), be16s([0])]);
        expect(sub(2, lig.slice(0, 24)).error).toBe('fonts/morx-ligature-short');
        const far = [...lig.slice(0, 24), 0x7F, 0, 0, 0, ...lig.slice(28)];
        expect(sub(2, far).error).toBe('fonts/morx-ligature-short');
        expect(sub(5, st(2, []).slice(0, 18)).error).toBe('fonts/morx-insertion-short');
        expect(sub(5, [...st(2, [[0, 0]]).slice(0, 16), 0x7F, 0, 0, 0]).error).toBe('fonts/morx-insertion-short');
    });
});
