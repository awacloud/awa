// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { aatFeat } from './feat.js';
import { testRuntime } from '../_test-runtime.js';
const { parseFeat, FEAT_FLAGS } = testRuntime.resolve('aatFeat');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { fixedToInt32 } = testRuntime.resolve('fontFixed');

describe('aatFeat', () => {
    test('module metadata', () => {
        expect(aatFeat.name).toBe('aatFeat');
        expect(aatFeat.dependencies).toEqual(['fontErrors', 'fontReader']);
        expect(FEAT_FLAGS.EXCLUSIVE).toBe(0x8000);
    });

    test('parses two features with settings', () => {
        const w = new BinaryWriter();
        // Header
        w.writeInt32(fixedToInt32(1));
        w.writeUint16(2);                      // featureNameCount
        w.writeUint16(0).writeUint32(0);       // reserved

        // Plan layout: settings for feat A at offset 12 + 2*12 = 36
        //              settings for feat B at offset 36 + 2*4   = 44
        const offA = 36;
        const offB = 44;

        // FeatureName 0 : exclusive Letter Case, 2 settings, default = 1
        w.writeUint16(3)                        // feature = 3 ("Letter Case")
         .writeUint16(2)                        // nSettings
         .writeUint32(offA)                     // settingTableOffset
         .writeUint16(FEAT_FLAGS.EXCLUSIVE | FEAT_FLAGS.DYNAMIC_DEFAULT | 0x01)
         .writeInt16(256);                      // nameIndex

        // FeatureName 1 : non-exclusive, 2 settings, no default
        w.writeUint16(6)                        // feature = 6 ("Number Spacing")
         .writeUint16(2)
         .writeUint32(offB)
         .writeUint16(0)
         .writeInt16(257);

        // Settings A
        w.writeUint16(0).writeInt16(300);
        w.writeUint16(1).writeInt16(301);
        // Settings B
        w.writeUint16(0).writeInt16(310);
        w.writeUint16(2).writeInt16(311);

        const f = parseFeat(w.finalize());
        expect(f.version).toBe(1);
        expect(f.features).toHaveLength(2);

        const a = f.features[0];
        expect(a.feature).toBe(3);
        expect(a.exclusive).toBe(true);
        expect(a.defaultSetting).toBe(1);
        expect(a.settings).toEqual([
            { setting: 0, nameIndex: 300 },
            { setting: 1, nameIndex: 301 }
        ]);

        const b = f.features[1];
        expect(b.feature).toBe(6);
        expect(b.exclusive).toBe(false);
        expect(b.defaultSetting).toBe(0);
        expect(b.settings).toHaveLength(2);
        expect(b.settings[1]).toEqual({ setting: 2, nameIndex: 311 });
    });

    test('handles a feature with zero settings', () => {
        const w = new BinaryWriter();
        w.writeInt32(fixedToInt32(1)).writeUint16(1).writeUint16(0).writeUint32(0);
        w.writeUint16(0).writeUint16(0).writeUint32(0).writeUint16(0).writeInt16(0);
        const f = parseFeat(w.finalize());
        expect(f.features[0].settings).toEqual([]);
    });

    test('rejects short buffer', () => {
        expect(() => parseFeat(new Uint8Array(4))).toThrow(ParseError);
    });

    test('rejects bad version', () => {
        const w = new BinaryWriter();
        w.writeInt32(fixedToInt32(2)).writeUint16(0).writeUint16(0).writeUint32(0);
        expect(() => parseFeat(w.finalize())).toThrow(ParseError);
    });

    test('rejects setting offset overflow', () => {
        const w = new BinaryWriter();
        w.writeInt32(fixedToInt32(1)).writeUint16(1).writeUint16(0).writeUint32(0);
        w.writeUint16(0).writeUint16(1).writeUint32(9999).writeUint16(0).writeInt16(0);
        expect(() => parseFeat(w.finalize())).toThrow(ParseError);
    });
});
