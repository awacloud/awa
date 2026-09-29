// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { ringBuffer } from './ringBuffer.js';

describe('ringBuffer module', () => {
    test('should have correct module metadata', () => {
        expect(ringBuffer.name).toBe('ringBuffer');
        expect(ringBuffer.dependencies).toEqual([]);
        expect(typeof ringBuffer.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with create function', () => {
            const inst = ringBuffer.factory();
            expect(typeof inst.create).toBe('function');
        });

    });

    describe('create', () => {
        let inst;
        beforeEach(() => { inst = ringBuffer.factory(); });

        test('throws on capacity < 1', () => {
            expect(() => inst.create({ capacity: 0 })).toThrow('ringBuffer: capacity must be an integer >= 1');
            expect(() => inst.create({ capacity: -1 })).toThrow();
        });

        test('throws on non-integer capacity', () => {
            expect(() => inst.create({ capacity: 2.5 })).toThrow();
        });

        test('returns object with expected API', () => {
            const rb = inst.create({ capacity: 5 });
            expect(typeof rb.push).toBe('function');
            expect(typeof rb.shift).toBe('function');
            expect(typeof rb.pop).toBe('function');
            expect(typeof rb.peek).toBe('function');
            expect(typeof rb.peekLast).toBe('function');
            expect(typeof rb.peekAt).toBe('function');
            expect(typeof rb.toArray).toBe('function');
            expect(typeof rb.clear).toBe('function');
            expect(typeof rb.snapshot).toBe('function');
            expect(typeof rb.size).toBe('number');
            expect(typeof rb.capacity).toBe('number');
            expect(typeof rb.isFull).toBe('boolean');
            expect(typeof rb.isEmpty).toBe('boolean');
        });

        test('initial state', () => {
            const rb = inst.create({ capacity: 5 });
            expect(rb.size).toBe(0);
            expect(rb.capacity).toBe(5);
            expect(rb.isEmpty).toBe(true);
            expect(rb.isFull).toBe(false);
        });

        test('push 3 on capacity 5: size=3, toArray=[1,2,3]', () => {
            const rb = inst.create({ capacity: 5 });
            rb.push(1);
            rb.push(2);
            rb.push(3);
            expect(rb.size).toBe(3);
            expect(rb.toArray()).toEqual([1, 2, 3]);
        });

        test('push 7 on capacity 5: overwrites oldest, toArray=[3,4,5,6,7]', () => {
            const rb = inst.create({ capacity: 5 });
            for (let i = 1; i <= 7; i++) rb.push(i);
            expect(rb.size).toBe(5);
            expect(rb.isFull).toBe(true);
            expect(rb.toArray()).toEqual([3, 4, 5, 6, 7]);
        });

        test('shift returns oldest, decrements size', () => {
            const rb = inst.create({ capacity: 5 });
            rb.push(10);
            rb.push(20);
            rb.push(30);
            expect(rb.shift()).toBe(10);
            expect(rb.size).toBe(2);
            expect(rb.shift()).toBe(20);
            expect(rb.shift()).toBe(30);
            expect(rb.shift()).toBeUndefined();
        });

        test('pop returns newest, decrements size', () => {
            const rb = inst.create({ capacity: 5 });
            rb.push(10);
            rb.push(20);
            rb.push(30);
            expect(rb.pop()).toBe(30);
            expect(rb.size).toBe(2);
            expect(rb.pop()).toBe(20);
            expect(rb.pop()).toBe(10);
            expect(rb.pop()).toBeUndefined();
        });

        test('peek returns oldest without removal', () => {
            const rb = inst.create({ capacity: 5 });
            rb.push(1);
            rb.push(2);
            expect(rb.peek()).toBe(1);
            expect(rb.size).toBe(2);
        });

        test('peek on empty returns undefined', () => {
            const rb = inst.create({ capacity: 3 });
            expect(rb.peek()).toBeUndefined();
        });

        test('peekLast returns newest without removal', () => {
            const rb = inst.create({ capacity: 5 });
            rb.push(1);
            rb.push(2);
            rb.push(3);
            expect(rb.peekLast()).toBe(3);
            expect(rb.size).toBe(3);
        });

        test('peekAt(i): 0=oldest, size-1=newest', () => {
            const rb = inst.create({ capacity: 5 });
            rb.push(10);
            rb.push(20);
            rb.push(30);
            expect(rb.peekAt(0)).toBe(10);
            expect(rb.peekAt(1)).toBe(20);
            expect(rb.peekAt(2)).toBe(30);
            expect(rb.peekAt(3)).toBeUndefined();
            expect(rb.peekAt(-1)).toBeUndefined();
        });

        test('clear resets buffer', () => {
            const rb = inst.create({ capacity: 3 });
            rb.push(1);
            rb.push(2);
            rb.clear();
            expect(rb.size).toBe(0);
            expect(rb.isEmpty).toBe(true);
            expect(rb.peek()).toBeUndefined();
        });

        test('cycle: fill, empty via shift, re-fill - no index leak', () => {
            const rb = inst.create({ capacity: 3 });
            rb.push(1); rb.push(2); rb.push(3);
            rb.shift(); rb.shift(); rb.shift();
            expect(rb.size).toBe(0);
            rb.push(4); rb.push(5); rb.push(6);
            expect(rb.toArray()).toEqual([4, 5, 6]);
            expect(rb.size).toBe(3);
        });

        test('overwrite preserves chronological order in toArray', () => {
            const rb = inst.create({ capacity: 3 });
            rb.push('a');
            rb.push('b');
            rb.push('c');
            rb.push('d'); // overwrites 'a'
            rb.push('e'); // overwrites 'b'
            expect(rb.toArray()).toEqual(['c', 'd', 'e']);
        });

        test('isFull reflects capacity', () => {
            const rb = inst.create({ capacity: 2 });
            expect(rb.isFull).toBe(false);
            rb.push(1);
            expect(rb.isFull).toBe(false);
            rb.push(2);
            expect(rb.isFull).toBe(true);
            rb.shift();
            expect(rb.isFull).toBe(false);
        });

        test('capacity=1 works correctly', () => {
            const rb = inst.create({ capacity: 1 });
            rb.push('first');
            expect(rb.size).toBe(1);
            expect(rb.isFull).toBe(true);
            rb.push('second'); // overwrites
            expect(rb.size).toBe(1);
            expect(rb.peek()).toBe('second');
            expect(rb.toArray()).toEqual(['second']);
        });
    });

    describe('snapshot', () => {
        let inst;
        beforeEach(() => { inst = ringBuffer.factory(); });

        test('snapshot on empty ring returns { capacity, size: 0, data: [] }', () => {
            const rb = inst.create({ capacity: 5 });
            const snap = rb.snapshot();
            expect(snap).toEqual({ capacity: 5, size: 0, data: [] });
        });

        test('snapshot on partial ring: data.length === size, logical order', () => {
            const rb = inst.create({ capacity: 5 });
            rb.push(10);
            rb.push(20);
            rb.push(30);
            const snap = rb.snapshot();
            expect(snap.size).toBe(3);
            expect(snap.capacity).toBe(5);
            expect(snap.data).toEqual([10, 20, 30]);
        });

        test('snapshot on full ring after wraparound: logical order, not internal order', () => {
            const rb = inst.create({ capacity: 3 });
            rb.push('a');
            rb.push('b');
            rb.push('c');
            rb.push('d'); // overwrites 'a', head advances
            rb.push('e'); // overwrites 'b', head advances
            // Logical order: c, d, e
            const snap = rb.snapshot();
            expect(snap.size).toBe(3);
            expect(snap.data).toEqual(['c', 'd', 'e']);
        });
    });

    describe('round-trip', () => {
        let inst;
        beforeEach(() => { inst = ringBuffer.factory(); });

        test('round-trip: restore from snapshot produces identical state', () => {
            const r1 = inst.create({ capacity: 5 });
            r1.push(1); r1.push(2); r1.push(3);
            const snap = r1.snapshot();
            const r2 = inst.create({ capacity: 5, snapshot: snap });
            expect(r2.toArray()).toEqual(r1.toArray());
            expect(r2.size).toBe(r1.size);
            expect(r2.peek()).toBe(r1.peek());
            expect(r2.peekLast()).toBe(r1.peekLast());
        });

        test('round-trip after wraparound: logical order preserved', () => {
            const r1 = inst.create({ capacity: 3 });
            r1.push('a'); r1.push('b'); r1.push('c'); r1.push('d'); r1.push('e');
            const snap = r1.snapshot();
            const r2 = inst.create({ capacity: 3, snapshot: snap });
            expect(r2.toArray()).toEqual(r1.toArray());
            expect(r2.size).toBe(r1.size);
        });

        test('restored ring behaves correctly after additional pushes', () => {
            const r1 = inst.create({ capacity: 3 });
            r1.push(1); r1.push(2); r1.push(3);
            const r2 = inst.create({ capacity: 3, snapshot: r1.snapshot() });
            r2.push(4); // overwrites 1
            expect(r2.toArray()).toEqual([2, 3, 4]);
        });

        test('snapshot.capacity mismatch throws', () => {
            const r1 = inst.create({ capacity: 3 });
            r1.push(1);
            const snap = r1.snapshot();
            expect(() => inst.create({ capacity: 5, snapshot: snap })).toThrow('ringBuffer: snapshot.capacity mismatch');
        });
    });

    describe('create with storage', () => {
        let inst;
        beforeEach(() => { inst = ringBuffer.factory(); });

        test('create with Array storage: push/pop works, storage is mutated', () => {
            const storage = new Array(5);
            const rb = inst.create({ capacity: 5, storage });
            rb.push(10);
            rb.push(20);
            expect(rb.size).toBe(2);
            expect(rb.toArray()).toEqual([10, 20]);
            // storage should be mutated
            expect(storage[0]).toBe(10);
            expect(storage[1]).toBe(20);
        });

        test('create with Float64Array storage: push of numbers works, values identical', () => {
            const storage = new Float64Array(5);
            const rb = inst.create({ capacity: 5, storage });
            rb.push(1.5);
            rb.push(2.5);
            expect(rb.size).toBe(2);
            expect(rb.toArray()).toEqual([1.5, 2.5]);
            expect(storage[0]).toBe(1.5);
            expect(storage[1]).toBe(2.5);
        });

        test('storage too short throws', () => {
            const storage = new Array(3);
            expect(() => inst.create({ capacity: 5, storage })).toThrow('ringBuffer: storage length must be >= capacity');
        });

        test('storage as string throws', () => {
            expect(() => inst.create({ capacity: 3, storage: 'invalid' })).toThrow('ringBuffer: storage must be Array or TypedArray');
        });

        test('storage as plain object throws', () => {
            expect(() => inst.create({ capacity: 3, storage: { length: 5 } })).toThrow('ringBuffer: storage must be Array or TypedArray');
        });

        test('combo: storage + snapshot - snapshot data copied into storage', () => {
            const r1 = inst.create({ capacity: 3 });
            r1.push(7); r1.push(8); r1.push(9);
            const snap = r1.snapshot();

            const storage = new Array(3);
            const r2 = inst.create({ capacity: 3, storage, snapshot: snap });
            expect(r2.toArray()).toEqual([7, 8, 9]);
            // storage should have the snapshot data at positions 0..size-1
            expect(storage[0]).toBe(7);
            expect(storage[1]).toBe(8);
            expect(storage[2]).toBe(9);
        });

        test('combo: storage + snapshot - subsequent push overwrites as expected', () => {
            const r1 = inst.create({ capacity: 3 });
            r1.push(1); r1.push(2); r1.push(3);
            const snap = r1.snapshot();

            const storage = new Array(3);
            const r2 = inst.create({ capacity: 3, storage, snapshot: snap });
            r2.push(4); // full ring, overwrites oldest (1)
            expect(r2.toArray()).toEqual([2, 3, 4]);
        });
    });

    describe('clear with external storage', () => {
        let inst;
        beforeEach(() => { inst = ringBuffer.factory(); });

        test('clear with Array storage sets slots to undefined', () => {
            const storage = new Array(3);
            const rb = inst.create({ capacity: 3, storage });
            rb.push(1); rb.push(2);
            rb.clear();
            expect(rb.size).toBe(0);
            expect(rb.isEmpty).toBe(true);
            expect(storage[0]).toBeUndefined();
            expect(storage[1]).toBeUndefined();
        });

        test('clear with TypedArray storage sets slots to 0', () => {
            const storage = new Float64Array(3);
            const rb = inst.create({ capacity: 3, storage });
            rb.push(1.1); rb.push(2.2);
            rb.clear();
            expect(rb.size).toBe(0);
            expect(rb.isEmpty).toBe(true);
            expect(storage[0]).toBe(0);
            expect(storage[1]).toBe(0);
        });
    });
});
