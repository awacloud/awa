// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { binaryWriter } from './writer.js';
import { binaryReader } from './reader.js';

describe('binaryWriter module', () => {
    test('should have correct module metadata', () => {
        expect(binaryWriter.name).toBe('binaryWriter');
        expect(binaryWriter.dependencies).toEqual([]);
        expect(typeof binaryWriter.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = binaryWriter.factory();
            expect(typeof inst.create).toBe('function');
        });

        test('create returns writer object with expected methods', () => {
            const inst = binaryWriter.factory();
            const w = inst.create();
            expect(typeof w.u8).toBe('function');
            expect(typeof w.u16).toBe('function');
            expect(typeof w.u32).toBe('function');
            expect(typeof w.u64).toBe('function');
            expect(typeof w.i8).toBe('function');
            expect(typeof w.i16).toBe('function');
            expect(typeof w.i32).toBe('function');
            expect(typeof w.i64).toBe('function');
            expect(typeof w.f32).toBe('function');
            expect(typeof w.f64).toBe('function');
            expect(typeof w.bytes).toBe('function');
            expect(typeof w.utf8).toBe('function');
            expect(typeof w.ascii).toBe('function');
            expect(typeof w.cstring).toBe('function');
            expect(typeof w.seek).toBe('function');
            expect(typeof w.align).toBe('function');
            expect(typeof w.finalize).toBe('function');
        });
    });

    describe('finalize()', () => {
        test('returns Uint8Array of exact logical length, not capacity', () => {
            const w = binaryWriter.factory().create({ initialSize: 1024 });
            w.u8(0xAA);
            w.u8(0xBB);
            const out = w.finalize();
            expect(out instanceof Uint8Array).toBe(true);
            expect(out.length).toBe(2);
            expect(out[0]).toBe(0xAA);
            expect(out[1]).toBe(0xBB);
        });

        test('empty writer produces empty Uint8Array', () => {
            const w = binaryWriter.factory().create();
            expect(w.finalize().length).toBe(0);
        });
    });

    describe('auto-grow', () => {
        test('writing more bytes than initialSize works correctly', () => {
            const w = binaryWriter.factory().create({ initialSize: 4 });
            // Write 16 bytes into a 4-byte initial buffer
            for (let i = 0; i < 16; i++) {
                w.u8(i);
            }
            const out = w.finalize();
            expect(out.length).toBe(16);
            for (let i = 0; i < 16; i++) {
                expect(out[i]).toBe(i);
            }
        });
    });

    describe('align(n)', () => {
        test('pads with 0x00 to next multiple of 4', () => {
            const w = binaryWriter.factory().create();
            w.u8(0x01);
            w.u8(0x02);
            w.align(4);
            expect(w.pos).toBe(4);
            const out = w.finalize();
            expect(out[2]).toBe(0x00);
            expect(out[3]).toBe(0x00);
        });

        test('align when already aligned does nothing', () => {
            const w = binaryWriter.factory().create();
            w.u8(0x01);
            w.u8(0x02);
            w.u8(0x03);
            w.u8(0x04);
            w.align(4);
            expect(w.pos).toBe(4);
        });
    });

    describe('seek + overwrite', () => {
        test('seek to earlier position and overwrite', () => {
            const w = binaryWriter.factory().create();
            w.u32(0x00000000); // placeholder
            w.u8(0xFF);
            w.seek(0);
            w.u32(0xDEADBEEF); // patch the placeholder
            const out = w.finalize();
            expect(out.length).toBe(5);
            // Check big-endian u32
            expect(out[0]).toBe(0xDE);
            expect(out[1]).toBe(0xAD);
            expect(out[2]).toBe(0xBE);
            expect(out[3]).toBe(0xEF);
            expect(out[4]).toBe(0xFF);
        });
    });

    describe('utf8 multi-byte', () => {
        test('é is encoded as 2 UTF-8 bytes', () => {
            const w = binaryWriter.factory().create();
            w.utf8('é');
            const out = w.finalize();
            expect(out.length).toBe(2);
            // é = U+00E9 → 0xC3 0xA9 in UTF-8
            expect(out[0]).toBe(0xC3);
            expect(out[1]).toBe(0xA9);
        });
    });

    describe('cstring()', () => {
        test('throws ContractError on non-string argument', () => {
            const w = binaryWriter.factory().create();
            expect(() => w.cstring(null)).toThrow();
        });

        test('appends NUL byte after string', () => {
            const w = binaryWriter.factory().create();
            w.cstring('hi');
            const out = w.finalize();
            expect(out.length).toBe(3); // 'h' 'i' '\0'
            expect(out[2]).toBe(0x00);
        });
    });

    describe('robustness / regression', () => {
        let reader;
        let writer;
        beforeEach(() => {
            reader = binaryReader.factory();
            writer = binaryWriter.factory();
        });

        // BE/LE round-trip for each primitive
        test('u8 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.u8(200);
                const r = reader.create(w.finalize(), { endian });
                expect(r.u8()).toBe(200);
            }
        });

        test('u16 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.u16(0xABCD);
                const r = reader.create(w.finalize(), { endian });
                expect(r.u16()).toBe(0xABCD);
            }
        });

        test('u24 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.u24(0x123456);
                const r = reader.create(w.finalize(), { endian });
                expect(r.u24()).toBe(0x123456);
            }
        });

        test('u32 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.u32(0xCAFEBABE);
                const r = reader.create(w.finalize(), { endian });
                expect(r.u32()).toBe(0xCAFEBABE);
            }
        });

        test('i8 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.i8(-100);
                const r = reader.create(w.finalize(), { endian });
                expect(r.i8()).toBe(-100);
            }
        });

        test('i16 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.i16(-30000);
                const r = reader.create(w.finalize(), { endian });
                expect(r.i16()).toBe(-30000);
            }
        });

        test('i32 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.i32(-2000000000);
                const r = reader.create(w.finalize(), { endian });
                expect(r.i32()).toBe(-2000000000);
            }
        });

        test('f32 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.f32(1.5);
                const r = reader.create(w.finalize(), { endian });
                expect(r.f32()).toBeCloseTo(1.5, 6);
            }
        });

        test('f64 BE/LE round-trip', () => {
            for (const endian of ['be', 'le']) {
                const w = writer.create({ endian });
                w.f64(Math.PI);
                const r = reader.create(w.finalize(), { endian });
                expect(r.f64()).toBe(Math.PI);
            }
        });

        // Auto-grow: write 1000 bytes into writer initialised at 8
        test('auto-grow: 1000 bytes into initialSize=8 → finalize().length === 1000', () => {
            const w = writer.create({ initialSize: 8 });
            for (let i = 0; i < 1000; i++) {
                w.u8(i & 0xFF);
            }
            expect(w.finalize().length).toBe(1000);
        });

        // u64/i64 round-trip with BigInt extremes
        test('u64 round-trip: 0n', () => {
            const w = writer.create({ endian: 'be' });
            w.u64(0n);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.u64()).toBe(0n);
        });

        test('u64 round-trip: 0xFFFFFFFFFFFFFFFFn', () => {
            const w = writer.create({ endian: 'be' });
            w.u64(0xFFFFFFFFFFFFFFFFn);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.u64()).toBe(0xFFFFFFFFFFFFFFFFn);
        });

        test('u64 round-trip: 0x7FFFFFFFFFFFFFFFn', () => {
            const w = writer.create({ endian: 'be' });
            w.u64(0x7FFFFFFFFFFFFFFFn);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.u64()).toBe(0x7FFFFFFFFFFFFFFFn);
        });

        test('i64 round-trip: 0n', () => {
            const w = writer.create({ endian: 'be' });
            w.i64(0n);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.i64()).toBe(0n);
        });

        test('i64 round-trip: 0x7FFFFFFFFFFFFFFFn (max i64)', () => {
            const w = writer.create({ endian: 'be' });
            w.i64(0x7FFFFFFFFFFFFFFFn);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.i64()).toBe(0x7FFFFFFFFFFFFFFFn);
        });

        test('i64 round-trip: -0x8000000000000000n (min i64)', () => {
            const w = writer.create({ endian: 'be' });
            w.i64(-0x8000000000000000n);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.i64()).toBe(-0x8000000000000000n);
        });

        // f64 round-trip for special values
        test('f64 round-trip: Number.MIN_VALUE', () => {
            const w = writer.create({ endian: 'be' });
            w.f64(Number.MIN_VALUE);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.f64()).toBe(Number.MIN_VALUE);
        });

        test('f64 round-trip: Number.MAX_VALUE', () => {
            const w = writer.create({ endian: 'be' });
            w.f64(Number.MAX_VALUE);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.f64()).toBe(Number.MAX_VALUE);
        });

        test('f64 round-trip: +Infinity', () => {
            const w = writer.create({ endian: 'be' });
            w.f64(Infinity);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.f64()).toBe(Infinity);
        });

        test('f64 round-trip: -Infinity', () => {
            const w = writer.create({ endian: 'be' });
            w.f64(-Infinity);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.f64()).toBe(-Infinity);
        });

        test('f64 round-trip: NaN', () => {
            const w = writer.create({ endian: 'be' });
            w.f64(NaN);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.f64()).toBeNaN();
        });

        test('f64 round-trip: -0', () => {
            const w = writer.create({ endian: 'be' });
            w.f64(-0);
            const r = reader.create(w.finalize(), { endian: 'be' });
            const v = r.f64();
            expect(Object.is(v, -0)).toBe(true); // distinguishes -0 from +0
        });

        // align(N) pads to next multiple of N with zeros
        test('align(8): pos=3 → advances to 8, pad bytes are 0', () => {
            const w = writer.create();
            w.u8(0x01); w.u8(0x02); w.u8(0x03);
            w.align(8);
            expect(w.pos).toBe(8);
            const out = w.finalize();
            expect(out.length).toBe(8);
            for (let i = 3; i < 8; i++) {
                expect(out[i]).toBe(0x00);
            }
        });

        test('align(4): already aligned pos → no change', () => {
            const w = writer.create();
            w.u32(0x12345678);
            expect(w.pos).toBe(4);
            w.align(4);
            expect(w.pos).toBe(4);
        });

        test('align(1): always no-op', () => {
            const w = writer.create();
            w.u8(0xAA);
            w.align(1);
            expect(w.pos).toBe(1);
        });

        // seek then overwrite: write u32 at offset 100, finalize, read offset 100
        test('seek + overwrite at offset 100', () => {
            const w = writer.create({ endian: 'be' });
            // Write 104 placeholder bytes
            for (let i = 0; i < 104; i++) w.u8(0x00);
            // Seek back and overwrite u32 at offset 100
            w.seek(100);
            w.u32(0xBEEFCAFE);
            const out = w.finalize();
            expect(out.length).toBe(104);
            const r = reader.create(out, { endian: 'be' });
            r.seek(100);
            expect(r.u32()).toBe(0xBEEFCAFE);
        });
    });

    describe('round-trip with binaryReader', () => {
        let reader;
        let writer;
        beforeEach(() => {
            reader = binaryReader.factory();
            writer = binaryWriter.factory();
        });

        test('u8 round-trip', () => {
            const w = writer.create({ endian: 'be' });
            w.u8(255);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.u8()).toBe(255);
        });

        test('u16 big-endian round-trip', () => {
            const w = writer.create({ endian: 'be' });
            w.u16(0x1234);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.u16()).toBe(0x1234);
        });

        test('u16 little-endian round-trip', () => {
            const w = writer.create({ endian: 'le' });
            w.u16(0x1234);
            const r = reader.create(w.finalize(), { endian: 'le' });
            expect(r.u16()).toBe(0x1234);
        });

        test('u24 round-trip', () => {
            const w = writer.create({ endian: 'be' });
            w.u24(0xABCDEF);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.u24()).toBe(0xABCDEF);
        });

        test('u32 round-trip', () => {
            const w = writer.create({ endian: 'be' });
            w.u32(0xDEADBEEF);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.u32()).toBe(0xDEADBEEF);
        });

        test('u64 round-trip', () => {
            const big = 123456789012345n;
            const w = writer.create({ endian: 'be' });
            w.u64(big);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.u64()).toBe(big);
        });

        test('i8 round-trip negative', () => {
            const w = writer.create({ endian: 'be' });
            w.i8(-42);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.i8()).toBe(-42);
        });

        test('i16 round-trip negative', () => {
            const w = writer.create({ endian: 'be' });
            w.i16(-1000);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.i16()).toBe(-1000);
        });

        test('i32 round-trip negative', () => {
            const w = writer.create({ endian: 'be' });
            w.i32(-100000);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.i32()).toBe(-100000);
        });

        test('i64 round-trip negative', () => {
            const w = writer.create({ endian: 'be' });
            w.i64(-9007199254740993n);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.i64()).toBe(-9007199254740993n);
        });

        test('f32 round-trip', () => {
            const w = writer.create({ endian: 'be' });
            w.f32(3.14);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.f32()).toBeCloseTo(3.14, 5);
        });

        test('f64 round-trip', () => {
            const w = writer.create({ endian: 'be' });
            w.f64(Math.PI);
            const r = reader.create(w.finalize(), { endian: 'be' });
            expect(r.f64()).toBe(Math.PI);
        });

        test('utf8 multi-byte round-trip', () => {
            const w = writer.create();
            const str = 'café 日本語';
            w.utf8(str);
            const encoded = new TextEncoder().encode(str);
            const r = reader.create(w.finalize());
            expect(r.utf8(encoded.byteLength)).toBe(str);
        });

        test('cstring round-trip', () => {
            const w = writer.create();
            w.cstring('hello');
            const r = reader.create(w.finalize());
            expect(r.cstring()).toBe('hello');
        });

        test('mixed primitives round-trip', () => {
            const w = writer.create({ endian: 'be' });
            w.u8(0x01);
            w.u16(0x0203);
            w.u32(0x04050607);
            w.i8(-1);
            w.f64(Math.E);
            const out = w.finalize();
            const r = reader.create(out, { endian: 'be' });
            expect(r.u8()).toBe(0x01);
            expect(r.u16()).toBe(0x0203);
            expect(r.u32()).toBe(0x04050607);
            expect(r.i8()).toBe(-1);
            expect(r.f64()).toBe(Math.E);
        });
    });
});
