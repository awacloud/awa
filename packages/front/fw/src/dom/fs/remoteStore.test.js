// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { describe, test, expect, beforeEach } from 'bun:test';
import { remoteStore } from './remoteStore.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

/**
 * Ajax stub: simulates the ajax factory that returns a create(baseUrl, defaults) function.
 * Each method (get, put, del, post) is configurable via ajaxStub.mock.
 */
function makeAjaxStub() {
    const calls = [];
    const mock  = { get: null, put: null, del: null, post: null };

    function create(_baseUrl, _defaults) {
        return {
            get(endpoint, _opts) {
                calls.push({ method: 'GET', endpoint });
                return mock.get ? mock.get(endpoint) : Promise.resolve(null);
            },
            put(endpoint, body, _opts) {
                calls.push({ method: 'PUT', endpoint, body });
                return mock.put ? mock.put(endpoint, body) : Promise.resolve();
            },
            del(endpoint, _opts) {
                calls.push({ method: 'DELETE', endpoint });
                return mock.del ? mock.del(endpoint) : Promise.resolve();
            },
            post(endpoint, body, _opts) {
                calls.push({ method: 'POST', endpoint, body });
                return mock.post ? mock.post(endpoint, body) : Promise.resolve();
            }
        };
    }

    return { create, calls, mock };
}

/**
 * WS stub: simulates the ws factory that returns a create(opts) function.
 * Exposes handlers to trigger events manually from tests.
 */
function makeWsStub() {
    let _handlers = { open: () => {}, close: () => {}, message: () => {}, error: () => {} };
    let _closed    = false;
    const sentMessages = [];

    const connection = {
        on(event, fn)  { _handlers[event] = fn; return connection; },
        off(event)     { _handlers[event] = () => {}; return connection; },
        send(data)     { if (!_closed) sentMessages.push(data); return connection; },
        close()        { _closed = true; _handlers.close({}); },
        get isOpen()   { return !_closed; },
        // Test helpers
        _trigger(event, data) { _handlers[event](data); },
        get _sent() { return sentMessages; }
    };

    function create(_opts) {
        // Reset handlers for each new connection
        _handlers = { open: () => {}, close: () => {}, message: () => {}, error: () => {} };
        _closed = false;
        sentMessages.length = 0;
        return connection;
    }

    return { create, connection };
}

/**
 * Stub eventBus minimal.
 */
function makeEventBusStub() {
    const emitted = [];
    return {
        emit(topic, payload) { emitted.push({ topic, payload }); },
        on() { return () => {}; },
        _emitted: emitted
    };
}

// ---------------------------------------------------------------------------
// 1 - Metadata
// ---------------------------------------------------------------------------

