// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { cache } from './cache.js';

// In-memory mock for caches API
class MockCacheStorage {
    constructor() { this._caches = new Map(); }
    async open(name) {
        if (!this._caches.has(name)) this._caches.set(name, new MockCache());
        return this._caches.get(name);
    }
    async delete(name) {
        return this._caches.delete(name);
    }
    async keys() { return [...this._caches.keys()]; }
    async match(request, opts) {
        for (const c of this._caches.values()) {
            const result = await c.match(request);
            if (result) return result;
        }
        return undefined;
    }
}

class MockCache {
    constructor() { this._entries = new Map(); }
    async put(request, response) {
        this._entries.set(typeof request === 'string' ? request : request.url, response);
    }
    async match(request) {
        const key = typeof request === 'string' ? request : request.url;
        return this._entries.get(key);
    }
    async matchAll(request) {
        if (!request) return [...this._entries.values()];
        const result = await this.match(request);
        return result ? [result] : [];
    }
    async add(request) {}
    async addAll(requests) {}
    async delete(request) {
        const key = typeof request === 'string' ? request : request.url;
        return this._entries.delete(key);
    }
    async keys() { return [...this._entries.keys()].map(k => ({ url: k })); }
}

let originalCaches;
beforeEach(() => {
    originalCaches = globalThis.caches;
    globalThis.caches = new MockCacheStorage();
});
afterEach(() => {
    globalThis.caches = originalCaches;
});

describe('cache module', () => {
    test('should have correct module metadata', () => {
        expect(cache.name).toBe('cache');
        expect(cache.version).toBe('1.0.0');
        expect(cache.type).toBe('fw.dom.sw');
        expect(cache.dependencies).toEqual([]);
        expect(typeof cache.factory).toBe('function');
    });

    describe('factory', () => {
        let inst;
        beforeEach(() => { inst = cache.factory(); });

        test('returns object with expected API', () => {
            expect(typeof inst.open).toBe('function');
            expect(typeof inst.delete).toBe('function');
            expect(typeof inst.has).toBe('function');
            expect(typeof inst.keys).toBe('function');
            expect(typeof inst.match).toBe('function');
        });

        test('open returns a cache wrapper', async () => {
            const c = await inst.open('v1');
            expect(typeof c.put).toBe('function');
            expect(typeof c.match).toBe('function');
            expect(typeof c.matchAll).toBe('function');
            expect(typeof c.delete).toBe('function');
            expect(typeof c.keys).toBe('function');
        });

        test('put and match round-trip', async () => {
            const c = await inst.open('v1');
            const response = { body: 'hello', status: 200 };
            await c.put('/api/data', response);
            const result = await c.match('/api/data');
            expect(result).toEqual(response);
        });

        test('match returns undefined for missing key', async () => {
            const c = await inst.open('v1');
            const result = await c.match('/missing');
            expect(result).toBeUndefined();
        });

        test('delete removes entry', async () => {
            const c = await inst.open('v1');
            await c.put('/api/data', { ok: true });
            await c.delete('/api/data');
            expect(await c.match('/api/data')).toBeUndefined();
        });

        test('keys returns stored request keys', async () => {
            const c = await inst.open('v1');
            await c.put('/a', {});
            await c.put('/b', {});
            const keys = await c.keys();
            expect(keys.map(k => k.url).sort()).toEqual(['/a', '/b']);
        });

        test('global has returns false before open', async () => {
            expect(await inst.has('v1')).toBe(false);
        });

        test('global has returns true after open', async () => {
            await inst.open('v1');
            expect(await inst.has('v1')).toBe(true);
        });

        test('global delete removes cache', async () => {
            await inst.open('v1');
            await inst.delete('v1');
            expect(await inst.has('v1')).toBe(false);
        });

        test('global keys returns cache names', async () => {
            await inst.open('v1');
            await inst.open('v2');
            const ks = await inst.keys();
            expect(ks.sort()).toEqual(['v1', 'v2']);
        });

        test('global match searches all caches', async () => {
            const c1 = await inst.open('v1');
            await c1.put('/found', { ok: true });
            const result = await inst.match('/found');
            expect(result).toEqual({ ok: true });
        });

        test('throws when caches not available', async () => {
            globalThis.caches = undefined;
            await expect(cache.factory().open('v1')).rejects.toThrow('cache: caches API is not available');
        });
    });
});
