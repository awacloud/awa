// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { indexedDB as idbModule } from './indexedDB.js';

// ── Minimal IDB mock ──────────────────────────────────────────────────────────
// Provides just enough IDB surface to test the module's Promise wrappers.

function makeIDBRequest(result, error = null) {
    const req = {
        result, error,
        onsuccess: null,
        onerror: null
    };
    // Resolve or reject asynchronously (next microtask).
    if (error) {
        Promise.resolve().then(() => { if (req.onerror) req.onerror(); });
    } else {
        Promise.resolve().then(() => { if (req.onsuccess) req.onsuccess(); });
    }
    return req;
}

function makeStore(data = {}) {
    return {
        get(key)                { return makeIDBRequest(data[key]); },
        put(value, key)         { data[key] = value; return makeIDBRequest(key); },
        delete(key)             { delete data[key]; return makeIDBRequest(undefined); },
        count(query)            {
            if (query === undefined) return makeIDBRequest(Object.keys(data).length);
            return makeIDBRequest(Object.prototype.hasOwnProperty.call(data, query) ? 1 : 0);
        },
        clear()                 { for (const k in data) delete data[k]; return makeIDBRequest(undefined); },
        getAll(query, count)    { return makeIDBRequest(Object.values(data)); },
        getAllKeys(query, count) { return makeIDBRequest(Object.keys(data)); },
        openCursor() {
            const keys = Object.keys(data);
            let idx = 0;
            const req = { onsuccess: null, onerror: null };
            function next() {
                if (idx < keys.length) {
                    const k = keys[idx++];
                    req.result = {
                        key: k, value: data[k],
                        continue: () => Promise.resolve().then(next)
                    };
                    if (req.onsuccess) req.onsuccess();
                } else {
                    req.result = null;
                    if (req.onsuccess) req.onsuccess();
                }
            }
            Promise.resolve().then(next);
            return req;
        }
    };
}

function makeDB(storeData = {}) {
    const db = {
        name: 'testdb',
        version: 1,
        objectStoreNames: Object.keys(storeData),
        onversionchange: null,
        _closed: false,
        close() { this._closed = true; },
        transaction(storeName, mode) {
            const tx = {
                onerror: null,
                objectStore(name) { return makeStore(storeData[name] || {}); }
            };
            return tx;
        }
    };
    return db;
}

function makeIDB(dbData = {}) {
    return {
        open(name, version) {
            const req = {
                result: null, error: null,
                onupgradeneeded: null, onsuccess: null, onerror: null
            };
            Promise.resolve().then(() => {
                req.result = makeDB(dbData);
                if (req.onupgradeneeded) {
                    req.onupgradeneeded({ oldVersion: 0, newVersion: version });
                }
                if (req.onsuccess) req.onsuccess();
            });
            return req;
        },
        deleteDatabase(name) {
            const req = {
                result: undefined, error: null,
                onsuccess: null, onerror: null, onblocked: null
            };
            Promise.resolve().then(() => { if (req.onsuccess) req.onsuccess(); });
            return req;
        }
    };
}

// ── BroadcastChannel mock ─────────────────────────────────────────────────────

function makeBroadcastChannelModule({ supported = true } = {}) {
    const createdChannels = [];

    function create(channelName) {
        const callbacks = new Set();
        const posted = [];
        let closed = false;

        const channel = {
            channelName,
            posted,
            closed: false,
            _callbacks: callbacks,
            post(data) {
                posted.push(data);
            },
            on(fn) {
                callbacks.add(fn);
                return () => callbacks.delete(fn);
            },
            off(fn) {
                callbacks.delete(fn);
            },
            close() {
                closed = true;
                channel.closed = true;
                callbacks.clear();
            },
            // Helper to simulate receiving a message from another tab
            _receive(data) {
                for (const fn of callbacks) {
                    fn(data);
                }
            }
        };

        createdChannels.push(channel);
        return channel;
    }

    return {
        isSupported() { return supported; },
        create,
        _createdChannels: createdChannels
    };
}

