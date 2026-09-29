// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { binaryReader } from './reader.js';

describe('binaryReader module', () => {
    test('should have correct module metadata', () => {
        expect(binaryReader.name).toBe('binaryReader');
        expect(binaryReader.dependencies).toEqual([]);
        expect(typeof binaryReader.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = binaryReader.factory();
            expect(typeof inst.create).toBe('function');
        });

        test('create returns reader object with expected methods', () => {
            const inst = binaryReader.factory();
            const r = inst.create(new Uint8Array([0x01, 0x02]));
            expect(typeof r.u8).toBe('function');
            expect(typeof r.u16).toBe('function');
            expect(typeof r.u32).toBe('function');
            expect(typeof r.u64).toBe('function');
            expect(typeof r.i8).toBe('function');
            expect(typeof r.i16).toBe('function');
            expect(typeof r.i32).toBe('function');
            expect(typeof r.i64).toBe('function');
            expect(typeof r.f32).toBe('function');
            expect(typeof r.f64).toBe('function');
            expect(typeof r.bytes).toBe('function');
            expect(typeof r.utf8).toBe('function');
            expect(typeof r.ascii).toBe('function');
            expect(typeof r.cstring).toBe('function');
            expect(typeof r.seek).toBe('function');
            expect(typeof r.skip).toBe('function');
            expect(typeof r.peek).toBe('function');
            expect(typeof r.eof).toBe('function');
            expect(typeof r.tell).toBe('function');
            expect(typeof r.sub).toBe('function');
            expect(typeof r.setEndian).toBe('function');
        });
    });

    describe('create', () => {
        test('throws ContractError on non-Uint8Array input', () => {
            const inst = binaryReader.factory();
            expect(() => inst.create('not a buffer')).toThrow();
            expect(() => inst.create(null)).toThrow();
            expect(() => inst.create([1, 2, 3])).toThrow();
        });
    });

    describe('endianness', () => {
        let inst;
        beforeEach(() => { inst = binaryReader.factory(); });

        test('u16 big-endian: [0x12, 0x34] → 0x1234', () => {
            const r = inst.create(new Uint8Array([0x12, 0x34]), { endian: 'be' });
            expect(r.u16()).toBe(0x1234);
        });

        test('u16 little-endian: [0x12, 0x34] → 0x3412', () => {
            const r = inst.create(new Uint8Array([0x12, 0x34]), { endian: 'le' });
            expect(r.u16()).toBe(0x3412);
        });

        test('u32 big-endian: [0x12, 0x34, 0x56, 0x78] → 0x12345678', () => {
            const r = inst.create(new Uint8Array([0x12, 0x34, 0x56, 0x78]), { endian: 'be' });
            expect(r.u32()).toBe(0x12345678);
        });

        test('u32 little-endian: [0x12, 0x34, 0x56, 0x78] → 0x78563412', () => {
            const r = inst.create(new Uint8Array([0x12, 0x34, 0x56, 0x78]), { endian: 'le' });
            expect(r.u32()).toBe(0x78563412);
        });

        test('defaults to big-endian when no option given', () => {
            const r = inst.create(new Uint8Array([0x12, 0x34]));
            expect(r.u16()).toBe(0x1234);
        });
    });

    describe('unsigned integer primitives', () => {
        let inst;
        beforeEach(() => { inst = binaryReader.factory(); });

        test('u8 reads single byte', () => {
            const r = inst.create(new Uint8Array([0xFF]));
            expect(r.u8()).toBe(255);
        });

        test('u16 big-endian', () => {
            const r = inst.create(new Uint8Array([0xAB, 0xCD]), { endian: 'be' });
            expect(r.u16()).toBe(0xABCD);
        });

        test('u24 big-endian', () => {
            const r = inst.create(new Uint8Array([0x01, 0x02, 0x03]), { endian: 'be' });
            expect(r.u24()).toBe(0x010203);
        });

        test('u24 little-endian', () => {
            const r = inst.create(new Uint8Array([0x03, 0x02, 0x01]), { endian: 'le' });
            expect(r.u24()).toBe(0x010203);
        });

        test('u32 big-endian', () => {
            const r = inst.create(new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]), { endian: 'be' });
            expect(r.u32()).toBe(0xDEADBEEF);
        });

        test('u64 returns BigInt', () => {
            const buf = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
            const r = inst.create(buf, { endian: 'be' });
            expect(r.u64()).toBe(1n);
        });

        test('u64 BigInt value beyond Number.MAX_SAFE_INTEGER', () => {
            // 2^53 + 1 = 9007199254740993
            const big = 9007199254740993n;
            const buf = new ArrayBuffer(8);
            new DataView(buf).setBigUint64(0, big, false);
            const r = inst.create(new Uint8Array(buf), { endian: 'be' });
            expect(r.u64()).toBe(big);
        });
    });

    describe('signed integer primitives', () => {
        let inst;
        beforeEach(() => { inst = binaryReader.factory(); });

        test('i8 reads signed byte', () => {
            const r = inst.create(new Uint8Array([0xFF]));
            expect(r.i8()).toBe(-1);
        });

        test('i16 big-endian negative', () => {
            const r = inst.create(new Uint8Array([0xFF, 0xFF]), { endian: 'be' });
            expect(r.i16()).toBe(-1);
        });

        test('i32 big-endian negative', () => {
            const buf = new Uint8Array(4);
            new DataView(buf.buffer).setInt32(0, -42, false);
            const r = inst.create(buf, { endian: 'be' });
            expect(r.i32()).toBe(-42);
        });

        test('i64 returns BigInt negative', () => {
            const buf = new Uint8Array(8);
            new DataView(buf.buffer).setBigInt64(0, -1n, false);
            const r = inst.create(buf, { endian: 'be' });
            expect(r.i64()).toBe(-1n);
        });
    });

    describe('float primitives', () => {
        let inst;
        beforeEach(() => { inst = binaryReader.factory(); });

        test('f32 round-trip', () => {
            const buf = new Uint8Array(4);
            new DataView(buf.buffer).setFloat32(0, 3.14, false);
            const r = inst.create(buf, { endian: 'be' });
            expect(r.f32()).toBeCloseTo(3.14, 5);
        });

        test('f64 round-trip', () => {
            const buf = new Uint8Array(8);
            new DataView(buf.buffer).setFloat64(0, Math.PI, false);
            const r = inst.create(buf, { endian: 'be' });
            expect(r.f64()).toBe(Math.PI);
        });
    });

    describe('chained reads - pos advancement', () => {
        test('three u16 reads advance pos by 6', () => {
            const r = binaryReader.factory().create(
                new Uint8Array([0x00, 0x01, 0x00, 0x02, 0x00, 0x03]),
                { endian: 'be' }
            );
            expect(r.u16()).toBe(1);
            expect(r.u16()).toBe(2);
            expect(r.u16()).toBe(3);
            expect(r.pos).toBe(6);
        });
    });

    describe('bytes(n)', () => {
        test('returns Uint8Array of correct size', () => {
            const r = binaryReader.factory().create(new Uint8Array([1, 2, 3, 4, 5]));
            const b = r.bytes(3);
            expect(b instanceof Uint8Array).toBe(true);
            expect(b.length).toBe(3);
            expect(b[0]).toBe(1);
            expect(b[1]).toBe(2);
            expect(b[2]).toBe(3);
        });
    });

    describe('utf8(n)', () => {
        test('decodes ASCII string', () => {
            const enc = new TextEncoder().encode('hello');
            const r = binaryReader.factory().create(enc);
            expect(r.utf8(5)).toBe('hello');
        });

        test('decodes UTF-8 multi-byte (é = 2 bytes)', () => {
            const enc = new TextEncoder().encode('café');
            const r = binaryReader.factory().create(enc);
            expect(r.utf8(enc.byteLength)).toBe('café');
        });
    });

    describe('cstring()', () => {
        test('reads until NUL and advances past it', () => {
            const buf = new Uint8Array([72, 101, 108, 108, 111, 0, 0xFF]); // "Hello\0\xFF"
            const r = binaryReader.factory().create(buf);
            const s = r.cstring();
            expect(s).toBe('Hello');
            expect(r.pos).toBe(6); // advanced past NUL
        });

        test('empty string before NUL', () => {
            const buf = new Uint8Array([0x00, 0xAA]);
            const r = binaryReader.factory().create(buf);
            expect(r.cstring()).toBe('');
            expect(r.pos).toBe(1);
        });
    });

    describe('peek(n)', () => {
        test('reads bytes without advancing pos', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01, 0x02, 0x03]));
            const p = r.peek(2);
            expect(p[0]).toBe(0x01);
            expect(p[1]).toBe(0x02);
            expect(r.pos).toBe(0); // pos unchanged
        });
    });

    describe('seek / skip', () => {
        test('seek moves to absolute position', () => {
            const r = binaryReader.factory().create(new Uint8Array([0xAA, 0xBB, 0xCC]));
            r.seek(2);
            expect(r.u8()).toBe(0xCC);
        });

        test('skip moves relative from current pos', () => {
            const r = binaryReader.factory().create(new Uint8Array([0xAA, 0xBB, 0xCC]));
            r.skip(1);
            expect(r.u8()).toBe(0xBB);
        });

        test('tell is alias of pos', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01, 0x02]));
            r.u8();
            expect(r.tell()).toBe(r.pos);
            expect(r.tell()).toBe(1);
        });

        test('seek out of bounds throws ContractError', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01, 0x02]));
            expect(() => r.seek(5)).toThrow();
        });
    });

    describe('eof()', () => {
        test('returns false before end', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01]));
            expect(r.eof()).toBe(false);
        });

        test('returns true at length', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01]));
            r.u8();
            expect(r.eof()).toBe(true);
        });
    });

    describe('sub(off, len)', () => {
        test('creates independent reader on a slice', () => {
            const r = binaryReader.factory().create(
                new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]), { endian: 'be' }
            );
            const sub = r.sub(1, 2);
            expect(sub.u8()).toBe(0xBB);
            expect(sub.u8()).toBe(0xCC);
            expect(r.pos).toBe(0); // parent unaffected
        });

        test('sub out of bounds throws ContractError', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01, 0x02]));
            expect(() => r.sub(0, 10)).toThrow();
        });

        test('sub shares buffer (zero-copy): modifying parent buffer affects sub', () => {
            const raw = new Uint8Array([0xAA, 0xBB, 0xCC]);
            const r = binaryReader.factory().create(raw, { endian: 'be' });
            const sub = r.sub(1, 2);
            // Mutate the underlying raw array (parent buffer)
            raw[1] = 0xFF;
            expect(sub.u8()).toBe(0xFF); // zero-copy: sub sees the change
        });
    });

    describe('setEndian', () => {
        test('switches endianness mid-stream', () => {
            // [0x12, 0x34, 0x56, 0x78]: first u16 BE = 0x1234, then u16 LE = 0x7856
            const r = binaryReader.factory().create(
                new Uint8Array([0x12, 0x34, 0x56, 0x78]), { endian: 'be' }
            );
            expect(r.u16()).toBe(0x1234);
            r.setEndian('le');
            expect(r.u16()).toBe(0x7856);
        });

        test('throws on invalid endian value', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01]));
            expect(() => r.setEndian('xx')).toThrow();
        });
    });

    describe('read beyond length', () => {
        test('throws ContractError when reading past end', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01]));
            r.u8(); // consumes the 1 byte
            expect(() => r.u8()).toThrow();
        });

        test('throws ContractError for u16 with only 1 byte left', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x01]));
            expect(() => r.u16()).toThrow();
        });
    });

    describe('ascii()', () => {
        test('reads valid ASCII string', () => {
            const r = binaryReader.factory().create(new Uint8Array([65, 66, 67]));
            expect(r.ascii(3)).toBe('ABC');
        });

        test('throws ContractError on byte > 127', () => {
            const r = binaryReader.factory().create(new Uint8Array([0x80]));
            expect(() => r.ascii(1)).toThrow();
        });
    });

    describe('u64Safe()', () => {
        test('returns Number for safe values', () => {
            const buf = new Uint8Array(8);
            new DataView(buf.buffer).setBigUint64(0, 42n, false);
            const r = binaryReader.factory().create(buf, { endian: 'be' });
            const v = r.u64Safe();
            expect(typeof v).toBe('number');
            expect(v).toBe(42);
        });

        test('throws ContractError for values > MAX_SAFE_INTEGER', () => {
            const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
            const buf = new Uint8Array(8);
            new DataView(buf.buffer).setBigUint64(0, big, false);
            const r = binaryReader.factory().create(buf, { endian: 'be' });
            expect(() => r.u64Safe()).toThrow();
        });
    });

    describe('robustness / regression', () => {
        let inst;
        beforeEach(() => { inst = binaryReader.factory(); });

        // ── u64 / i64 large BigInt vectors ────────────────────────────────

        test('u64 BE: max uint64 = 0xFFFFFFFFFFFFFFFFn', () => {
            const buf = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
            const r = inst.create(buf, { endian: 'be' });
            expect(r.u64()).toBe(0xFFFFFFFFFFFFFFFFn);
        });

        test('u64 LE: 0x0102030405060708 stored little-endian', () => {
            // LE bytes for 0x0102030405060708n: [08,07,06,05,04,03,02,01]
            const buf = new Uint8Array([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]);
            const r = inst.create(buf, { endian: 'le' });
            expect(r.u64()).toBe(0x0102030405060708n);
        });

        test('i64 BE: min int64 = -9223372036854775808n', () => {
            // 0x8000000000000000
            const buf = new Uint8Array([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            const r = inst.create(buf, { endian: 'be' });
            expect(r.i64()).toBe(-9223372036854775808n);
        });

        test('i64 LE: large negative value round-trip', () => {
            const val = -9007199254740993n; // just past Number.MAX_SAFE_INTEGER
            const buf = new Uint8Array(8);
            new DataView(buf.buffer).setBigInt64(0, val, true); // little-endian
            const r = inst.create(buf, { endian: 'le' });
            expect(r.i64()).toBe(val);
        });

        // ── u24 BE/LE boundary values ──────────────────────────────────────

        test('u24 BE: minimum non-zero 0x000001', () => {
            const r = inst.create(new Uint8Array([0x00, 0x00, 0x01]), { endian: 'be' });
            expect(r.u24()).toBe(0x000001);
        });

        test('u24 BE: maximum 0xFFFFFF', () => {
            const r = inst.create(new Uint8Array([0xFF, 0xFF, 0xFF]), { endian: 'be' });
            expect(r.u24()).toBe(0xFFFFFF);
        });

        test('u24 LE: minimum non-zero 0x000001 stored as [0x01, 0x00, 0x00]', () => {
            const r = inst.create(new Uint8Array([0x01, 0x00, 0x00]), { endian: 'le' });
            expect(r.u24()).toBe(0x000001);
        });

        test('u24 LE: maximum 0xFFFFFF stored as [0xFF, 0xFF, 0xFF]', () => {
            const r = inst.create(new Uint8Array([0xFF, 0xFF, 0xFF]), { endian: 'le' });
            expect(r.u24()).toBe(0xFFFFFF);
        });

        // ── f32 / f64 crafted buffer round-trips ──────────────────────────

        test('f32 crafted buffer: -1.0 BE = [0xBF, 0x80, 0x00, 0x00]', () => {
            const r = inst.create(new Uint8Array([0xBF, 0x80, 0x00, 0x00]), { endian: 'be' });
            expect(r.f32()).toBe(-1.0);
        });

        test('f32 crafted buffer: 0.0 LE = [0x00, 0x00, 0x00, 0x00]', () => {
            const r = inst.create(new Uint8Array([0x00, 0x00, 0x00, 0x00]), { endian: 'le' });
            expect(r.f32()).toBe(0.0);
        });

        test('f64 crafted buffer: 1.0 BE = [0x3F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]', () => {
            const r = inst.create(
                new Uint8Array([0x3F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
                { endian: 'be' }
            );
            expect(r.f64()).toBe(1.0);
        });

        test('f64 crafted buffer: -Infinity BE = [0xFF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]', () => {
            const r = inst.create(
                new Uint8Array([0xFF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
                { endian: 'be' }
            );
            expect(r.f64()).toBe(-Infinity);
        });

        // ── cstring without NUL terminator ────────────────────────────────

        test('cstring without NUL terminator throws with code binary/reader-cstring', () => {
            const buf = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" - no NUL
            const r = inst.create(buf);
            let err;
            try { r.cstring(); } catch (e) { err = e; }
            expect(err).toBeDefined();
            expect(err.code).toBe('binary/reader-cstring');
        });

        // ── read past EOF ─────────────────────────────────────────────────

        test('read past EOF throws with code binary/reader-eof', () => {
            const r = inst.create(new Uint8Array([0x01]));
            r.u8();
            let err;
            try { r.u8(); } catch (e) { err = e; }
            expect(err).toBeDefined();
            expect(err.code).toBe('binary/reader-eof');
        });

        // ── seek out of bounds ────────────────────────────────────────────

        test('seek negative throws with code binary/reader-seek', () => {
            const r = inst.create(new Uint8Array([0x01, 0x02]));
            let err;
            try { r.seek(-1); } catch (e) { err = e; }
            expect(err).toBeDefined();
            expect(err.code).toBe('binary/reader-seek');
        });

        test('seek to exactly length (EOF boundary) is valid', () => {
            const r = inst.create(new Uint8Array([0x01, 0x02]));
            expect(() => r.seek(2)).not.toThrow();
            expect(r.pos).toBe(2);
            expect(r.eof()).toBe(true);
        });

        test('seek beyond length throws with code binary/reader-seek', () => {
            const r = inst.create(new Uint8Array([0x01, 0x02]));
            let err;
            try { r.seek(3); } catch (e) { err = e; }
            expect(err).toBeDefined();
            expect(err.code).toBe('binary/reader-seek');
        });

        // ── sub() exact upper bound ───────────────────────────────────────

        test('sub() with offset+length === parent.length is valid', () => {
            const buf = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]);
            const r = inst.create(buf, { endian: 'be' });
            // offset=2, length=2 → 2+2 === 4 === parent.length
            expect(() => r.sub(2, 2)).not.toThrow();
            const sub = r.sub(2, 2);
            expect(sub.u8()).toBe(0xCC);
            expect(sub.u8()).toBe(0xDD);
        });

        // ── setEndian changes subsequent reads ────────────────────────────

        test('setEndian("be") then setEndian("le") changes reads accordingly', () => {
            const buf = new Uint8Array([0x01, 0x00, 0x01, 0x00]);
            const r = inst.create(buf, { endian: 'be' });
            // BE: [0x01, 0x00] = 256
            expect(r.u16()).toBe(0x0100);
            // switch to LE: [0x01, 0x00] = 1
            r.setEndian('le');
            expect(r.u16()).toBe(0x0001);
        });

        // ── peek* must NOT advance the cursor ────────────────────────────

        test('peek(n) does not advance pos - repeated peeks return same bytes', () => {
            const r = inst.create(new Uint8Array([0xAA, 0xBB, 0xCC]));
            const p1 = r.peek(2);
            const p2 = r.peek(2);
            expect(r.pos).toBe(0);
            expect(p1[0]).toBe(0xAA);
            expect(p2[0]).toBe(0xAA);
        });

        test('peek then read: pos only advances on read, not peek', () => {
            const r = inst.create(new Uint8Array([0x42, 0x43]));
            r.peek(1);
            expect(r.pos).toBe(0);
            expect(r.u8()).toBe(0x42);
            expect(r.pos).toBe(1);
        });
    });
});