describe('remoteStore module', () => {
    test('has correct metadata', () => {
        expect(remoteStore.name).toBe('remoteStore');
        expect(remoteStore.version).toBe('1.0.0');
        expect(remoteStore.type).toBe('fw.dom.fs');
        expect(remoteStore.dependencies).toEqual(['ajax', 'ws', 'eventBus']);
        expect(typeof remoteStore.factory).toBe('function');
    });

    // -----------------------------------------------------------------------
    // 2 - Factory API
    // -----------------------------------------------------------------------

    describe('factory', () => {
        test('returns object with create function', () => {
            const ajaxStub = makeAjaxStub();
            const wsStub   = makeWsStub();
            const ebStub   = makeEventBusStub();
            const inst = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            expect(typeof inst).toBe('object');
            expect(typeof inst.create).toBe('function');
        });

        test('create returns all expected methods', () => {
            const ajaxStub = makeAjaxStub();
            const wsStub   = makeWsStub();
            const ebStub   = makeEventBusStub();
            const api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            const store = api.create({ endpoint: 'https://api.example.com' });
            expect(typeof store.get).toBe('function');
            expect(typeof store.set).toBe('function');
            expect(typeof store.delete).toBe('function');
            expect(typeof store.list).toBe('function');
            expect(typeof store.batch).toBe('function');
            expect(typeof store.watch).toBe('function');
            expect(typeof store.connected).toBe('function');
            expect(typeof store.close).toBe('function');
        });

        test('create throws when endpoint missing', () => {
            const ajaxStub = makeAjaxStub();
            const wsStub   = makeWsStub();
            const ebStub   = makeEventBusStub();
            const api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            expect(() => api.create({})).toThrow();
            expect(() => api.create(null)).toThrow();
        });

        test('create throws on invalid transport', () => {
            const ajaxStub = makeAjaxStub();
            const wsStub   = makeWsStub();
            const ebStub   = makeEventBusStub();
            const api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            expect(() => api.create({ endpoint: 'http://x', transport: 'ftp' })).toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // 3 - Transport HTTP
    // -----------------------------------------------------------------------

    describe('HTTP transport', () => {
        let api, ajaxStub, store;

        beforeEach(() => {
            ajaxStub = makeAjaxStub();
            const wsStub = makeWsStub();
            const ebStub = makeEventBusStub();
            api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            store = api.create({ endpoint: 'https://api.example.com', transport: 'http' });
        });

        test('get issues GET request', async () => {
            ajaxStub.mock.get = () => Promise.resolve({ name: 'Alice' });
            const result = await store.get('user:1');
            expect(result).toEqual({ name: 'Alice' });
            const call = ajaxStub.calls.find(c => c.method === 'GET');
            expect(call).toBeDefined();
            expect(call.endpoint).toBe('user:1');
        });

        test('get returns null on 404', async () => {
            const err = new Error('Not found');
            err.status = 404;
            ajaxStub.mock.get = () => Promise.reject(err);
            const result = await store.get('missing');
            expect(result).toBeNull();
        });

        test('set issues PUT request', async () => {
            ajaxStub.mock.put = () => Promise.resolve();
            await store.set('user:1', { name: 'Alice' });
            const call = ajaxStub.calls.find(c => c.method === 'PUT');
            expect(call).toBeDefined();
            expect(call.endpoint).toBe('user:1');
            expect(call.body).toEqual({ name: 'Alice' });
        });

        test('delete issues DELETE request', async () => {
            ajaxStub.mock.del = () => Promise.resolve();
            await store.delete('user:1');
            const call = ajaxStub.calls.find(c => c.method === 'DELETE');
            expect(call).toBeDefined();
            expect(call.endpoint).toBe('user:1');
        });

        test('list issues GET with query params', async () => {
            ajaxStub.mock.get = (endpoint) => Promise.resolve({ keys: [], cursor: null });
            await store.list({ prefix: 'sess:', limit: 10, cursor: 'tok' });
            const call = ajaxStub.calls.find(c => c.method === 'GET');
            expect(call).toBeDefined();
            expect(call.endpoint).toContain('prefix=sess%3A');
            expect(call.endpoint).toContain('limit=10');
            expect(call.endpoint).toContain('cursor=tok');
        });

        test('list without params issues GET on root', async () => {
            ajaxStub.mock.get = () => Promise.resolve({ keys: [] });
            await store.list();
            const call = ajaxStub.calls.find(c => c.method === 'GET');
            expect(call).toBeDefined();
            // endpoint = '/' or empty
        });

        test('batch issues POST /batch with ops', async () => {
            ajaxStub.mock.post = () => Promise.resolve();
            const ops = [
                { op: 'set', key: 'a', value: 1 },
                { op: 'delete', key: 'b' }
            ];
            await store.batch(ops);
            const call = ajaxStub.calls.find(c => c.method === 'POST');
            expect(call).toBeDefined();
            expect(call.endpoint).toBe('batch');
            expect(call.body).toEqual({ ops });
        });

        test('connected returns true in HTTP mode', () => {
            expect(store.connected()).toBe(true);
        });

        test('close is a no-op in HTTP mode', () => {
            expect(() => store.close()).not.toThrow();
        });

        test('watch returns an off function (no-op) in HTTP mode', () => {
            const off = store.watch('sess:*', () => {});
            expect(typeof off).toBe('function');
            expect(() => off()).not.toThrow();
        });

        test('retries on TypeError (network error)', async () => {
            let callCount = 0;
            ajaxStub.mock.get = () => {
                callCount++;
                if (callCount === 1) return Promise.reject(new TypeError('Network error'));
                return Promise.resolve({ name: 'Bob' });
            };
            const result = await store.get('user:2');
            expect(result).toEqual({ name: 'Bob' });
            expect(callCount).toBe(2);
        });

        test('does not retry on HTTP errors', async () => {
            let callCount = 0;
            const err = new Error('Internal server error');
            err.status = 500;
            ajaxStub.mock.get = () => {
                callCount++;
                return Promise.reject(err);
            };
            await expect(store.get('fail')).rejects.toThrow('Internal server error');
            expect(callCount).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // 4 - WebSocket transport: RPC operations
    // -----------------------------------------------------------------------

    describe('WS transport - RPC', () => {
        let api, wsStub, ebStub, store, conn;

        beforeEach(() => {
            const ajaxStub = makeAjaxStub();
            wsStub = makeWsStub();
            ebStub = makeEventBusStub();
            api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            store = api.create({ endpoint: 'wss://api.example.com', transport: 'ws', auth: 'tok' });
            conn  = wsStub.connection;
            // Simulate open connection
            conn._trigger('open', {});
        });

        test('set sends RPC message and resolves on response', async () => {
            const promise = store.set('key1', 42);
            // Retrieve the sent message
            const rawMsg = conn._sent[conn._sent.length - 1];
            const msg = JSON.parse(rawMsg);
            expect(msg.op).toBe('set');
            expect(msg.key).toBe('key1');
            expect(msg.value).toBe(42);
            expect(typeof msg.id).toBe('number');
            // Simulate the server response
            conn._trigger('message', JSON.stringify({ id: msg.id, result: null }));
            await expect(promise).resolves.toBeNull();
        });

        test('get sends RPC message and resolves with result', async () => {
            const promise = store.get('key1');
            const rawMsg = conn._sent[conn._sent.length - 1];
            const msg = JSON.parse(rawMsg);
            expect(msg.op).toBe('get');
            expect(msg.key).toBe('key1');
            conn._trigger('message', JSON.stringify({ id: msg.id, result: { x: 1 } }));
            await expect(promise).resolves.toEqual({ x: 1 });
        });

        test('delete sends RPC delete message', async () => {
            const promise = store.delete('key1');
            const rawMsg = conn._sent[conn._sent.length - 1];
            const msg = JSON.parse(rawMsg);
            expect(msg.op).toBe('delete');
            expect(msg.key).toBe('key1');
            conn._trigger('message', JSON.stringify({ id: msg.id, result: null }));
            await expect(promise).resolves.toBeNull();
        });

        test('RPC rejects on error response', async () => {
            const promise = store.get('bad');
            const rawMsg = conn._sent[conn._sent.length - 1];
            const msg = JSON.parse(rawMsg);
            conn._trigger('message', JSON.stringify({ id: msg.id, error: 'Not found' }));
            await expect(promise).rejects.toThrow('Not found');
        });

        test('auth message sent on open', () => {
            // The first message sent is the auth message
            const authMsg = JSON.parse(conn._sent[0]);
            expect(authMsg.op).toBe('auth');
            expect(authMsg.token).toBe('tok');
        });

        test('connected returns true when open', () => {
            expect(store.connected()).toBe(true);
        });

        test('batch sends a single batch RPC message', async () => {
            const ops = [
                { op: 'set', key: 'a', value: 1 },
                { op: 'delete', key: 'b' }
            ];
            const promise = store.batch(ops);
            const rawMsg = conn._sent[conn._sent.length - 1];
            const msg = JSON.parse(rawMsg);
            expect(msg.op).toBe('batch');
            expect(msg.ops).toEqual(ops);
            conn._trigger('message', JSON.stringify({ id: msg.id, result: null }));
            await expect(promise).resolves.toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // 5 - watch (WS)
    // -----------------------------------------------------------------------

    describe('watch (WS)', () => {
        let api, wsStub, store, conn;

        beforeEach(() => {
            const ajaxStub = makeAjaxStub();
            wsStub = makeWsStub();
            const ebStub = makeEventBusStub();
            api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            store = api.create({ endpoint: 'wss://api.example.com', transport: 'ws' });
            conn  = wsStub.connection;
            conn._trigger('open', {});
        });

        test('watch receives change message matching pattern', () => {
            const received = [];
            store.watch('sess:*', msg => received.push(msg));
            conn._trigger('message', JSON.stringify({ op: 'change', key: 'sess:abc', value: 1 }));
            expect(received).toHaveLength(1);
            expect(received[0].key).toBe('sess:abc');
        });

        test('watch does not fire on non-matching key', () => {
            const received = [];
            store.watch('sess:*', msg => received.push(msg));
            conn._trigger('message', JSON.stringify({ op: 'change', key: 'other:abc', value: 1 }));
            expect(received).toHaveLength(0);
        });

        test('off unsubscribes the handler', () => {
            const received = [];
            const off = store.watch('sess:*', msg => received.push(msg));
            off();
            conn._trigger('message', JSON.stringify({ op: 'change', key: 'sess:abc', value: 1 }));
            expect(received).toHaveLength(0);
        });

        test('watch with exact key pattern', () => {
            const received = [];
            store.watch('user:1', msg => received.push(msg));
            conn._trigger('message', JSON.stringify({ op: 'change', key: 'user:1' }));
            conn._trigger('message', JSON.stringify({ op: 'change', key: 'user:2' }));
            expect(received).toHaveLength(1);
        });

        test('wildcard * matches any key', () => {
            const received = [];
            store.watch('*', msg => received.push(msg));
            conn._trigger('message', JSON.stringify({ op: 'change', key: 'anything' }));
            expect(received).toHaveLength(1);
        });
    });

    // -----------------------------------------------------------------------
    // 6 - Reconnexion WS
    // -----------------------------------------------------------------------

    describe('WS reconnection', () => {
        test('emits remoteStore:reconnect on close and attempts reconnection', () => {
            const ajaxStub = makeAjaxStub();
            const wsStub   = makeWsStub();
            const ebStub   = makeEventBusStub();
            const api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            const store = api.create({ endpoint: 'wss://api.example.com', transport: 'ws' });
            const conn = wsStub.connection;

            conn._trigger('open', {});
            // Simulate socket close
            conn._trigger('close', {});

            // The event must have been emitted
            expect(ebStub._emitted.some(e => e.topic === 'remoteStore:reconnect')).toBe(true);
            const evt = ebStub._emitted.find(e => e.topic === 'remoteStore:reconnect');
            expect(evt.payload.attempt).toBe(1);
            expect(evt.payload.endpoint).toBe('wss://api.example.com');

            store.close();
        });

        test('connected returns false after close', () => {
            const ajaxStub = makeAjaxStub();
            const wsStub   = makeWsStub();
            const ebStub   = makeEventBusStub();
            const api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            const store = api.create({ endpoint: 'wss://api.example.com', transport: 'ws' });
            const conn = wsStub.connection;

            conn._trigger('open', {});
            expect(store.connected()).toBe(true);

            store.close();
            expect(store.connected()).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // 7 - close() stops reconnection
    // -----------------------------------------------------------------------

    describe('close()', () => {
        test('close stops reconnection and rejects pending RPCs', async () => {
            const ajaxStub = makeAjaxStub();
            const wsStub   = makeWsStub();
            const ebStub   = makeEventBusStub();
            const api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            const store = api.create({ endpoint: 'wss://api.example.com', transport: 'ws' });
            const conn = wsStub.connection;

            conn._trigger('open', {});

            // Send a RPC without responding
            const pending = store.get('key');
            // Close - the pending must be rejected
            store.close();

            await expect(pending).rejects.toThrow();
        });

        test('close prevents further reconnection events', () => {
            const ajaxStub = makeAjaxStub();
            const wsStub   = makeWsStub();
            const ebStub   = makeEventBusStub();
            const api = remoteStore.factory(ajaxStub.create, wsStub.create, ebStub);
            const store = api.create({ endpoint: 'wss://api.example.com', transport: 'ws' });
            const conn = wsStub.connection;

            conn._trigger('open', {});
            store.close();

            const emittedBefore = ebStub._emitted.length;
            // Simulate a close after the store is closed
            // (should no longer trigger reconnect)
            conn._trigger('close', {});
            expect(ebStub._emitted.length).toBe(emittedBefore);
        });
    });
});
