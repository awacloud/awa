// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { mutex } from './mutex.js';

describe('mutex module', () => {
    test('should have correct module metadata', () => {
        expect(mutex.name).toBe('mutex');
        expect(mutex.dependencies).toEqual([]);
        expect(typeof mutex.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = mutex.factory();
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create', () => {
        let inst;
        beforeEach(() => { inst = mutex.factory(); });

        test('returns an object with acquire, release, tryAcquire, runExclusive, locked', () => {
            const m = inst.create();
            expect(typeof m.acquire).toBe('function');
            expect(typeof m.release).toBe('function');
            expect(typeof m.tryAcquire).toBe('function');
            expect(typeof m.runExclusive).toBe('function');
            expect(typeof m.locked).toBe('boolean');
        });

        test('locked is false initially', () => {
            const m = inst.create();
            expect(m.locked).toBe(false);
        });

        test('acquire resolves, sets locked to true', async () => {
            const m = inst.create();
            await m.acquire();
            expect(m.locked).toBe(true);
        });

        test('release sets locked to false', async () => {
            const m = inst.create();
            await m.acquire();
            m.release();
            expect(m.locked).toBe(false);
        });

        test('release on unlocked throws', () => {
            const m = inst.create();
            expect(() => m.release()).toThrow('mutex: release on unlocked');
        });

        test('tryAcquire returns true when unlocked', () => {
            const m = inst.create();
            expect(m.tryAcquire()).toBe(true);
            expect(m.locked).toBe(true);
        });

        test('tryAcquire returns false when locked', async () => {
            const m = inst.create();
            await m.acquire();
            expect(m.tryAcquire()).toBe(false);
        });

        test('concurrent acquires are serialized FIFO', async () => {
            const m = inst.create();
            const order = [];
            await m.acquire();

            const p1 = m.acquire().then(() => { order.push(1); m.release(); });
            const p2 = m.acquire().then(() => { order.push(2); m.release(); });
            const p3 = m.acquire().then(() => { order.push(3); m.release(); });

            m.release();
            await Promise.all([p1, p2, p3]);
            expect(order).toEqual([1, 2, 3]);
        });

        test('runExclusive acquires, runs fn, releases', async () => {
            const m = inst.create();
            const result = await m.runExclusive(async () => {
                expect(m.locked).toBe(true);
                return 42;
            });
            expect(result).toBe(42);
            expect(m.locked).toBe(false);
        });

        test('runExclusive releases even if fn throws', async () => {
            const m = inst.create();
            await expect(m.runExclusive(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
            expect(m.locked).toBe(false);
        });

        test('multiple waiters unblock in chain after releases', async () => {
            const m = inst.create();
            let count = 0;
            await m.acquire();

            const tasks = Array.from({ length: 5 }, () =>
                m.acquire().then(() => { count++; m.release(); })
            );

            m.release();
            await Promise.all(tasks);
            expect(count).toBe(5);
        });
    });
});
