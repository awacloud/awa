// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { trie } from './trie.js';

describe('trie module', () => {
    test('should have correct module metadata', () => {
        expect(trie.name).toBe('trie');
        expect(trie.dependencies).toEqual([]);
        expect(typeof trie.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with create function', () => {
            const inst = trie.factory();
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create', () => {
        let inst;
        let t;
        beforeEach(() => {
            inst = trie.factory();
            t = inst.create();
        });

        test('returns object with expected API', () => {
            expect(typeof t.insert).toBe('function');
            expect(typeof t.has).toBe('function');
            expect(typeof t.get).toBe('function');
            expect(typeof t.hasPrefix).toBe('function');
            expect(typeof t.search).toBe('function');
            expect(typeof t.delete).toBe('function');
            expect(typeof t.keys).toBe('function');
            expect(typeof t.clear).toBe('function');
            expect(typeof t.size).toBe('number');
        });

        test('initial size is 0', () => {
            expect(t.size).toBe(0);
        });

        test('insert and has exact match', () => {
            t.insert('hello');
            expect(t.has('hello')).toBe(true);
            expect(t.has('hell')).toBe(false);
            expect(t.has('helloo')).toBe(false);
        });

        test('insert with value and get', () => {
            t.insert('apple', 42);
            expect(t.get('apple')).toBe(42);
            expect(t.get('app')).toBeUndefined();
        });

        test('insert without value defaults to true', () => {
            t.insert('word');
            expect(t.get('word')).toBe(true);
        });

        test('insert overwrite updates value', () => {
            t.insert('key', 1);
            t.insert('key', 2);
            expect(t.get('key')).toBe(2);
            expect(t.size).toBe(1);
        });

        test('size tracks unique keys', () => {
            t.insert('a');
            t.insert('b');
            t.insert('ab');
            expect(t.size).toBe(3);
            t.insert('a'); // overwrite
            expect(t.size).toBe(3);
        });

        test('hasPrefix returns true when prefix exists', () => {
            t.insert('apple');
            t.insert('application');
            expect(t.hasPrefix('app')).toBe(true);
            expect(t.hasPrefix('apple')).toBe(true);
            expect(t.hasPrefix('apples')).toBe(false);
            expect(t.hasPrefix('ban')).toBe(false);
        });

        test('search returns all keys with prefix', () => {
            t.insert('apple', 1);
            t.insert('application', 2);
            t.insert('apply', 3);
            t.insert('banana', 4);
            const results = t.search('app');
            expect(results.length).toBe(3);
            const keys = results.map(r => r.key).sort();
            expect(keys).toEqual(['apple', 'application', 'apply']);
        });

        test('search with limit', () => {
            t.insert('apple', 1);
            t.insert('application', 2);
            t.insert('apply', 3);
            const results = t.search('app', 2);
            expect(results.length).toBe(2);
        });

        test('search empty prefix returns all keys', () => {
            t.insert('a');
            t.insert('b');
            t.insert('c');
            const results = t.search('');
            expect(results.length).toBe(3);
        });

        test('search on unknown prefix returns []', () => {
            t.insert('hello');
            expect(t.search('xyz')).toEqual([]);
        });

        test('delete removes key and returns true', () => {
            t.insert('apple');
            expect(t.delete('apple')).toBe(true);
            expect(t.has('apple')).toBe(false);
            expect(t.size).toBe(0);
        });

        test('delete returns false for missing key', () => {
            expect(t.delete('nonexistent')).toBe(false);
        });

        test('delete apple does not break application', () => {
            t.insert('apple', 1);
            t.insert('application', 2);
            t.delete('apple');
            expect(t.has('apple')).toBe(false);
            expect(t.has('application')).toBe(true);
            expect(t.get('application')).toBe(2);
        });

        test('delete cleans orphan nodes', () => {
            t.insert('ab');
            t.delete('ab');
            expect(t.hasPrefix('a')).toBe(false);
        });

        test('delete prefix key does not remove longer keys', () => {
            t.insert('app');
            t.insert('apple');
            t.delete('app');
            expect(t.has('app')).toBe(false);
            expect(t.has('apple')).toBe(true);
            expect(t.hasPrefix('app')).toBe(true);
        });

        test('Unicode keys (café, 日本)', () => {
            t.insert('café', 1);
            t.insert('日本', 2);
            expect(t.has('café')).toBe(true);
            expect(t.has('日本')).toBe(true);
            expect(t.get('café')).toBe(1);
            expect(t.get('日本')).toBe(2);
            expect(t.hasPrefix('caf')).toBe(true);
            expect(t.hasPrefix('日')).toBe(true);
        });

        test('keys() iterates in DFS lexicographic order', () => {
            t.insert('banana');
            t.insert('apple');
            t.insert('cherry');
            const keys = [...t.keys()];
            expect(keys.sort()).toEqual(['apple', 'banana', 'cherry']);
            expect(keys.length).toBe(3);
        });

        test('clear resets trie', () => {
            t.insert('a');
            t.insert('b');
            t.clear();
            expect(t.size).toBe(0);
            expect(t.has('a')).toBe(false);
        });

        test('snapshot is exposed on instance', () => {
            expect(typeof t.snapshot).toBe('function');
        });
    });

    describe('snapshot', () => {
        let inst;
        let t;
        beforeEach(() => {
            inst = trie.factory();
            t = inst.create();
        });

        test('snapshot on empty trie returns { entries: [] }', () => {
            expect(t.snapshot()).toEqual({ entries: [] });
        });

        test('snapshot after inserts has correct length', () => {
            t.insert('apple', 1);
            t.insert('banana', 2);
            t.insert('cherry', 3);
            const snap = t.snapshot();
            expect(snap.entries.length).toBe(3);
            expect(t.size).toBe(3);
        });

        test('snapshot contains all key-value pairs', () => {
            t.insert('hello', 'world');
            t.insert('foo', 42);
            const snap = t.snapshot();
            const map = Object.fromEntries(snap.entries);
            expect(map['hello']).toBe('world');
            expect(map['foo']).toBe(42);
        });
    });

    describe('round-trip', () => {
        let inst;
        beforeEach(() => { inst = trie.factory(); });

        test('ASCII round-trip: size preserved', () => {
            const t1 = inst.create();
            t1.insert('apple', 1);
            t1.insert('application', 2);
            t1.insert('banana', 3);
            const t2 = inst.create({ snapshot: t1.snapshot() });
            expect(t2.size).toBe(t1.size);
        });

        test('ASCII round-trip: get values match', () => {
            const t1 = inst.create();
            t1.insert('apple', 1);
            t1.insert('application', 2);
            t1.insert('banana', 3);
            const t2 = inst.create({ snapshot: t1.snapshot() });
            expect(t2.get('apple')).toBe(1);
            expect(t2.get('application')).toBe(2);
            expect(t2.get('banana')).toBe(3);
        });

        test('ASCII round-trip: has returns true for all keys', () => {
            const t1 = inst.create();
            t1.insert('alpha');
            t1.insert('beta');
            const t2 = inst.create({ snapshot: t1.snapshot() });
            expect(t2.has('alpha')).toBe(true);
            expect(t2.has('beta')).toBe(true);
        });

        test('Unicode round-trip: emoji and BMP+ keys', () => {
            const t1 = inst.create();
            t1.insert('café', 'french');
            t1.insert('日本語', 'japanese');
            t1.insert('😀🎉', 'emojis');
            const t2 = inst.create({ snapshot: t1.snapshot() });
            expect(t2.size).toBe(3);
            expect(t2.get('café')).toBe('french');
            expect(t2.get('日本語')).toBe('japanese');
            expect(t2.get('😀🎉')).toBe('emojis');
        });

        test('hasPrefix works after restoration', () => {
            const t1 = inst.create();
            t1.insert('application', 1);
            t1.insert('apple', 2);
            const t2 = inst.create({ snapshot: t1.snapshot() });
            expect(t2.hasPrefix('app')).toBe(true);
            expect(t2.hasPrefix('xyz')).toBe(false);
        });

        test('search works after restoration', () => {
            const t1 = inst.create();
            t1.insert('apple', 1);
            t1.insert('application', 2);
            t1.insert('apply', 3);
            const t2 = inst.create({ snapshot: t1.snapshot() });
            const results = t2.search('app');
            expect(results.length).toBe(3);
        });

        test('round-trip of empty trie', () => {
            const t1 = inst.create();
            const t2 = inst.create({ snapshot: t1.snapshot() });
            expect(t2.size).toBe(0);
        });
    });
});
