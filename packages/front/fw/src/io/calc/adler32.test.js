// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { adler32 } from './adler32.js';

describe('adler32 module', () => {

    test('has correct module metadata', () => {
        expect(adler32.name).toBe('adler32');
        expect(adler32.dependencies).toEqual([]);
        expect(typeof adler32.factory).toBe('function');
    });

    describe('factory', () => {
        const Adler32 = adler32.factory();

        test('returns a constructor', () => {
            expect(typeof Adler32).toBe('function');
        });

        test('empty input returns 1 (initial value)', () => {
            const a = new Adler32();
            expect(a.get()).toBe(1);
        });

        test('known value: "Mark Adler"', () => {
            // Adler32("Mark Adler"): a=916, b=4871 → (4871<<16)|916 = 0x13070394
            const a = new Adler32();
            a.append(new TextEncoder().encode('Mark Adler'));
            expect(a.get()).toBe(0x13070394);
        });

        test('known value: "abc"', () => {
            // Adler32("abc") = 0x024D0127
            const a = new Adler32();
            a.append(new TextEncoder().encode('abc'));
            expect(a.get()).toBe(0x024D0127);
        });

        test('incremental appends equal one-shot', () => {
            const data = new TextEncoder().encode('Hello, World!');
            const oneShot = new Adler32();
            oneShot.append(data);

            const incremental = new Adler32();
            incremental.append(data.subarray(0, 5));
            incremental.append(data.subarray(5));

            expect(incremental.get()).toBe(oneShot.get());
        });

        test('result is unsigned 32-bit integer', () => {
            const a = new Adler32();
            a.append(new Uint8Array(256).fill(0xFF));
            const v = a.get();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(0xFFFFFFFF);
        });

        test('instances are independent', () => {
            const Adler32b = adler32.factory();
            const a1 = new Adler32();
            const a2 = new Adler32b();
            a1.append(new TextEncoder().encode('foo'));
            a2.append(new TextEncoder().encode('bar'));
            expect(a1.get()).not.toBe(a2.get());
        });

        test('large input (> 2655 bytes) - batching path', () => {
            const data = new Uint8Array(10000).map((_, i) => i & 0xFF);
            const a = new Adler32();
            a.append(data);
            const v = a.get();
            expect(typeof v).toBe('number');
            expect(v).toBeGreaterThan(0);
        });
    });
});
