// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { backgroundSync } from './backgroundSync.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function makeServiceWorkerStub(syncManager) {
    return {
        ready: async () => ({ sync: syncManager ?? null }),
        isSupported: () => true,
    };
}

function makeSyncManagerStub(initialTags = []) {
    const tags = [...initialTags];
    return {
        register: async (tag) => { if (!tags.includes(tag)) tags.push(tag); },
        getTags: async () => [...tags],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backgroundSync module', () => {

    test('should have correct module metadata', () => {
        expect(backgroundSync.name).toBe('backgroundSync');
        expect(backgroundSync.version).toBe('1.0.0');
        expect(backgroundSync.type).toBe('fw.dom.sw');
        expect(backgroundSync.dependencies).toEqual(['serviceWorker']);
        expect(typeof backgroundSync.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const sw = makeServiceWorkerStub(makeSyncManagerStub());
            const inst = backgroundSync.factory(sw);
            expect(inst).toBeDefined();
            expect(typeof inst.register).toBe('function');
            expect(typeof inst.list).toBe('function');
            expect(typeof inst.support).toBe('function');
        });
    });

    // -----------------------------------------------------------------------
    // support()
    // -----------------------------------------------------------------------

    describe('support', () => {
        test('returns {available: false} when SyncManager absent from globalThis', () => {
            // happy-dom ne fournit pas SyncManager
            const sw = makeServiceWorkerStub(makeSyncManagerStub());
            const inst = backgroundSync.factory(sw);
            const result = inst.support();
            // In this test env, SyncManager is not defined
            expect(typeof result).toBe('object');
            expect(typeof result.available).toBe('boolean');
            expect(typeof result.sw).toBe('boolean');
            // SyncManager absent from happy-dom → available = false
            expect(result.available).toBe(false);
        });

        test('returns {sw: boolean} reflecting navigator.serviceWorker presence', () => {
            const sw = makeServiceWorkerStub(makeSyncManagerStub());
            const inst = backgroundSync.factory(sw);
            const result = inst.support();
            // happy-dom does not provide navigator.serviceWorker - sw may be false
            expect(typeof result.sw).toBe('boolean');
        });
    });

    // -----------------------------------------------------------------------
    // register()
    // -----------------------------------------------------------------------

    describe('register', () => {
        test('calls sync.register with the provided tag', async () => {
            let calledWith = null;
            const syncStub = {
                register: async (tag) => { calledWith = tag; },
                getTags: async () => [],
            };
            const sw = makeServiceWorkerStub(syncStub);
            const inst = backgroundSync.factory(sw);
            await inst.register('my-tag');
            expect(calledWith).toBe('my-tag');
        });

        test('throws BackgroundSyncNotSupported when SyncManager unavailable', async () => {
            const sw = makeServiceWorkerStub(null); // registration.sync = null
            const inst = backgroundSync.factory(sw);
            let err = null;
            try {
                await inst.register('some-tag');
            } catch (e) {
                err = e;
            }
            expect(err).not.toBeNull();
            expect(err.name).toBe('BackgroundSyncNotSupported');
        });

        test('throws when serviceWorker.ready() rejects', async () => {
            const sw = {
                ready: async () => { throw new Error('SW not ready'); },
            };
            const inst = backgroundSync.factory(sw);
            await expect(inst.register('tag')).rejects.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // list()
    // -----------------------------------------------------------------------

    describe('list', () => {
        test('returns registered tags as array', async () => {
            const syncStub = makeSyncManagerStub(['tag-a', 'tag-b']);
            const sw = makeServiceWorkerStub(syncStub);
            const inst = backgroundSync.factory(sw);
            const tags = await inst.list();
            expect(tags).toEqual(['tag-a', 'tag-b']);
        });

        test('returns empty array when no tags registered', async () => {
            const syncStub = makeSyncManagerStub([]);
            const sw = makeServiceWorkerStub(syncStub);
            const inst = backgroundSync.factory(sw);
            const tags = await inst.list();
            expect(tags).toEqual([]);
        });

        test('throws BackgroundSyncNotSupported when SyncManager unavailable', async () => {
            const sw = makeServiceWorkerStub(null);
            const inst = backgroundSync.factory(sw);
            let err = null;
            try {
                await inst.list();
            } catch (e) {
                err = e;
            }
            expect(err).not.toBeNull();
            expect(err.name).toBe('BackgroundSyncNotSupported');
        });
    });

});
