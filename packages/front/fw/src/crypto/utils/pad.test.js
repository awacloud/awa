// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { pad } from './pad.js';

describe('pad module', () => {

    test('module metadata', () => {
        expect(pad.name).toBe('pad');
        expect(pad.dependencies).toEqual([]);
        expect(typeof pad.factory).toBe('function');
    });

    const p = pad.factory();

    describe('factory shape', () => {
        test('exposes pad/strip and fast.pad/fast.strip', () => {
            expect(typeof p.pad).toBe('function');
            expect(typeof p.strip).toBe('function');
            expect(typeof p.fast.pad).toBe('function');
            expect(typeof p.fast.strip).toBe('function');
        });
    });

    describe('pad (PKCS#7)', () => {
        test('pads 1 byte to 16 with 15 × 0x0F', () => {
            const out = p.pad(new Uint8Array([0xAA]));
            expect(out.length).toBe(16);
            expect(out[0]).toBe(0xAA);
            for (let i = 1; i < 16; i++) expect(out[i]).toBe(15);
        });

        test('pads 15 bytes to 16 with 1 × 0x01', () => {
            const out = p.pad(new Uint8Array(15).fill(0xCC));
            expect(out.length).toBe(16);
            expect(out[15]).toBe(0x01);
        });

        test('block-aligned input (16 bytes ending in non-pad value) passes through unchanged', () => {
            const data = new Uint8Array(16).fill(0xAB);
            const out = p.pad(data);
            expect(out.length).toBe(16);
            expect(Array.from(out)).toEqual(Array.from(data));
        });

        test('block-aligned input ending in valid pad gets a full extra block', () => {
            const data = new Uint8Array(16);
            data[15] = 1;
            const out = p.pad(data);
            expect(out.length).toBe(32);
            for (let i = 16; i < 32; i++) expect(out[i]).toBe(16);
        });

        test('rejects array containing non-byte values', () => {
            expect(p.pad([1, 2, 999])).toBe(false);
        });

        test('accepts plain JS byte array', () => {
            const out = p.pad([1, 2, 3]);
            expect(out).toBeInstanceOf(Uint8Array);
            expect(out.length).toBe(16);
        });
    });

    describe('strip (PKCS#7)', () => {
        test('strip(pad(x)) === x for 1-byte input', () => {
            const original = new Uint8Array([0xFF]);
            const out = p.strip(p.pad(original));
            expect(Array.from(out)).toEqual([0xFF]);
        });

        test('strip(pad(x)) === x for 5-byte input', () => {
            const original = new Uint8Array([1, 2, 3, 4, 5]);
            const out = p.strip(p.pad(original));
            expect(Array.from(out)).toEqual(Array.from(original));
        });

        test('strip(pad(x)) === x for 15-byte input (one byte of pad)', () => {
            const original = new Uint8Array(15).fill(0xAB);
            const out = p.strip(p.pad(original));
            expect(Array.from(out)).toEqual(Array.from(original));
        });

        test('strip(pad(x)) === x for 16-byte block-aligned input ending in pad-like byte', () => {
            const original = new Uint8Array(16);
            original[15] = 1;
            const out = p.strip(p.pad(original));
            expect(Array.from(out)).toEqual(Array.from(original));
        });

        test('strip(pad(x)) === x for 17-byte input (spans two blocks)', () => {
            const original = new Uint8Array(17).fill(0xAB);
            const out = p.strip(p.pad(original));
            expect(Array.from(out)).toEqual(Array.from(original));
        });

        test('strip(pad(x)) === x for 31-byte input', () => {
            const original = new Uint8Array(31);
            for (let i = 0; i < 31; i++) original[i] = i;
            const out = p.strip(p.pad(original));
            expect(Array.from(out)).toEqual(Array.from(original));
        });

        test('strip returns false on a non-block-aligned buffer (cannot be PKCS#7-padded)', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const out = p.strip(data);
            expect(out).toBe(false);
        });
    });

    describe('fast variants', () => {
        test('fast.strip(fast.pad(x)) roundtrips on a short input', () => {
            const original = new Uint8Array([10, 20, 30]);
            const out = p.fast.strip(p.fast.pad(original));
            expect(Array.from(out)).toEqual(Array.from(original));
        });

        test('fast.strip(fast.pad(x)) roundtrips on a multi-block input', () => {
            const original = new Uint8Array(20);
            for (let i = 0; i < 20; i++) original[i] = i;
            const out = p.fast.strip(p.fast.pad(original));
            expect(Array.from(out)).toEqual(Array.from(original));
        });
    });
});
