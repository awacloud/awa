// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { btree } from './btree.js';

describe('btree module', () => {
    test('should have correct module metadata', () => {
        expect(btree.name).toBe('btree');
        expect(btree.dependencies).toEqual([]);
        expect(typeof btree.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with create function', () => {
            const inst = btree.factory();
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create', () => {
        let inst;
        beforeEach(() => { inst = btree.factory(); });

        test('throws on order < 3', () => {
            expect(() => inst.create({ order: 2 })).toThrow('btree: order must be an integer >= 3');
            expect(() => inst.create({ order: 0 })).toThrow();
        });

        test('throws on non-integer order', () => {
            expect(() => inst.create({ order: 3.5 })).toThrow();
        });

        test('throws on non-function comparator', () => {
            expect(() => inst.create({ comparator: 'not-a-fn' })).toThrow('btree: comparator must be a function');
        });

        test('returns object with expected API', () => {
            const b = inst.create();
            expect(typeof b.insert).toBe('function');
            expect(typeof b.get).toBe('function');
            expect(typeof b.has).toBe('function');
            expect(typeof b.delete).toBe('function');
            expect(typeof b.range).toBe('function');
            expect(typeof b.keys).toBe('function');
            expect(typeof b.values).toBe('function');
            expect(typeof b.entries).toBe('function');
            expect(typeof b.size).toBe('number');
            expect(typeof b.clear).toBe('function');
            expect(typeof b.min).toBe('function');
            expect(typeof b.max).toBe('function');
            expect(typeof b.snapshot).toBe('function');
        });

        test('initial size is 0', () => {
            const b = inst.create();
            expect(b.size).toBe(0);
        });

        test('insert and get', () => {
            const b = inst.create();
            b.insert('a', 1);
            b.insert('b', 2);
            b.insert('c', 3);
            expect(b.get('a')).toBe(1);
            expect(b.get('b')).toBe(2);
            expect(b.get('c')).toBe(3);
            expect(b.get('z')).toBeUndefined();
        });

        test('has returns correct boolean', () => {
            const b = inst.create();
            b.insert('x', 10);
            expect(b.has('x')).toBe(true);
            expect(b.has('y')).toBe(false);
        });

        test('insert updates existing key', () => {
            const b = inst.create();
            b.insert('key', 1);
            b.insert('key', 2);
            expect(b.get('key')).toBe(2);
            expect(b.size).toBe(1);
        });

        test('size increments correctly', () => {
            const b = inst.create();
            expect(b.size).toBe(0);
            b.insert('a', 1);
            expect(b.size).toBe(1);
            b.insert('b', 2);
            expect(b.size).toBe(2);
            b.insert('a', 99); // update, not new
            expect(b.size).toBe(2);
        });

        test('delete returns true for existing key', () => {
            const b = inst.create();
            b.insert('k', 1);
            expect(b.delete('k')).toBe(true);
            expect(b.has('k')).toBe(false);
            expect(b.size).toBe(0);
        });

        test('delete returns false for missing key', () => {
            const b = inst.create();
            expect(b.delete('missing')).toBe(false);
        });

        test('delete and re-insert: size consistent', () => {
            const b = inst.create();
            b.insert('a', 1);
            b.insert('b', 2);
            b.delete('a');
            expect(b.size).toBe(1);
            b.insert('a', 3);
            expect(b.size).toBe(2);
            expect(b.get('a')).toBe(3);
        });

        test('1000 random inserts: keys() returns sorted', () => {
            const b = inst.create();
            const values = new Set();
            for (let i = 0; i < 1000; i++) {
                const v = Math.floor(Math.random() * 5000);
                values.add(v);
                b.insert(v, v * 2);
            }
            const sorted = [...b.keys()];
            for (let i = 1; i < sorted.length; i++) {
                expect(sorted[i]).toBeGreaterThan(sorted[i - 1]);
            }
            expect(sorted.length).toBe(values.size);
        });

        test('range(10, 20) returns correct entries', () => {
            const b = inst.create();
            for (let i = 0; i <= 30; i++) b.insert(i, i * 10);
            const results = [...b.range(10, 20)];
            expect(results.length).toBe(10); // 10..19 (inclusive low, exclusive high)
            expect(results[0]).toEqual([10, 100]);
            expect(results[9]).toEqual([19, 190]);
        });

        test('range with includeHigh=true', () => {
            const b = inst.create();
            for (let i = 1; i <= 5; i++) b.insert(i, i);
            const results = [...b.range(2, 4, { includeHigh: true })];
            expect(results.map(([k]) => k)).toEqual([2, 3, 4]);
        });

        test('range with includeLow=false', () => {
            const b = inst.create();
            for (let i = 1; i <= 5; i++) b.insert(i, i);
            const results = [...b.range(2, 5, { includeLow: false })];
            expect(results.map(([k]) => k)).toEqual([3, 4]);
        });

        test('min and max return correct entries', () => {
            const b = inst.create();
            b.insert(5, 'five');
            b.insert(1, 'one');
            b.insert(9, 'nine');
            b.insert(3, 'three');
            expect(b.min()).toEqual({ key: 1, value: 'one' });
            expect(b.max()).toEqual({ key: 9, value: 'nine' });
        });

        test('min/max on empty tree return null', () => {
            const b = inst.create();
            expect(b.min()).toBeNull();
            expect(b.max()).toBeNull();
        });

        test('keys(), values(), entries() iterate in order', () => {
            const b = inst.create();
            [3, 1, 4, 1, 5, 9, 2, 6].forEach(n => b.insert(n, n));
            expect([...b.keys()]).toEqual([1, 2, 3, 4, 5, 6, 9]);
            expect([...b.values()]).toEqual([1, 2, 3, 4, 5, 6, 9]);
            expect([...b.entries()]).toEqual([[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[9,9]]);
        });

        test('custom comparator: objects by field', () => {
            const b = inst.create({
                comparator: (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0
            });
            b.insert({ id: 3 }, 'three');
            b.insert({ id: 1 }, 'one');
            b.insert({ id: 2 }, 'two');
            const keys = [...b.keys()];
            expect(keys.map(k => k.id)).toEqual([1, 2, 3]);
        });

        test('clear resets tree', () => {
            const b = inst.create();
            b.insert('a', 1);
            b.insert('b', 2);
            b.clear();
            expect(b.size).toBe(0);
            expect(b.has('a')).toBe(false);
            expect(b.min()).toBeNull();
        });

        test('tree stays balanced with sequential inserts and deletes', () => {
            const b = inst.create({ order: 3 });
            for (let i = 0; i < 100; i++) b.insert(i, i);
            for (let i = 0; i < 50; i++) b.delete(i);
            expect(b.size).toBe(50);
            const keys = [...b.keys()];
            expect(keys.length).toBe(50);
            expect(keys[0]).toBe(50);
            expect(keys[49]).toBe(99);
        });
    });

    describe('snapshot', () => {
        let bt;
        beforeEach(() => { bt = btree.factory(); });

        test('snapshot on empty tree returns { order, entries: [] }', () => {
            const b = bt.create({ order: 5 });
            const snap = b.snapshot();
            expect(snap).toEqual({ order: 5, entries: [] });
        });

        test('snapshot after inserts returns sorted entries and correct length', () => {
            const b = bt.create();
            [5, 2, 8, 1, 3].forEach(n => b.insert(n, n * 10));
            const snap = b.snapshot();
            expect(snap.order).toBe(5);
            expect(snap.entries.length).toBe(b.size);
            expect(snap.entries).toEqual([[1,10],[2,20],[3,30],[5,50],[8,80]]);
        });

        test('snapshot entries are in ascending sorted order', () => {
            const b = bt.create({ order: 3 });
            for (let i = 20; i >= 0; i--) b.insert(i, i);
            const snap = b.snapshot();
            for (let i = 1; i < snap.entries.length; i++) {
                expect(snap.entries[i][0]).toBeGreaterThan(snap.entries[i-1][0]);
            }
        });
    });

    describe('round-trip', () => {
        let bt;
        beforeEach(() => { bt = btree.factory(); });

        test('basic round-trip: b2.size === b1.size and entries match', () => {
            const b1 = bt.create({ order: 5 });
            [10, 3, 7, 1, 9, 5].forEach(n => b1.insert(n, n * 2));
            const b2 = bt.create({ order: 5, snapshot: b1.snapshot() });
            expect(b2.size).toBe(b1.size);
            expect([...b2.entries()]).toEqual([...b1.entries()]);
        });

        test('round-trip with custom comparator (descending)', () => {
            const descCmp = (a, b) => (a > b ? -1 : a < b ? 1 : 0);
            const b1 = bt.create({ order: 5, comparator: descCmp });
            [3, 1, 4, 1, 5, 9, 2].forEach(n => b1.insert(n, n));
            const b2 = bt.create({ order: 5, comparator: descCmp, snapshot: b1.snapshot() });
            expect(b2.size).toBe(b1.size);
            expect([...b2.entries()]).toEqual([...b1.entries()]);
        });

        test('throw on snapshot.order mismatch', () => {
            const b1 = bt.create({ order: 5 });
            b1.insert(1, 'a');
            const snap = b1.snapshot(); // snap.order === 5
            expect(() => bt.create({ order: 3, snapshot: snap })).toThrow('btree: snapshot.order mismatch');
        });

        test('restored tree supports insert/delete/range/get/has', () => {
            const b1 = bt.create({ order: 5 });
            for (let i = 1; i <= 20; i++) b1.insert(i, i * 100);
            const b2 = bt.create({ order: 5, snapshot: b1.snapshot() });

            // Additional operations
            b2.insert(21, 2100);
            expect(b2.size).toBe(21);
            expect(b2.get(21)).toBe(2100);
            expect(b2.has(5)).toBe(true);
            b2.delete(5);
            expect(b2.has(5)).toBe(false);
            expect(b2.size).toBe(20);

            const rangeResult = [...b2.range(10, 15)];
            expect(rangeResult.map(([k]) => k)).toEqual([10, 11, 12, 13, 14]);

            // Verify in-order traversal invariants
            const keys = [...b2.keys()];
            for (let i = 1; i < keys.length; i++) {
                expect(keys[i]).toBeGreaterThan(keys[i-1]);
            }
        });

        test('round-trip with empty tree', () => {
            const b1 = bt.create({ order: 5 });
            const b2 = bt.create({ order: 5, snapshot: b1.snapshot() });
            expect(b2.size).toBe(0);
            expect([...b2.entries()]).toEqual([]);
        });
    });
});
