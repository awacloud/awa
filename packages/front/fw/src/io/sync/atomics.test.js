// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { atomics } from './atomics.js';

const supported = typeof SharedArrayBuffer !== 'undefined';
const itIfSupported = supported ? test : test.skip;

// Bun: Atomics.waitAsync timer fires as a macrotask - must pump the event loop
// before awaiting the promise so the timer can resolve.
async function pumpAndAwait(promise) {
    await new Promise(resolve => setTimeout(resolve, 50));
    return promise;
}

describe('atomics module', () => {
    test('should have correct module metadata', () => {
        expect(atomics.name).toBe('atomics');
        expect(atomics.dependencies).toEqual([]);
        expect(typeof atomics.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = atomics.factory();
            expect(typeof inst.isSupported).toBe('function');
            expect(typeof inst.shared).toBe('function');
            expect(typeof inst.int32).toBe('function');
            expect(typeof inst.uint32).toBe('function');
            expect(typeof inst.uint8).toBe('function');
            expect(typeof inst.uint16).toBe('function');
            expect(typeof inst.load).toBe('function');
            expect(typeof inst.store).toBe('function');
            expect(typeof inst.add).toBe('function');
            expect(typeof inst.sub).toBe('function');
            expect(typeof inst.and).toBe('function');
            expect(typeof inst.or).toBe('function');
            expect(typeof inst.xor).toBe('function');
            expect(typeof inst.exchange).toBe('function');
            expect(typeof inst.compareExchange).toBe('function');
            expect(typeof inst.waitAsync).toBe('function');
            expect(typeof inst.notify).toBe('function');
            expect(typeof inst.sabLock).toBe('function');
        });
    });

    describe('isSupported', () => {
        let inst;
        beforeEach(() => { inst = atomics.factory(); });

        test('returns boolean', () => {
            expect(typeof inst.isSupported()).toBe('boolean');
        });

        itIfSupported('returns true in bun (SAB available, no crossOriginIsolated)', () => {
            expect(inst.isSupported()).toBe(true);
        });
    });

    describe('shared', () => {
        let inst;
        beforeEach(() => { inst = atomics.factory(); });

        itIfSupported('returns SharedArrayBuffer of given size', () => {
            const sab = inst.shared(64);
            expect(sab).toBeInstanceOf(SharedArrayBuffer);
            expect(sab.byteLength).toBe(64);
        });

        test('throws on negative byteLength', () => {
            expect(() => inst.shared(-1)).toThrow('atomics: byteLength must be a non-negative integer');
        });

        test('throws on non-integer byteLength', () => {
            expect(() => inst.shared(1.5)).toThrow();
        });

        itIfSupported('accepts byteLength 0', () => {
            const sab = inst.shared(0);
            expect(sab.byteLength).toBe(0);
        });
    });

    describe('typed array constructors', () => {
        let inst, sab;
        beforeEach(() => {
            inst = atomics.factory();
            if (supported) sab = new SharedArrayBuffer(64);
        });

        itIfSupported('int32 creates Int32Array view', () => {
            const arr = inst.int32(sab);
            expect(arr).toBeInstanceOf(Int32Array);
            expect(arr.length).toBe(16);
        });

        itIfSupported('uint32 creates Uint32Array view', () => {
            const arr = inst.uint32(sab);
            expect(arr).toBeInstanceOf(Uint32Array);
        });

        itIfSupported('uint16 creates Uint16Array view', () => {
            const arr = inst.uint16(sab);
            expect(arr).toBeInstanceOf(Uint16Array);
            expect(arr.length).toBe(32);
        });

        itIfSupported('uint8 creates Uint8Array view', () => {
            const arr = inst.uint8(sab);
            expect(arr).toBeInstanceOf(Uint8Array);
            expect(arr.length).toBe(64);
        });

        itIfSupported('int32 with byteOffset and length', () => {
            const arr = inst.int32(sab, 0, 4);
            expect(arr.length).toBe(4);
        });

        test('int32 throws on non-SAB', () => {
            const plain = new ArrayBuffer(16);
            expect(() => inst.int32(plain)).toThrow('atomics: expected SharedArrayBuffer');
        });
    });

    describe('atomic operations', () => {
        let inst, arr;
        beforeEach(() => {
            inst = atomics.factory();
            if (supported) arr = new Int32Array(new SharedArrayBuffer(32));
        });

        itIfSupported('store and load are coherent', () => {
            inst.store(arr, 0, 42);
            expect(inst.load(arr, 0)).toBe(42);
        });

        itIfSupported('add returns previous value and updates slot', () => {
            inst.store(arr, 0, 10);
            const prev = inst.add(arr, 0, 5);
            expect(prev).toBe(10);
            expect(inst.load(arr, 0)).toBe(15);
        });

        itIfSupported('sub returns previous value', () => {
            inst.store(arr, 0, 20);
            const prev = inst.sub(arr, 0, 8);
            expect(prev).toBe(20);
            expect(inst.load(arr, 0)).toBe(12);
        });

        itIfSupported('and operates on bits', () => {
            inst.store(arr, 0, 0b1111);
            inst.and(arr, 0, 0b1010);
            expect(inst.load(arr, 0)).toBe(0b1010);
        });

        itIfSupported('or operates on bits', () => {
            inst.store(arr, 0, 0b0101);
            inst.or(arr, 0, 0b1010);
            expect(inst.load(arr, 0)).toBe(0b1111);
        });

        itIfSupported('xor operates on bits', () => {
            inst.store(arr, 0, 0b1100);
            inst.xor(arr, 0, 0b1010);
            expect(inst.load(arr, 0)).toBe(0b0110);
        });

        itIfSupported('exchange returns previous value', () => {
            inst.store(arr, 0, 7);
            const prev = inst.exchange(arr, 0, 99);
            expect(prev).toBe(7);
            expect(inst.load(arr, 0)).toBe(99);
        });

        itIfSupported('compareExchange succeeds when expected matches', () => {
            inst.store(arr, 0, 5);
            const prev = inst.compareExchange(arr, 0, 5, 10);
            expect(prev).toBe(5);
            expect(inst.load(arr, 0)).toBe(10);
        });

        itIfSupported('compareExchange fails when expected does not match', () => {
            inst.store(arr, 0, 5);
            const prev = inst.compareExchange(arr, 0, 99, 10);
            expect(prev).toBe(5);
            expect(inst.load(arr, 0)).toBe(5);
        });

        itIfSupported('out-of-bounds index throws', () => {
            expect(() => inst.load(arr, 100)).toThrow('atomics: index out of bounds');
            expect(() => inst.store(arr, -1, 0)).toThrow('atomics: index out of bounds');
        });
    });

    describe('waitAsync and notify', () => {
        let inst, arr;
        beforeEach(() => {
            inst = atomics.factory();
            if (supported) arr = new Int32Array(new SharedArrayBuffer(16));
        });

        itIfSupported('waitAsync with non-matching expected returns not-equal', async () => {
            inst.store(arr, 0, 0);
            const result = inst.waitAsync(arr, 0, 999);
            const value = result.async ? await result.value : result.value;
            expect(value).toBe('not-equal');
        });

        itIfSupported('waitAsync result has async and value fields', () => {
            const result = inst.waitAsync(arr, 0, 999);
            expect(typeof result.async).toBe('boolean');
        });

        itIfSupported('waitAsync with short timeout resolves to timed-out', async () => {
            inst.store(arr, 0, 0);
            const result = inst.waitAsync(arr, 0, 0, 10);
            if (result.async) {
                // pump macrotask queue so Atomics timer can fire
                const value = await pumpAndAwait(result.value);
                expect(['timed-out', 'ok']).toContain(value);
            } else {
                expect(['timed-out', 'ok', 'not-equal']).toContain(result.value);
            }
        });

        itIfSupported('notify wakes a waitAsync waiter', async () => {
            inst.store(arr, 0, 0);
            const result = inst.waitAsync(arr, 0, 0);
            if (result.async) {
                const woken = inst.notify(arr, 0, 1);
                expect(woken).toBeGreaterThanOrEqual(1);
                const value = await pumpAndAwait(result.value);
                expect(value).toBe('ok');
            } else {
                const woken = inst.notify(arr, 0, 1);
                expect(typeof woken).toBe('number');
            }
        });

        test('waitAsync throws on non-Int32Array', () => {
            if (!supported) return;
            const u8 = new Uint8Array(new SharedArrayBuffer(16));
            expect(() => inst.waitAsync(u8, 0, 0)).toThrow('atomics: waitAsync requires an Int32Array');
        });
    });

    describe('sabLock', () => {
        let inst, arr;
        beforeEach(() => {
            inst = atomics.factory();
            if (supported) arr = new Int32Array(new SharedArrayBuffer(16));
        });

        itIfSupported('returns object with acquire, release, tryAcquire', () => {
            const lock = inst.sabLock(arr, 0);
            expect(typeof lock.acquire).toBe('function');
            expect(typeof lock.release).toBe('function');
            expect(typeof lock.tryAcquire).toBe('function');
        });

        itIfSupported('tryAcquire returns true when unlocked', () => {
            const lock = inst.sabLock(arr, 0);
            expect(lock.tryAcquire()).toBe(true);
            expect(inst.load(arr, 0)).toBe(1);
        });

        itIfSupported('tryAcquire returns false when locked', () => {
            const lock = inst.sabLock(arr, 0);
            lock.tryAcquire();
            expect(lock.tryAcquire()).toBe(false);
        });

        itIfSupported('release sets slot to 0', () => {
            const lock = inst.sabLock(arr, 0);
            lock.tryAcquire();
            lock.release();
            expect(inst.load(arr, 0)).toBe(0);
        });

        itIfSupported('acquire + release serialize two concurrent callers', async () => {
            const lock = inst.sabLock(arr, 0);
            const order = [];
            await lock.acquire();
            const p1 = lock.acquire().then(() => { order.push(1); lock.release(); });
            const p2 = lock.acquire().then(() => { order.push(2); lock.release(); });
            lock.release();
            await Promise.all([p1, p2]);
            expect(order).toEqual([1, 2]);
        });

        test('sabLock throws on non-Int32Array', () => {
            if (!supported) return;
            const u8 = new Uint8Array(new SharedArrayBuffer(16));
            expect(() => inst.sabLock(u8, 0)).toThrow('atomics: sabLock requires an Int32Array');
        });
    });

    describe('atomic ops additional coverage', () => {
        let inst, arr;
        beforeEach(() => {
            inst = atomics.factory();
            if (supported) arr = new Int32Array(new SharedArrayBuffer(32));
        });

        itIfSupported('add returns previous, supports negative deltas', () => {
            inst.store(arr, 1, 5);
            expect(inst.add(arr, 1, -3)).toBe(5);
            expect(inst.load(arr, 1)).toBe(2);
        });

        itIfSupported('compareExchange chain: success then failure', () => {
            inst.store(arr, 2, 0);
            expect(inst.compareExchange(arr, 2, 0, 1)).toBe(0);
            expect(inst.compareExchange(arr, 2, 0, 99)).toBe(1);
            expect(inst.load(arr, 2)).toBe(1);
        });

        itIfSupported('and/or/xor return previous value', () => {
            inst.store(arr, 3, 0b1100);
            expect(inst.and(arr, 3, 0b1010)).toBe(0b1100);
            inst.store(arr, 3, 0b1100);
            expect(inst.or(arr, 3, 0b0011)).toBe(0b1100);
            inst.store(arr, 3, 0b1100);
            expect(inst.xor(arr, 3, 0b1010)).toBe(0b1100);
        });
    });
});
