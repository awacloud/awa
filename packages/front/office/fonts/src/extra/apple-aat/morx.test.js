// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { aatMorx } from './morx.js';
import { testRuntime } from '../_test-runtime.js';
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
        expect(aatMorx.dependencies).toEqual(['fontErrors', 'fontReader']);
        expect(typeof aatMorx.factory(testRuntime.resolve('fontErrors'), { BinaryReader }).parseMorx).toBe('function');
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
