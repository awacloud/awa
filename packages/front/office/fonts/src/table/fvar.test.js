// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { tableFvar } from './fvar.js';
import { testRuntime } from './_test-runtime.js';
const { parseFvar } = testRuntime.resolve('tableFvar');
const { ParseError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');

describe('tableFvar', () => {
    test('module metadata', () => { expect(tableFvar.name).toBe('tableFvar'); });

    test('parses single axis + 2 instances', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);
        w.writeUint16(16).writeUint16(0);                 // axesArrayOffset
        w.writeUint16(1).writeUint16(20);                 // axisCount, axisSize
        w.writeUint16(2).writeUint16(8);                  // instanceCount, instanceSize (4 + 4*1 = 8 â†’ no PS nameID)
        // Axis 'wght'
        w.writeTag('wght');
        w.writeFixed(100); w.writeFixed(400); w.writeFixed(900);
        w.writeUint16(0).writeUint16(256);
        // Instance Light
        w.writeUint16(257).writeUint16(0).writeFixed(300);
        // Instance Bold
        w.writeUint16(258).writeUint16(0).writeFixed(700);
        const f = parseFvar(w.finalize());
        expect(f.axes.length).toBe(1);
        expect(f.axes[0].tag).toBe('wght');
        expect(f.axes[0].defaultValue).toBe(400);
        expect(f.instances.length).toBe(2);
        expect(f.instances[0].coordinates[0]).toBe(300);
        expect(f.instances[1].coordinates[0]).toBe(700);
    });

    test('rejects bad major', () => {
        const w = new BinaryWriter();
        w.writeUint16(9).writeUint16(0).writeUint16(0).writeUint16(0).writeUint16(0).writeUint16(0).writeUint16(0).writeUint16(0);
        expect(() => parseFvar(w.finalize())).toThrow(ParseError);
    });

    /* --- Étape 7 P2 — bounded axisCount / instanceCount caps -------- */

    test('rejects axisCount exceeding the 64-axis cap', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);
        w.writeUint16(16).writeUint16(0);   // axesArrayOffset, reserved
        w.writeUint16(65).writeUint16(20);  // axisCount = 65 > cap, axisSize
        w.writeUint16(0).writeUint16(4);    // instanceCount, instanceSize
        let caught;
        try { parseFvar(w.finalize()); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/fvar-axis-count-cap');
    });

    test('rejects instanceCount exceeding the 256-instance cap', () => {
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);
        w.writeUint16(16).writeUint16(0);     // axesArrayOffset, reserved
        w.writeUint16(0).writeUint16(20);     // axisCount, axisSize
        w.writeUint16(257).writeUint16(4);    // instanceCount = 257 > cap, instanceSize
        let caught;
        try { parseFvar(w.finalize()); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('fonts/fvar-instance-count-cap');
    });

    test('accepts axisCount / instanceCount exactly at their caps', () => {
        const AXIS_COUNT = 64;
        const w = new BinaryWriter();
        w.writeUint16(1).writeUint16(0);
        w.writeUint16(16).writeUint16(0);
        w.writeUint16(AXIS_COUNT).writeUint16(20);
        w.writeUint16(0).writeUint16(4);   // 0 instances — keeps the fixture small
        for (let i = 0; i < AXIS_COUNT; i++) {
            w.writeTag('wght');
            w.writeFixed(0); w.writeFixed(0); w.writeFixed(0);
            w.writeUint16(0).writeUint16(0);
        }
        const f = parseFvar(w.finalize());
        expect(f.axes.length).toBe(AXIS_COUNT);
        expect(f.instances.length).toBe(0);
    });
});
