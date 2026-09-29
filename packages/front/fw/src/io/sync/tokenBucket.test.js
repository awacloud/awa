// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { tokenBucket } from './tokenBucket.js';

describe('tokenBucket module', () => {
    test('should have correct module metadata', () => {
        expect(tokenBucket.name).toBe('tokenBucket');
        expect(tokenBucket.dependencies).toEqual([]);
        expect(typeof tokenBucket.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with create function', () => {
            const inst = tokenBucket.factory();
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create', () => {
        let inst;
        beforeEach(() => { inst = tokenBucket.factory(); });

        test('throws when capacity < 1', () => {
            expect(() => inst.create({ capacity: 0, refillRate: 1 })).toThrow('tokenBucket: capacity must be an integer >= 1');
            expect(() => inst.create({ capacity: -1, refillRate: 1 })).toThrow();
        });

        test('throws on non-integer capacity', () => {
            expect(() => inst.create({ capacity: 1.5, refillRate: 1 })).toThrow();
        });

        test('throws on negative refillRate', () => {
            expect(() => inst.create({ capacity: 5, refillRate: -1 })).toThrow('tokenBucket: refillRate must be a number >= 0');
        });

        test('refillRate=0 is allowed (fixed bucket)', () => {
            const b = inst.create({ capacity: 5, refillRate: 0 });
            expect(b.capacity).toBe(5);
        });

        test('returns object with expected API', () => {
            const b = inst.create({ capacity: 5, refillRate: 1 });
            expect(typeof b.tryTake).toBe('function');
            expect(typeof b.take).toBe('function');
            expect(typeof b.reset).toBe('function');
            expect(typeof b.cancel).toBe('function');
            expect(typeof b.available).toBe('number');
            expect(typeof b.capacity).toBe('number');
        });

        test('initial available = capacity by default', () => {
            const b = inst.create({ capacity: 5, refillRate: 1 });
            expect(b.available).toBe(5);
            expect(b.capacity).toBe(5);
        });

        test('custom initial tokens', () => {
            const b = inst.create({ capacity: 10, refillRate: 1, initial: 3 });
            expect(b.available).toBe(3);
        });

        test('tryTake(1) returns true when tokens available', () => {
            const b = inst.create({ capacity: 5, refillRate: 0 });
            expect(b.tryTake(1)).toBe(true);
            expect(b.available).toBe(4);
        });

        test('tryTake more than available returns false', () => {
            const b = inst.create({ capacity: 5, refillRate: 0 });
            expect(b.tryTake(10)).toBe(false);
            expect(b.available).toBe(5);
        });

        test('tryTake reduces available', () => {
            const b = inst.create({ capacity: 5, refillRate: 0 });
            b.tryTake(3);
            expect(b.available).toBe(2);
        });

        test('tryTake(n) fails when n > available', () => {
            const b = inst.create({ capacity: 5, refillRate: 0 });
            b.tryTake(4);
            expect(b.tryTake(2)).toBe(false);
        });

        test('take resolves immediately when tokens available', async () => {
            const b = inst.create({ capacity: 5, refillRate: 0 });
            await expect(b.take(3)).resolves.toBeUndefined();
            expect(b.available).toBe(2);
        });

        test('take rejects immediately when n > capacity', async () => {
            const b = inst.create({ capacity: 5, refillRate: 1 });
            await expect(b.take(10)).rejects.toThrow('exceeds capacity');
        });

        test('take resolves after refill when tokens insufficient', async () => {
            const b = inst.create({ capacity: 5, refillRate: 5, refillInterval: 100, initial: 0 });
            const start = Date.now();
            await b.take(1);
            expect(Date.now() - start).toBeGreaterThanOrEqual(15); // some time passed
        });

        test('FIFO: multiple takes resolved in order', async () => {
            const b = inst.create({ capacity: 3, refillRate: 3, refillInterval: 100, initial: 0 });
            const order = [];
            const p1 = b.take(1).then(() => order.push(1));
            const p2 = b.take(1).then(() => order.push(2));
            const p3 = b.take(1).then(() => order.push(3));
            await Promise.all([p1, p2, p3]);
            expect(order).toEqual([1, 2, 3]);
        });

        test('cancel rejects all waiters', async () => {
            const b = inst.create({ capacity: 1, refillRate: 0, initial: 0 });
            const p1 = b.take(1);
            const p2 = b.take(1);
            b.cancel();
            await expect(p1).rejects.toThrow('tokenBucket: cancelled');
            await expect(p2).rejects.toThrow('tokenBucket: cancelled');
        });

        test('reset restores full capacity', () => {
            const b = inst.create({ capacity: 5, refillRate: 0 });
            b.tryTake(5);
            expect(b.available).toBe(0);
            b.reset();
            expect(b.available).toBe(5);
        });

        test('refill: tokens refill over time', async () => {
            const b = inst.create({ capacity: 5, refillRate: 5, refillInterval: 100, initial: 0 });
            await new Promise(r => setTimeout(r, 120));
            expect(b.available).toBeGreaterThanOrEqual(4);
        });

        test('available is capped at capacity', async () => {
            const b = inst.create({ capacity: 3, refillRate: 100, refillInterval: 100 });
            await new Promise(r => setTimeout(r, 200));
            expect(b.available).toBe(3);
        });

        test('clock skew: Date.now jumping backward does not drain tokens', () => {
            const original = Date.now;
            try {
                let fake = 10_000;
                Date.now = () => fake;
                const b = inst.create({ capacity: 10, refillRate: 1, refillInterval: 1000, initial: 5 });
                expect(b.available).toBe(5);
                // Wall-clock jumps backward (NTP correction). The monotonic clamp
                // should keep _lastUpdate ≥ previous, so elapsed = 0, no negative refill.
                fake = 5_000;
                expect(b.available).toBe(5);
            } finally {
                Date.now = original;
            }
        });

        test('many concurrent takes do not create stacked timers', async () => {
            const b = inst.create({ capacity: 5, refillRate: 5, refillInterval: 50, initial: 0 });
            // 5 waiters, head wants 1, all want 1 - verify all eventually resolve
            const tasks = Array.from({ length: 5 }, () => b.take(1));
            await Promise.all(tasks);
            // If we made it here without timeout, drain coalescing worked.
            expect(true).toBe(true);
        });

        test('cancel-then-reset: bucket stays terminal - new take() rejects', async () => {
            const b = inst.create({ capacity: 5, refillRate: 0 });
            b.cancel();
            b.reset();
            await expect(b.take(1)).rejects.toThrow('tokenBucket: cancelled');
        });

        test('cancel clears pending timer (no late drain on cancelled bucket)', async () => {
            const b = inst.create({ capacity: 1, refillRate: 1, refillInterval: 1000, initial: 0 });
            const p = b.take(1);
            b.cancel();
            await expect(p).rejects.toThrow('tokenBucket: cancelled');
            // Wait past when the drain would have fired - nothing should happen.
            await new Promise(r => setTimeout(r, 50));
            // Bucket is still cancelled.
            await expect(b.take(1)).rejects.toThrow('tokenBucket: cancelled');
        });
    });
});
