// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontWriter } from './writer.js';
import { testRuntime } from './_test-runtime.js';
const { ContractError } = testRuntime.resolve('fontErrors');
const { BinaryWriter } = testRuntime.resolve('fontWriter');
const { BinaryReader } = testRuntime.resolve('fontReader');

describe('BinaryWriter', () => {
    test('module metadata', () => {
        expect(fontWriter.name).toBe('fontWriter');
        expect(typeof fontWriter.factory).toBe('function');
    });

    test('roundtrip via BinaryReader', () => {
        const w = new BinaryWriter();
        w.writeUint16(0x1234)
         .writeInt16(-1)
         .writeUint24(0xABCDEF)
         .writeUint32(0xDEADBEEF)
         .writeFixed(1)
         .writeF2Dot14(-1)
         .writeTag('head')
         .writeLongDateTime(0x1000)
         .writeBytes(new Uint8Array([9, 8]));
        const out = w.finalize();
        const r = new BinaryReader(out);
        expect(r.readUint16()).toBe(0x1234);
        expect(r.readInt16()).toBe(-1);
        expect(r.readUint24()).toBe(0xABCDEF);
        expect(r.readUint32()).toBe(0xDEADBEEF);
        expect(r.readFixed()).toBe(1);
        expect(r.readF2Dot14()).toBe(-1);
        expect(r.readTag()).toBe(0x68656164);
        expect(r.readLongDateTime()).toBe(0x1000);
        expect(r.readUint8()).toBe(9);
        expect(r.readUint8()).toBe(8);
    });

    test('grows beyond initial capacity', () => {
        const w = new BinaryWriter(2);
        for (let i = 0; i < 100; i++) w.writeUint8(i);
        const out = w.finalize();
        expect(out.length).toBe(100);
        expect(out[99]).toBe(99);
    });

    test('padTo4 aligns to 4-byte boundary', () => {
        const w = new BinaryWriter();
        w.writeUint8(1);
        w.padTo4();
        expect(w.length).toBe(4);
        expect(w.finalize()[3]).toBe(0);
    });

    test('patchUint32 / patchUint16', () => {
        const w = new BinaryWriter();
        w.writeUint32(0);   // placeholder
        w.writeUint16(0);
        w.writeUint8(99);
        w.patchUint32(0, 0xCAFEBABE);
        w.patchUint16(4, 0x1234);
        const out = w.finalize();
        const r = new BinaryReader(out);
        expect(r.readUint32()).toBe(0xCAFEBABE);
        expect(r.readUint16()).toBe(0x1234);
    });

    test('writeTag accepts string or uint32', () => {
        const a = new BinaryWriter(); a.writeTag('OS/2');
        const b = new BinaryWriter(); b.writeTag(0x4F532F32);
        expect(a.finalize()).toEqual(b.finalize());
    });

    test('rejects bad tag', () => {
        const w = new BinaryWriter();
        expect(() => w.writeTag('abcde')).toThrow(ContractError);
    });

    test('patch out of bounds throws', () => {
        const w = new BinaryWriter();
        expect(() => w.patchUint32(0, 1)).toThrow(ContractError);
    });

    describe('faÃ§ade invariants (R5)', () => {
        test('writeTag rejects non-ASCII characters', () => {
            const w = new BinaryWriter();
            // 'cafÃ©' contains Ã© (U+00E9) â†’ must throw, not truncate silently
            expect(() => w.writeTag('cafÃ©')).toThrow(ContractError);
            expect(() => w.writeTag('abÄ€d')).toThrow(ContractError);
        });

        test('writeTag accepts pure-ASCII 4-byte tags', () => {
            const w = new BinaryWriter();
            w.writeTag('head');
            const out = w.finalize();
            expect(out).toEqual(new Uint8Array([0x68, 0x65, 0x61, 0x64]));
        });
    });
});
