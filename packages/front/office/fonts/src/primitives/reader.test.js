// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontReader } from './reader.js';
import { testRuntime } from './_test-runtime.js';
const { BinaryReader } = testRuntime.resolve('fontReader');
const { ParseError } = testRuntime.resolve('fontErrors');

function bytes(...arr) { return new Uint8Array(arr); }

describe('BinaryReader', () => {
    test('module metadata', () => {
        expect(fontReader.name).toBe('fontReader');
        expect(typeof fontReader.factory).toBe('function');
        const m = testRuntime.resolve('fontReader');
        expect(m.reader(bytes(1, 2, 3))).toBeInstanceOf(m.BinaryReader);
        expect(fontReader.dependencies).toEqual(['fontErrors', 'binaryReader', 'fontFixed']);
    });

    test('reads unsigned big-endian ints', () => {
        const r = new BinaryReader(bytes(0x12, 0x34, 0x56, 0x78));
        expect(r.readUint16()).toBe(0x1234);
        expect(r.readUint16()).toBe(0x5678);
    });

    test('reads signed ints (BE)', () => {
        const r = new BinaryReader(bytes(0xFF, 0xFF));
        expect(r.readInt16()).toBe(-1);
    });

    test('reads uint24', () => {
        const r = new BinaryReader(bytes(0xAB, 0xCD, 0xEF));
        expect(r.readUint24()).toBe(0xABCDEF);
    });

    test('reads uint32 + tag', () => {
        const r = new BinaryReader(bytes(0x68, 0x65, 0x61, 0x64));
        expect(r.readTag()).toBe(0x68656164);
    });

    test('Fixed 16.16 + F2Dot14', () => {
        let r = new BinaryReader(bytes(0x00, 0x01, 0x00, 0x00));
        expect(r.readFixed()).toBe(1);
        r = new BinaryReader(bytes(0x40, 0x00));
        expect(r.readF2Dot14()).toBe(1);
    });

    test('LONGDATETIME', () => {
        const r = new BinaryReader(bytes(0, 0, 0, 0, 0, 0, 0x10, 0));
        expect(r.readLongDateTime()).toBe(0x1000);
    });

    test('seek / skip / pos / eof', () => {
        const r = new BinaryReader(bytes(1, 2, 3, 4));
        r.skip(2);
        expect(r.pos).toBe(2);
        expect(r.readUint8()).toBe(3);
        r.seek(4);
        expect(r.eof).toBe(true);
    });

    test('peek does not move cursor', () => {
        const r = new BinaryReader(bytes(0xAA, 0xBB));
        const v = r.peek(rr => rr.readUint8());
        expect(v).toBe(0xAA);
        expect(r.pos).toBe(0);
    });

    test('sub reader', () => {
        const r = new BinaryReader(bytes(1, 2, 3, 4, 5, 6));
        const s = r.sub(2, 3);
        expect(s.readUint8()).toBe(3);
        expect(s.length).toBe(3);
        expect(r.pos).toBe(0);
    });

    test('readBytes returns a view', () => {
        const r = new BinaryReader(bytes(1, 2, 3, 4));
        const v = r.readBytes(2);
        expect(Array.from(v)).toEqual([1, 2]);
    });

    test('eof throws ParseError', () => {
        const r = new BinaryReader(bytes(1));
        expect(() => r.readUint16()).toThrow(ParseError);
    });

    test('rejects non-Uint8Array input', () => {
        expect(() => new BinaryReader([1, 2, 3])).toThrow(ParseError);
    });

    test('rejects out-of-bounds construction', () => {
        const buf = bytes(1, 2, 3);
        expect(() => new BinaryReader(buf, 2, 5)).toThrow(ParseError);
    });

    test('seek out of bounds', () => {
        const r = new BinaryReader(bytes(1, 2));
        expect(() => r.seek(10)).toThrow(ParseError);
    });

    describe('faÃ§ade invariants (R5)', () => {
        test('readBytes returns view sharing the source buffer', () => {
            const src = bytes(1, 2, 3, 4, 5, 6);
            const r = new BinaryReader(src);
            const view = r.readBytes(4);
            expect(view).toBeInstanceOf(Uint8Array);
            expect(view.length).toBe(4);
            // Shared buffer â€” faÃ§ade documents this contract; consumers
            // such as woff2-write rely on it.
            expect(view.buffer).toBe(src.buffer);
        });

        test('readBytesCopy returns an independent copy', () => {
            const src = bytes(1, 2, 3, 4);
            const r = new BinaryReader(src);
            const copy = r.readBytesCopy(4);
            expect(copy).toEqual(bytes(1, 2, 3, 4));
            expect(copy.buffer).not.toBe(src.buffer);
        });

        test('readLongDateTime preserves values larger than 2^32', () => {
            // 2 ^ 33 = 8589934592 â€” well within JS safe-integer range
            const target = 2 ** 33 + 1234;
            const hi = Math.floor(target / 0x100000000) | 0;
            const lo = (target - hi * 0x100000000) >>> 0;
            const buf = new Uint8Array(8);
            buf[0] = (hi >>> 24) & 0xFF; buf[1] = (hi >>> 16) & 0xFF;
            buf[2] = (hi >>>  8) & 0xFF; buf[3] =  hi         & 0xFF;
            buf[4] = (lo >>> 24) & 0xFF; buf[5] = (lo >>> 16) & 0xFF;
            buf[6] = (lo >>>  8) & 0xFF; buf[7] =  lo         & 0xFF;
            const r = new BinaryReader(buf);
            expect(r.readLongDateTime()).toBe(target);
        });
    });
});

describe('BinaryReader — translated error cause', () => {
    function caught(fn) {
        try { fn(); } catch (e) { return e; }
        throw new Error('expected the read to throw');
    }

    test('a scalar read past the end keeps the fw ContractError as cause', () => {
        const err = caught(() => new BinaryReader(bytes(1)).readUint16());
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('fonts/reader-eof');
        expect(err.cause).toBeDefined();
        expect(err.cause.name).toBe('ContractError');
        expect(err.cause.code).toBe('binary/reader-eof');
    });

    test('a byte read past the end keeps the fw ContractError as cause', () => {
        const err = caught(() => new BinaryReader(bytes(1)).readBytes(5));
        expect(err).toBeInstanceOf(ParseError);
        expect(err.code).toBe('fonts/reader-eof');
        expect(err.cause).toBeDefined();
        expect(err.cause.name).toBe('ContractError');
        expect(err.cause.code).toBe('binary/reader-eof');
    });

    test('the cause leaves the translated message and context untouched', () => {
        const err = caught(() => new BinaryReader(bytes(1)).readUint32());
        expect(err.message).toBe(err.cause.message);
        expect(err.context).toEqual(err.cause.context || {});
    });
});
