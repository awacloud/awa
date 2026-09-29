// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { heap } from './heap.js';

describe('heap module', () => {
    test('should have correct module metadata', () => {
        expect(heap.name).toBe('heap');
        expect(heap.dependencies).toEqual([]);
        expect(typeof heap.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with create function', () => {
            const inst = heap.factory();
            expect(typeof inst.create).toBe('function');
        });

    });

    describe('create', () => {
        let inst;
        beforeEach(() => { inst = heap.factory(); });

        test('throws on non-function comparator', () => {
            expect(() => inst.create({ comparator: 'not-a-function' })).toThrow('heap: comparator must be a function');
        });

        test('returns object with expected API', () => {
            const h = inst.create();
            expect(typeof h.push).toBe('function');
            expect(typeof h.pop).toBe('function');
            expect(typeof h.peek).toBe('function');
            expect(typeof h.has).toBe('function');
            expect(typeof h.toArray).toBe('function');
            expect(typeof h.drain).toBe('function');
            expect(typeof h.clear).toBe('function');
            expect(typeof h.snapshot).toBe('function');
            expect(typeof h.size).toBe('number');
            expect(typeof h.isEmpty).toBe('boolean');
        });

        test('initial size is 0', () => {
            const h = inst.create();
            expect(h.size).toBe(0);
            expect(h.isEmpty).toBe(true);
        });

        test('push and pop returns min (default min-heap)', () => {
            const h = inst.create();
            h.push(5);
            h.push(3);
            h.push(8);
            h.push(1);
            h.push(4);
            expect(h.pop()).toBe(1);
            expect(h.pop()).toBe(3);
            expect(h.pop()).toBe(4);
            expect(h.pop()).toBe(5);
            expect(h.pop()).toBe(8);
        });

        test('peek does not mutate heap', () => {
            const h = inst.create();
            h.push(3);
            h.push(1);
            h.push(2);
            expect(h.peek()).toBe(1);
            expect(h.size).toBe(3);
            expect(h.peek()).toBe(1); // unchanged
        });

        test('pop on empty returns undefined', () => {
            const h = inst.create();
            expect(h.pop()).toBeUndefined();
        });

        test('peek on empty returns undefined', () => {
            const h = inst.create();
            expect(h.peek()).toBeUndefined();
        });

        test('custom comparator: objects by priority', () => {
            const h = inst.create({ comparator: (a, b) => a.priority - b.priority });
            h.push({ priority: 5, payload: 'low' });
            h.push({ priority: 1, payload: 'high' });
            h.push({ priority: 3, payload: 'medium' });
            expect(h.pop()).toEqual({ priority: 1, payload: 'high' });
            expect(h.pop()).toEqual({ priority: 3, payload: 'medium' });
            expect(h.pop()).toEqual({ priority: 5, payload: 'low' });
        });

        test('max-heap via inverted comparator', () => {
            const h = inst.create({ comparator: (a, b) => b - a });
            h.push(3);
            h.push(1);
            h.push(4);
            h.push(1);
            h.push(5);
            h.push(9);
            expect(h.pop()).toBe(9);
            expect(h.pop()).toBe(5);
            expect(h.pop()).toBe(4);
        });

        test('initial array heapified (Floyd O(n))', () => {
            const h = inst.create({ initial: [9, 4, 7, 2, 8, 1] });
            expect(h.size).toBe(6);
            expect(h.drain()).toEqual([1, 2, 4, 7, 8, 9]);
        });

        test('drain empties heap and returns sorted array', () => {
            const h = inst.create();
            h.push(10);
            h.push(2);
            h.push(7);
            const drained = h.drain();
            expect(drained).toEqual([2, 7, 10]);
            expect(h.size).toBe(0);
            expect(h.isEmpty).toBe(true);
        });

        test('clear resets heap', () => {
            const h = inst.create();
            h.push(1);
            h.push(2);
            h.clear();
            expect(h.size).toBe(0);
            expect(h.peek()).toBeUndefined();
        });

        test('toArray returns copy in internal order (not sorted)', () => {
            const h = inst.create({ initial: [3, 1, 2] });
            const arr = h.toArray();
            expect(arr.length).toBe(3);
            expect(arr).toContain(1);
            expect(arr).toContain(2);
            expect(arr).toContain(3);
            expect(arr[0]).toBe(1); // root is min
        });

        test('has returns true for existing value', () => {
            const h = inst.create();
            h.push(42);
            expect(h.has(42)).toBe(true);
            expect(h.has(99)).toBe(false);
        });

        test('has with custom equals function', () => {
            const h = inst.create();
            h.push({ id: 1, val: 'a' });
            expect(h.has({ id: 1 }, (a, b) => a.id === b.id)).toBe(true);
            expect(h.has({ id: 2 }, (a, b) => a.id === b.id)).toBe(false);
        });

        test('1000 random pushes drain in sorted order', () => {
            const h = inst.create();
            const values = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 10000));
            for (const v of values) h.push(v);
            const drained = h.drain();
            expect(drained.length).toBe(1000);
            for (let i = 1; i < drained.length; i++) {
                expect(drained[i]).toBeGreaterThanOrEqual(drained[i - 1]);
            }
        });

        test('size tracks correctly through push/pop', () => {
            const h = inst.create();
            expect(h.size).toBe(0);
            h.push(1); expect(h.size).toBe(1);
            h.push(2); expect(h.size).toBe(2);
            h.pop();   expect(h.size).toBe(1);
            h.pop();   expect(h.size).toBe(0);
            h.pop();   expect(h.size).toBe(0); // no underflow
        });
    });

    describe('snapshot', () => {
        let inst;
        beforeEach(() => { inst = heap.factory(); });

        test('snapshot on empty heap returns { data: [] }', () => {
            const h = inst.create();
            expect(h.snapshot()).toEqual({ data: [] });
        });

        test('snapshot after 5 pushes has data.length === 5', () => {
            const h = inst.create();
            h.push(5); h.push(3); h.push(8); h.push(1); h.push(4);
            const snap = h.snapshot();
            expect(snap.data.length).toBe(5);
            // data[0] should be the root (min)
            expect(snap.data[0]).toBe(1);
        });

        test('snapshot does not share reference with internal data', () => {
            const h = inst.create();
            h.push(1); h.push(2);
            const snap = h.snapshot();
            snap.data.push(99);
            expect(h.size).toBe(2);
        });
    });

    describe('round-trip', () => {
        let inst;
        const cmp = (a, b) => a - b;
        beforeEach(() => { inst = heap.factory(); });

        test('round-trip without storage: drain produces same sorted sequence', () => {
            const h1 = inst.create({ comparator: cmp });
            h1.push(5); h1.push(3); h1.push(8); h1.push(1); h1.push(4);
            const snap = h1.snapshot();
            const h2 = inst.create({ comparator: cmp, snapshot: snap });
            expect(h2.drain()).toEqual(h1.drain());
        });

        test('round-trip with external Array storage', () => {
            const h1 = inst.create({ comparator: cmp });
            h1.push(5); h1.push(3); h1.push(8); h1.push(1); h1.push(4);
            const snap = h1.snapshot();
            const storage = new Array(20);
            const h2 = inst.create({ comparator: cmp, storage, maxSize: 20, snapshot: snap });
            expect(h2.size).toBe(5);
            expect(h2.drain()).toEqual([1, 3, 4, 5, 8]);
        });

        test('round-trip with TypedArray (Float64Array)', () => {
            const h1 = inst.create({ comparator: cmp });
            h1.push(3.14); h1.push(1.41); h1.push(2.71); h1.push(0.57);
            const snap = h1.snapshot();
            const storage = new Float64Array(20);
            const h2 = inst.create({ comparator: cmp, storage, maxSize: 20, snapshot: snap });
            expect(h2.size).toBe(4);
            const drained = h2.drain();
            expect(drained[0]).toBeCloseTo(0.57);
            expect(drained[1]).toBeCloseTo(1.41);
            expect(drained[2]).toBeCloseTo(2.71);
            expect(drained[3]).toBeCloseTo(3.14);
        });

        test('push after restoration maintains heap property', () => {
            const h1 = inst.create({ comparator: cmp });
            h1.push(5); h1.push(3); h1.push(8);
            const snap = h1.snapshot();
            const h2 = inst.create({ comparator: cmp, snapshot: snap });
            h2.push(1);
            h2.push(10);
            expect(h2.drain()).toEqual([1, 3, 5, 8, 10]);
        });

        test('pop, peek, has, toArray, clear work with external storage', () => {
            const storage = new Array(10);
            const h = inst.create({ comparator: cmp, storage, maxSize: 10 });
            h.push(3); h.push(1); h.push(2);
            expect(h.peek()).toBe(1);
            expect(h.has(2)).toBe(true);
            expect(h.toArray().sort((a, b) => a - b)).toEqual([1, 2, 3]);
            expect(h.pop()).toBe(1);
            h.clear();
            expect(h.size).toBe(0);
            expect(h.peek()).toBeUndefined();
        });

        test('pop, peek, has, toArray, clear work with TypedArray backing', () => {
            const storage = new Int32Array(10);
            const h = inst.create({ comparator: cmp, storage, maxSize: 10 });
            h.push(3); h.push(1); h.push(2);
            expect(h.peek()).toBe(1);
            expect(h.has(2)).toBe(true);
            expect(h.pop()).toBe(1);
            h.clear();
            expect(h.size).toBe(0);
            expect(h.peek()).toBeUndefined();
        });
    });

    describe('maxSize bound', () => {
        let inst;
        beforeEach(() => { inst = heap.factory(); });

        test('push beyond maxSize throws', () => {
            const h = inst.create({ maxSize: 3 });
            h.push(1); h.push(2); h.push(3);
            expect(() => h.push(4)).toThrow('heap: maxSize exceeded');
        });

        test('maxSize with storage: push beyond throws', () => {
            const h = inst.create({ storage: new Array(5), maxSize: 3 });
            h.push(1); h.push(2); h.push(3);
            expect(() => h.push(4)).toThrow('heap: maxSize exceeded');
        });
    });

    describe('throws - invalid inputs', () => {
        let inst;
        beforeEach(() => { inst = heap.factory(); });

        test('storage without maxSize throws', () => {
            expect(() => inst.create({ storage: new Array(10) }))
                .toThrow('heap: maxSize required when storage provided');
        });

        test('storage.length < maxSize throws', () => {
            expect(() => inst.create({ storage: new Array(5), maxSize: 10 }))
                .toThrow('heap: storage length must be >= maxSize');
        });

        test('storage is not Array or TypedArray throws', () => {
            expect(() => inst.create({ storage: {}, maxSize: 5 }))
                .toThrow('heap: storage must be Array or TypedArray');
        });

        test('storage is a plain object throws', () => {
            expect(() => inst.create({ storage: { length: 10 }, maxSize: 5 }))
                .toThrow('heap: storage must be Array or TypedArray');
        });

        test('initial and snapshot mutually exclusive throws', () => {
            expect(() => inst.create({ initial: [1, 2], snapshot: { data: [1, 2] } }))
                .toThrow('heap: initial and snapshot are mutually exclusive');
        });

        test('snapshot.data.length > maxSize throws', () => {
            expect(() => inst.create({ snapshot: { data: [1, 2, 3, 4, 5] }, maxSize: 3 }))
                .toThrow('heap: snapshot exceeds maxSize');
        });

        test('snapshot exceeds maxSize with storage throws', () => {
            expect(() => inst.create({ snapshot: { data: [1, 2, 3, 4, 5] }, storage: new Array(10), maxSize: 3 }))
                .toThrow('heap: snapshot exceeds maxSize');
        });
    });
});
