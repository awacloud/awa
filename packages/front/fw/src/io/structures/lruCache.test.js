// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { lruCache } from './lruCache.js';

describe('lruCache module', () => {
    test('should have correct module metadata', () => {
        expect(lruCache.name).toBe('lruCache');
        expect(lruCache.dependencies).toEqual([]);
        expect(typeof lruCache.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with create function', () => {
            const inst = lruCache.factory();
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create', () => {
        let inst;
        beforeEach(() => { inst = lruCache.factory(); });

        test('throws on maxSize < 1', () => {
            expect(() => inst.create({ maxSize: 0 })).toThrow('lruCache: maxSize must be an integer >= 1');
            expect(() => inst.create({ maxSize: -1 })).toThrow();
        });

        test('throws on non-integer maxSize', () => {
            expect(() => inst.create({ maxSize: 1.5 })).toThrow();
        });

        test('returns object with expected API', () => {
            const cache = inst.create({ maxSize: 5 });
            expect(typeof cache.get).toBe('function');
            expect(typeof cache.set).toBe('function');
            expect(typeof cache.has).toBe('function');
            expect(typeof cache.peek).toBe('function');
            expect(typeof cache.delete).toBe('function');
            expect(typeof cache.clear).toBe('function');
            expect(typeof cache.keys).toBe('function');
            expect(typeof cache.values).toBe('function');
            expect(typeof cache.entries).toBe('function');
            expect(typeof cache.size).toBe('number');
            expect(typeof cache.maxSize).toBe('number');
        });

        test('initial size is 0', () => {
            const cache = inst.create({ maxSize: 3 });
            expect(cache.size).toBe(0);
            expect(cache.maxSize).toBe(3);
        });

        test('set and get basic', () => {
            const cache = inst.create({ maxSize: 5 });
            cache.set('a', 1);
            expect(cache.get('a')).toBe(1);
            expect(cache.size).toBe(1);
        });

        test('get returns undefined for missing key', () => {
            const cache = inst.create({ maxSize: 5 });
            expect(cache.get('missing')).toBeUndefined();
        });

        test('has returns correct boolean', () => {
            const cache = inst.create({ maxSize: 5 });
            cache.set('x', 1);
            expect(cache.has('x')).toBe(true);
            expect(cache.has('y')).toBe(false);
        });

        test('peek returns value without bumping', () => {
            const cache = inst.create({ maxSize: 3 });
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3); // LRU: a (oldest), b, c (newest)
            cache.peek('a'); // should NOT bump 'a'
            cache.set('d', 4); // should evict 'a' (still LRU)
            expect(cache.has('a')).toBe(false);
            expect(cache.has('d')).toBe(true);
        });

        test('get bumps to MRU', () => {
            const cache = inst.create({ maxSize: 3 });
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3); // LRU: a, b, c
            cache.get('a');    // bump 'a' to MRU: LRU order is b, c, a
            cache.set('d', 4); // should evict 'b' (new LRU)
            expect(cache.has('b')).toBe(false);
            expect(cache.has('a')).toBe(true);
        });

        test('evicts LRU when full', () => {
            const evicted = [];
            const cache = inst.create({ maxSize: 3, onEvict: (k, v) => evicted.push({ k, v }) });
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            cache.set('d', 4); // evict 'a'
            expect(evicted).toEqual([{ k: 'a', v: 1 }]);
            expect(cache.has('a')).toBe(false);
            expect(cache.size).toBe(3);
        });

        test('set replacing existing key does not call onEvict', () => {
            const evicted = [];
            const cache = inst.create({ maxSize: 3, onEvict: (k, v) => evicted.push(k) });
            cache.set('a', 1);
            cache.set('a', 99); // replace - no eviction
            expect(evicted).toEqual([]);
            expect(cache.get('a')).toBe(99);
        });

        test('delete calls onEvict', () => {
            const evicted = [];
            const cache = inst.create({ maxSize: 3, onEvict: (k, v) => evicted.push({ k, v }) });
            cache.set('a', 1);
            cache.delete('a');
            expect(evicted).toEqual([{ k: 'a', v: 1 }]);
        });

        test('delete returns false for missing key', () => {
            const cache = inst.create({ maxSize: 3 });
            expect(cache.delete('nonexistent')).toBe(false);
        });

        test('clear calls onEvict for all entries', () => {
            const evicted = [];
            const cache = inst.create({ maxSize: 5, onEvict: (k) => evicted.push(k) });
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            cache.clear();
            expect(evicted.sort()).toEqual(['a', 'b', 'c']);
            expect(cache.size).toBe(0);
        });

        test('keys() iterates MRU to LRU', () => {
            const cache = inst.create({ maxSize: 5 });
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            // MRU: c, b, a
            expect([...cache.keys()]).toEqual(['c', 'b', 'a']);
        });

        test('values() iterates MRU to LRU', () => {
            const cache = inst.create({ maxSize: 5 });
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            expect([...cache.values()]).toEqual([3, 2, 1]);
        });

        test('entries() iterates MRU to LRU', () => {
            const cache = inst.create({ maxSize: 5 });
            cache.set('x', 10);
            cache.set('y', 20);
            expect([...cache.entries()]).toEqual([['y', 20], ['x', 10]]);
        });

        test('maxSize getter is immutable', () => {
            const cache = inst.create({ maxSize: 7 });
            expect(cache.maxSize).toBe(7);
        });

        test('returns object with snapshot function', () => {
            const cache = inst.create({ maxSize: 5 });
            expect(typeof cache.snapshot).toBe('function');
        });
    });

    describe('snapshot', () => {
        let lru;
        beforeEach(() => { lru = lruCache.factory(); });

        test('snapshot on empty cache returns empty entries', () => {
            const cache = lru.create({ maxSize: 5 });
            const snap = cache.snapshot();
            expect(snap).toEqual({ maxSize: 5, entries: [] });
        });

        test('snapshot reflects MRU→LRU order', () => {
            const cache = lru.create({ maxSize: 5 });
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            cache.get('a'); // bump 'a' to MRU → order: a, c, b
            const snap = cache.snapshot();
            expect(snap.maxSize).toBe(5);
            expect(snap.entries[0]).toEqual(['a', 1]); // MRU
            expect(snap.entries[2]).toEqual(['b', 2]); // LRU
        });

        test('snapshot does not mutate LRU order', () => {
            const cache = lru.create({ maxSize: 3 });
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3); // MRU→LRU: c,b,a
            cache.snapshot(); // should not change order
            cache.set('d', 4); // evict 'a' (still LRU)
            expect(cache.has('a')).toBe(false);
            expect(cache.has('c')).toBe(true);
        });
    });

    describe('round-trip', () => {
        let lru;
        beforeEach(() => { lru = lruCache.factory(); });

        test('restores size correctly', () => {
            const c1 = lru.create({ maxSize: 5 });
            c1.set('x', 10); c1.set('y', 20); c1.set('z', 30);
            const c2 = lru.create({ maxSize: 5, snapshot: c1.snapshot() });
            expect(c2.size).toBe(c1.size);
        });

        test('restores MRU→LRU order via keys()', () => {
            const c1 = lru.create({ maxSize: 5 });
            c1.set('a', 1); c1.set('b', 2); c1.set('c', 3);
            c1.get('a'); // MRU order: a, c, b
            const c2 = lru.create({ maxSize: 5, snapshot: c1.snapshot() });
            expect([...c2.keys()]).toEqual([...c1.keys()]);
        });

        test('values are accessible after restore', () => {
            const c1 = lru.create({ maxSize: 5 });
            c1.set('hello', 'world');
            const c2 = lru.create({ maxSize: 5, snapshot: c1.snapshot() });
            expect(c2.get('hello')).toBe('world');
        });

        test('throws on snapshot.maxSize mismatch', () => {
            const c1 = lru.create({ maxSize: 5 });
            c1.set('a', 1);
            const snap = c1.snapshot();
            expect(() => lru.create({ maxSize: 10, snapshot: snap }))
                .toThrow('lruCache: snapshot.maxSize mismatch');
        });

        test('throws when snapshot.entries.length > maxSize', () => {
            const c1 = lru.create({ maxSize: 5 });
            c1.set('a', 1); c1.set('b', 2); c1.set('c', 3);
            const snap = c1.snapshot();
            // Manually create a scenario: pass a fake snapshot with too many entries
            const fakeSnap = { maxSize: 2, entries: [['a', 1], ['b', 2], ['c', 3]] };
            expect(() => lru.create({ maxSize: 2, snapshot: fakeSnap }))
                .toThrow('lruCache: snapshot exceeds maxSize');
        });

        test('onEvict not called during restore', () => {
            const evicted = [];
            const c1 = lru.create({ maxSize: 5 });
            c1.set('a', 1); c1.set('b', 2);
            const snap = c1.snapshot();
            const c2 = lru.create({ maxSize: 5, snapshot: snap, onEvict: (k) => evicted.push(k) });
            expect(evicted).toEqual([]);
            expect(c2.size).toBe(2);
        });

        test('onEvict works normally after restore on set overflow', () => {
            const evicted = [];
            const c1 = lru.create({ maxSize: 3 });
            c1.set('a', 1); c1.set('b', 2); c1.set('c', 3);
            const snap = c1.snapshot(); // 3 entries, maxSize 3
            const c2 = lru.create({ maxSize: 3, snapshot: snap, onEvict: (k) => evicted.push(k) });
            c2.set('d', 4); // should evict LRU
            expect(evicted.length).toBe(1);
        });
    });
});
