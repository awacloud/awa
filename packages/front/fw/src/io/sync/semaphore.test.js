// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { semaphore } from './semaphore.js';

describe('semaphore module', () => {
    test('should have correct module metadata', () => {
        expect(semaphore.name).toBe('semaphore');
        expect(semaphore.dependencies).toEqual([]);
        expect(typeof semaphore.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = semaphore.factory();
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create', () => {
        let inst;
        beforeEach(() => { inst = semaphore.factory(); });

        test('throws on capacity < 1', () => {
            expect(() => inst.create(0)).toThrow('semaphore: capacity must be an integer >= 1');
            expect(() => inst.create(-1)).toThrow();
        });

        test('throws on non-integer capacity', () => {
            expect(() => inst.create(1.5)).toThrow();
        });

        test('returns object with expected API', () => {
            const s = inst.create(3);
            expect(typeof s.acquire).toBe('function');
            expect(typeof s.release).toBe('function');
            expect(typeof s.tryAcquire).toBe('function');
            expect(typeof s.runExclusive).toBe('function');
            expect(typeof s.permits).toBe('number');
            expect(typeof s.capacity).toBe('number');
        });

        test('initial permits equal capacity', () => {
            const s = inst.create(3);
            expect(s.permits).toBe(3);
            expect(s.capacity).toBe(3);
        });

        test('acquire decrements permits', async () => {
            const s = inst.create(3);
            await s.acquire();
            expect(s.permits).toBe(2);
        });

        test('release increments permits', async () => {
            const s = inst.create(3);
            await s.acquire();
            s.release();
            expect(s.permits).toBe(3);
        });

        test('release beyond capacity throws', async () => {
            const s = inst.create(2);
            expect(() => s.release()).toThrow('semaphore: release exceeds capacity');
        });

        test('3 permits, 5 concurrent acquires - 3 immediate, 2 waiting', async () => {
            const s = inst.create(3);
            let resolved = 0;
            const tasks = Array.from({ length: 5 }, () => s.acquire().then(() => resolved++));
            await Promise.resolve(); // microtask flush
            expect(resolved).toBe(3);
            s.release(); s.release();
            await Promise.all(tasks);
            expect(resolved).toBe(5);
        });

        test('FIFO order of waiters', async () => {
            const s = inst.create(1);
            await s.acquire();
            const order = [];
            const p1 = s.acquire().then(() => { order.push(1); s.release(); });
            const p2 = s.acquire().then(() => { order.push(2); s.release(); });
            const p3 = s.acquire().then(() => { order.push(3); s.release(); });
            s.release();
            await Promise.all([p1, p2, p3]);
            expect(order).toEqual([1, 2, 3]);
        });

        test('tryAcquire returns true when permits available', () => {
            const s = inst.create(2);
            expect(s.tryAcquire()).toBe(true);
            expect(s.permits).toBe(1);
        });

        test('tryAcquire returns false when permits exhausted', async () => {
            const s = inst.create(1);
            await s.acquire();
            expect(s.tryAcquire()).toBe(false);
        });

        test('runExclusive acquires then releases', async () => {
            const s = inst.create(2);
            const result = await s.runExclusive(async () => {
                expect(s.permits).toBe(1);
                return 'ok';
            });
            expect(result).toBe('ok');
            expect(s.permits).toBe(2);
        });

        test('runExclusive releases even on throw', async () => {
            const s = inst.create(1);
            await expect(s.runExclusive(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
            expect(s.permits).toBe(1);
        });
    });
});