describe('indexedDB module', () => {

    test('has correct module metadata', () => {
        expect(idbModule.name).toBe('indexedDB');
        expect(idbModule.dependencies).toEqual(['broadcastChannel']);
        expect(typeof idbModule.factory).toBe('function');
    });

    test('factory accepts broadcastChannel as first argument (length >= 1)', () => {
        expect(idbModule.factory.length).toBe(1);
    });

    describe('factory - IDB unavailable', () => {
        let api;
        let originalIDB;
        let bcModule;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = undefined;
            bcModule = makeBroadcastChannelModule();
            api = idbModule.factory(bcModule);
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('isSupported returns false', () => {
            expect(api.isSupported()).toBe(false);
        });

        test('open rejects with an error', async () => {
            await expect(api.open('db', 1)).rejects.toThrow();
        });

        test('drop rejects with an error', async () => {
            await expect(api.drop('db')).rejects.toThrow();
        });
    });

    describe('factory - IDB available (mocked)', () => {
        let api;
        let originalIDB;
        let bcModule;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = makeIDB({ myStore: {} });
            bcModule = makeBroadcastChannelModule();
            api = idbModule.factory(bcModule);
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('isSupported returns true', () => {
            expect(api.isSupported()).toBe(true);
        });

        test('open resolves to a DB handle', async () => {
            const db = await api.open('testdb', 1);
            expect(db).toBeDefined();
            expect(typeof db.store).toBe('function');
            expect(typeof db.close).toBe('function');
            expect(typeof db.name).toBe('string');
            expect(typeof db.version).toBe('number');
        });

        test('DB handle exposes storeNames, name, and version', async () => {
            const db = await api.open('testdb', 1);
            expect(db.name).toBe('testdb');
            expect(db.version).toBe(1);
            expect(Array.isArray(db.storeNames)).toBe(true);
        });

        test('open calls upgrade callback on first open', async () => {
            let upgraded = false;
            await api.open('testdb', 1, () => { upgraded = true; });
            expect(upgraded).toBe(true);
        });

        test('drop resolves without error', async () => {
            await expect(api.drop('testdb')).resolves.toBeUndefined();
        });

        test('store returns an accessor with all expected methods', async () => {
            const db = await api.open('testdb', 1);
            const store = db.store('myStore');
            expect(typeof store.get).toBe('function');
            expect(typeof store.set).toBe('function');
            expect(typeof store.del).toBe('function');
            expect(typeof store.has).toBe('function');
            expect(typeof store.clear).toBe('function');
            expect(typeof store.count).toBe('function');
            expect(typeof store.getAll).toBe('function');
            expect(typeof store.getAllKeys).toBe('function');
            expect(typeof store.each).toBe('function');
        });

        test('store.get resolves with a value', async () => {
            const dbData = { myStore: { key1: 'hello' } };
            globalThis.indexedDB = makeIDB(dbData);
            const db = await idbModule.factory(makeBroadcastChannelModule()).open('testdb', 1);
            const result = await db.store('myStore').get('key1');
            expect(result).toBe('hello');
        });

        test('store.get resolves with undefined for missing key', async () => {
            const db = await api.open('testdb', 1);
            const result = await db.store('myStore').get('missing');
            expect(result).toBeUndefined();
        });

        test('store.set resolves with the key', async () => {
            const db = await api.open('testdb', 1);
            const result = await db.store('myStore').set('k', 'v');
            expect(result).toBe('k');
        });

        test('store.has returns true for existing key', async () => {
            const dbData = { myStore: { exists: true } };
            globalThis.indexedDB = makeIDB(dbData);
            const db = await idbModule.factory(makeBroadcastChannelModule()).open('testdb', 1);
            expect(await db.store('myStore').has('exists')).toBe(true);
        });

        test('store.has returns false for missing key', async () => {
            const db = await api.open('testdb', 1);
            expect(await db.store('myStore').has('nope')).toBe(false);
        });

        // ── listen ────────────────────────────────────────────────────────────────

        describe('DB listen', () => {
            test('add registers a callback that fires on set', async () => {
                const db = await api.open('testdb', 1);
                const events = [];
                db.listen.add('watcher', (evt) => events.push(evt));
                await db.store('myStore').set('x', 1);
                expect(events.length).toBe(1);
                expect(events[0].type).toBe('set');
                expect(events[0].key).toBe('x');
                expect(events[0].cross).toBe(false);
            });

            test('add registers a callback that fires on del', async () => {
                const db = await api.open('testdb', 1);
                const events = [];
                db.listen.add('w', (evt) => events.push(evt));
                await db.store('myStore').del('x');
                expect(events.find(e => e.type === 'del')).toBeDefined();
            });

            test('add registers a callback that fires on clear', async () => {
                const db = await api.open('testdb', 1);
                const events = [];
                db.listen.add('w', (evt) => events.push(evt));
                await db.store('myStore').clear();
                expect(events.find(e => e.type === 'clear')).toBeDefined();
            });

            test('del removes a named callback', async () => {
                const db = await api.open('testdb', 1);
                const events = [];
                db.listen.add('w', (evt) => events.push(evt));
                db.listen.del('w');
                await db.store('myStore').set('x', 1);
                expect(events.length).toBe(0);
            });
        });

        // ── factory isolation ─────────────────────────────────────────────────────

        describe('factory isolation', () => {
            test('multiple factory calls return independent instances', () => {
                const api2 = idbModule.factory(makeBroadcastChannelModule());
                expect(api).not.toBe(api2);
            });
        });
    });

    // ── Options: defaults ─────────────────────────────────────────────────────

    describe('options - defaults (crossTab: true, namespace: "")', () => {
        let api;
        let bcModule;
        let originalIDB;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = makeIDB({ myStore: {} });
            bcModule = makeBroadcastChannelModule();
            api = idbModule.factory(bcModule);
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('open without options creates channel via broadcastChannel.create with idb:<name>', async () => {
            await api.open('mydb', 1);
            expect(bcModule._createdChannels.length).toBe(1);
            expect(bcModule._createdChannels[0].channelName).toBe('idb:mydb');
        });

        test('cross-tab message dispatched with cross: true', async () => {
            const db = await api.open('mydb', 1);
            const events = [];
            db.listen.add('w', (evt) => events.push(evt));

            // Simulate receiving a message from another tab
            const ch = bcModule._createdChannels[0];
            ch._receive({ type: 'set', store: 'myStore', key: 'hello' });

            expect(events.length).toBe(1);
            expect(events[0].cross).toBe(true);
            expect(events[0].type).toBe('set');
            expect(events[0].key).toBe('hello');
        });

        test('notify posts to channel on mutation', async () => {
            const db = await api.open('mydb', 1);
            await db.store('myStore').set('k', 'v');
            const ch = bcModule._createdChannels[0];
            expect(ch.posted.length).toBe(1);
            expect(ch.posted[0].type).toBe('set');
            expect(ch.posted[0].key).toBe('k');
        });
    });

    // ── Options: crossTab: false ───────────────────────────────────────────────

    describe('options - crossTab: false', () => {
        let api;
        let bcModule;
        let originalIDB;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = makeIDB({ myStore: {} });
            bcModule = makeBroadcastChannelModule();
            api = idbModule.factory(bcModule);
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('no broadcastChannel.create call when crossTab: false', async () => {
            await api.open('mydb', 1, undefined, { crossTab: false });
            expect(bcModule._createdChannels.length).toBe(0);
        });

        test('notify does not post to any channel when crossTab: false', async () => {
            const db = await api.open('mydb', 1, undefined, { crossTab: false });
            const events = [];
            db.listen.add('w', (evt) => events.push(evt));
            await db.store('myStore').set('k', 'v');
            // same-tab event fires
            expect(events.length).toBe(1);
            expect(events[0].cross).toBe(false);
            // no channel created
            expect(bcModule._createdChannels.length).toBe(0);
        });
    });

    // ── Options: namespace ────────────────────────────────────────────────────

    describe('options - namespace', () => {
        let originalIDB;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = makeIDB({ myStore: {} });
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('channel name is idb:<namespace>:<dbname> when namespace provided', async () => {
            const bcModule = makeBroadcastChannelModule();
            const api = idbModule.factory(bcModule);
            await api.open('mydb', 1, undefined, { namespace: 'user-42' });
            expect(bcModule._createdChannels.length).toBe(1);
            expect(bcModule._createdChannels[0].channelName).toBe('idb:user-42:mydb');
        });

        test('two DBs with different namespace do not share cross-tab events', async () => {
            // Tab A uses namespace 'user-1', Tab B uses namespace 'user-2'
            // Simulate via two separate bc module instances and manually send messages
            const bcA = makeBroadcastChannelModule();
            const bcB = makeBroadcastChannelModule();
            const apiA = idbModule.factory(bcA);
            const apiB = idbModule.factory(bcB);

            const dbA = await apiA.open('mydb', 1, undefined, { namespace: 'user-1' });
            const dbB = await apiB.open('mydb', 1, undefined, { namespace: 'user-2' });

            const eventsB = [];
            dbB.listen.add('w', (evt) => eventsB.push(evt));

            // A posts a mutation - channel A posts to 'idb:user-1:mydb'
            await dbA.store('myStore').set('k', 'v');
            const chA = bcA._createdChannels[0];
            expect(chA.channelName).toBe('idb:user-1:mydb');

            // B is on channel 'idb:user-2:mydb' - simulate: B receives nothing from A's channel
            // (different channel names, so B's channel._receive is never called by A)
            // B should not have any cross:true events
            expect(eventsB.filter(e => e.cross === true).length).toBe(0);
        });

        test('two DBs with same namespace share cross-tab events', async () => {
            const bcA = makeBroadcastChannelModule();
            const bcB = makeBroadcastChannelModule();
            const apiA = idbModule.factory(bcA);
            const apiB = idbModule.factory(bcB);

            const dbA = await apiA.open('mydb', 1, undefined, { namespace: 'shared-ns' });
            const dbB = await apiB.open('mydb', 1, undefined, { namespace: 'shared-ns' });

            const eventsB = [];
            dbB.listen.add('w', (evt) => eventsB.push(evt));

            // Simulate A sends a broadcast on its channel
            const chA = bcA._createdChannels[0];
            expect(chA.channelName).toBe('idb:shared-ns:mydb');

            // B's channel has the same name - simulate B receives the message (cross-tab)
            const chB = bcB._createdChannels[0];
            expect(chB.channelName).toBe('idb:shared-ns:mydb');
            chB._receive({ type: 'set', store: 'myStore', key: 'k' });

            expect(eventsB.length).toBe(1);
            expect(eventsB[0].cross).toBe(true);
        });
    });

    // ── Options: validation ───────────────────────────────────────────────────

    describe('options - validation', () => {
        let api;
        let originalIDB;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = makeIDB({ myStore: {} });
            api = idbModule.factory(makeBroadcastChannelModule());
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('namespace containing ":" throws', async () => {
            await expect(api.open('db', 1, undefined, { namespace: 'bad:ns' }))
                .rejects.toThrow('indexedDB: namespace must be a string without ":"');
        });

        test('crossTab non-boolean throws', async () => {
            await expect(api.open('db', 1, undefined, { crossTab: 'yes' }))
                .rejects.toThrow('indexedDB: crossTab must be a boolean');
        });

        test('crossTab: 1 (number) throws', async () => {
            await expect(api.open('db', 1, undefined, { crossTab: 1 }))
                .rejects.toThrow('indexedDB: crossTab must be a boolean');
        });
    });

    // ── db.close() closes the broadcastChannel ────────────────────────────────

    describe('db.close()', () => {
        let api;
        let bcModule;
        let originalIDB;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = makeIDB({ myStore: {} });
            bcModule = makeBroadcastChannelModule();
            api = idbModule.factory(bcModule);
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('close() calls channel.close() on the module wrapper', async () => {
            const db = await api.open('mydb', 1);
            const ch = bcModule._createdChannels[0];
            expect(ch.closed).toBe(false);
            db.close();
            expect(ch.closed).toBe(true);
        });

        test('close() without channel (crossTab: false) does not throw', async () => {
            const db = await api.open('mydb', 1, undefined, { crossTab: false });
            expect(() => db.close()).not.toThrow();
        });
    });

    // ── broadcastChannel.isSupported() === false: silent degradation ──────────

    describe('degradation when broadcastChannel not supported', () => {
        let api;
        let bcModule;
        let originalIDB;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = makeIDB({ myStore: {} });
            bcModule = makeBroadcastChannelModule({ supported: false });
            api = idbModule.factory(bcModule);
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('no channel created when broadcastChannel.isSupported() is false', async () => {
            await api.open('mydb', 1);
            expect(bcModule._createdChannels.length).toBe(0);
        });

        test('same-tab events still fire when not supported', async () => {
            const db = await api.open('mydb', 1);
            const events = [];
            db.listen.add('w', (evt) => events.push(evt));
            await db.store('myStore').set('k', 'v');
            expect(events.length).toBe(1);
            expect(events[0].cross).toBe(false);
        });
    });

    // ── crossTab: false + crossTab: true asymmetry ────────────────────────────

    describe('crossTab asymmetry (A=false, B=true)', () => {
        let originalIDB;

        beforeEach(() => {
            originalIDB = globalThis.indexedDB;
            globalThis.indexedDB = makeIDB({ myStore: {} });
        });

        afterEach(() => {
            globalThis.indexedDB = originalIDB;
        });

        test('A does not broadcast when crossTab: false, B receives nothing from A', async () => {
            const bcA = makeBroadcastChannelModule();
            const bcB = makeBroadcastChannelModule();
            const apiA = idbModule.factory(bcA);
            const apiB = idbModule.factory(bcB);

            const dbA = await apiA.open('mydb', 1, undefined, { crossTab: false });
            const dbB = await apiB.open('mydb', 1, undefined, { crossTab: true });

            const eventsB = [];
            dbB.listen.add('w', (evt) => eventsB.push(evt));

            // A mutates - but A has no channel, so nothing posted cross-tab
            await dbA.store('myStore').set('k', 'v');
            expect(bcA._createdChannels.length).toBe(0);

            // B's channel receives nothing (no cross:true events)
            expect(eventsB.filter(e => e.cross === true).length).toBe(0);
        });
    });
});
