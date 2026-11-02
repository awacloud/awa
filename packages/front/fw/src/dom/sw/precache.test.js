// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, afterEach } from 'bun:test';
import { precache } from './precache.js';
import { cache } from './cache.js';

// ---------------------------------------------------------------------------
// Harness — a fake worker scope, CacheStorage and network
// ---------------------------------------------------------------------------

const ORIGIN = 'https://app.test';
const PREFIX = 'my-app-';

/** A Cache over a Map of URL → body text. */
function fakeCache() {
    const entries = new Map();
    const key = (r) => (typeof r === 'string' ? r : r.url);
    return {
        entries,
        async match(r, o = {}) {
            const url = new URL(key(r), ORIGIN);
            if (o.ignoreSearch) url.search = '';
            const hit = entries.get(url.href);
            return hit === undefined ? undefined : new Response(hit);
        },
        async put(r, res) { entries.set(new URL(key(r), ORIGIN).href, await res.text()); },
        async addAll(urls) {
            for (const u of urls) {
                const res = await globalThis.fetch({ method: 'GET', url: new URL(u, `${ORIGIN}/`).href });
                entries.set(new URL(u, `${ORIGIN}/`).href, await res.text());
            }
        },
        async keys() { return [...entries.keys()]; },
        async delete(r) { return entries.delete(key(r)); }
    };
}

const saved = { caches: globalThis.caches, fetch: globalThis.fetch };

/** A worker scope (passed explicitly), plus global caches and network; records what the worker did. */
function scope({ active = false, network = {} } = {}) {
    const listeners = {};
    const added = [];
    const stores = new Map();
    const did = { skipWaiting: 0, claim: 0, fetched: [] };
    const self = {
        location: new URL(`${ORIGIN}/sw.js`),
        registration: { active: active ? {} : null },
        clients: { claim: async () => { did.claim++; } },
        skipWaiting: async () => { did.skipWaiting++; },
        addEventListener: (type, fn) => { added.push(type); listeners[type] = fn; }
    };
    globalThis.caches = /** @type {any} */ ({
        async open(name) { if (!stores.has(name)) stores.set(name, fakeCache()); return stores.get(name); },
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); },
        async has(name) { return stores.has(name); },
        async match() { return undefined; }
    });
    globalThis.fetch = /** @type {any} */ (async (r) => {
        const url = typeof r === 'string' ? r : r.url;
        did.fetched.push(url);
        if (!(url in network)) throw new TypeError('offline');
        const body = network[url];
        return typeof body === 'object' ? new Response(body.text, { status: body.status }) : new Response(body, { status: 200 });
    });
    return { self, listeners, added, stores, did, network };
}

/** Dispatch an event whose work is `waitUntil` / `respondWith`, and wait for it. */
async function dispatch(sc, type, init = {}) {
    let work = Promise.resolve(undefined);
    const event = {
        ...init,
        waitUntil(p) { work = p; },
        respondWith(p) { work = p; }
    };
    sc.listeners[type](event);
    return work;
}

const get = (path, mode = 'cors') => ({ method: 'GET', url: `${ORIGIN}${path}`, mode });

/** Build and listen an instance over the scope. */
function make(sc, opts = {}) {
    return precache.factory(cache.factory()).create({ scope: sc.self, prefix: PREFIX, version: 'v1', urls: ['./'], ...opts }).listen();
}

afterEach(() => {
    globalThis.caches = saved.caches;
    globalThis.fetch = saved.fetch;
});

const files = { [`${ORIGIN}/`]: 'page v1', [`${ORIGIN}/src/main.js`]: 'code v1', [`${ORIGIN}/LICENSE`]: 'licence' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('precache module', () => {
    test('should have correct module metadata', () => {
        expect(precache.name).toBe('precache');
        expect(precache.dependencies).toEqual(['cache']);
        expect(precache.deps.map((d) => d.name)).toEqual(['cache']);
        expect(precache.type).toBe('fw.dom.sw');
        expect(precache.version).toBe('1.0.0');
        expect(typeof precache.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = precache.factory(cache.factory());
            expect(Object.keys(inst)).toEqual(['create', 'DEFAULT_MESSAGES']);
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('DEFAULT_MESSAGES', () => {
        test('is the frozen wire protocol shared with swUpdate', () => {
            const { DEFAULT_MESSAGES } = precache.factory(cache.factory());
            expect(DEFAULT_MESSAGES).toEqual({ skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' });
            expect(Object.isFrozen(DEFAULT_MESSAGES)).toBe(true);
        });
    });

    describe('create', () => {
        const pc = precache.factory(cache.factory());
        const ok = () => ({ scope: scope().self, prefix: PREFIX, version: 'v1', urls: ['./'] });

        test('throws on each invalid option', () => {
            expect(() => pc.create(/** @type {any} */ (undefined))).toThrow(TypeError);
            expect(() => pc.create({ ...ok(), scope: {} })).toThrow(/^precache\.create: scope/);
            expect(() => pc.create({ ...ok(), scope: null })).toThrow(TypeError);
            expect(() => pc.create({ ...ok(), prefix: '' })).toThrow(new TypeError('precache.create: prefix must be a non-empty string'));
            expect(() => pc.create({ ...ok(), prefix: 3 })).toThrow(TypeError);
            expect(() => pc.create({ ...ok(), version: '' })).toThrow(new TypeError('precache.create: version must be a non-empty string'));
            expect(() => pc.create({ ...ok(), urls: './' })).toThrow(new TypeError('precache.create: urls must be an array of strings'));
            expect(() => pc.create({ ...ok(), urls: ['./', 4] })).toThrow(TypeError);
            expect(() => pc.create({ ...ok(), strategy: 'cache-first' })).toThrow(new TypeError('precache.create: strategy must be a function'));
            expect(() => pc.create({ ...ok(), takeOver: 'sometimes' })).toThrow(/^precache\.create: takeOver/);
        });

        test('accepts every takeOver value and an empty url list', () => {
            for (const takeOver of ['first-install', 'always', 'never']) {
                expect(pc.create({ ...ok(), takeOver }).cacheName).toBe(`${PREFIX}v1`);
            }
            expect(pc.create({ ...ok(), urls: [] }).cacheName).toBe(`${PREFIX}v1`);
        });

        test('cacheName is prefix + version; the instance shape', () => {
            const inst = pc.create({ ...ok(), version: 'abc' });
            expect(inst.cacheName).toBe(`${PREFIX}abc`);
            expect(Object.keys(inst)).toEqual(['cacheName', 'handlers', 'cacheFirst', 'networkFirst', 'listen']);
            expect(Object.keys(inst.handlers)).toEqual(['install', 'activate', 'fetch', 'message']);
        });
    });

    describe('listen', () => {
        test('registers the four listeners once (idempotent) and returns the instance', () => {
            const sc = scope();
            const inst = precache.factory(cache.factory()).create({ scope: sc.self, prefix: PREFIX, version: 'v1', urls: [] });
            expect(inst.listen()).toBe(inst);
            expect(inst.listen()).toBe(inst);
            expect(sc.added).toEqual(['install', 'activate', 'fetch', 'message']);
        });

        test('three listeners without messages', () => {
            const sc = scope();
            make(sc, { messages: null });
            expect(sc.added).toEqual(['install', 'activate', 'fetch']);
        });
    });

    describe('install', () => {
        test('pre-caches the release; the first install takes over', async () => {
            const sc = scope({ network: { ...files } });
            make(sc, { urls: ['./', 'src/main.js', 'LICENSE'] });
            await dispatch(sc, 'install');
            expect([...sc.stores.keys()]).toEqual([`${PREFIX}v1`]);
            expect([...(await sc.stores.get(`${PREFIX}v1`).keys())].sort()).toEqual(Object.keys(files).sort());
            expect(sc.did.skipWaiting).toBe(1);
        });

        test('a later release installs and WAITS: no take-over with an active registration', async () => {
            const sc = scope({ active: true, network: { ...files } });
            make(sc, { version: 'v2' });
            await dispatch(sc, 'install');
            expect(sc.did.skipWaiting).toBe(0);
        });

        test('takeOver always skips waiting even with an active registration', async () => {
            const sc = scope({ active: true, network: { ...files } });
            make(sc, { takeOver: 'always' });
            await dispatch(sc, 'install');
            expect(sc.did.skipWaiting).toBe(1);
        });

        test('takeOver never waits even on the first install', async () => {
            const sc = scope({ network: { ...files } });
            make(sc, { takeOver: 'never' });
            await dispatch(sc, 'install');
            expect(sc.did.skipWaiting).toBe(0);
            expect([...sc.stores.keys()]).toEqual([`${PREFIX}v1`]);
        });
    });

    describe('activate', () => {
        test('deletes this prefix\'s other caches only, then claims the pages', async () => {
            const sc = scope({ network: { ...files } });
            for (const name of [`${PREFIX}old`, 'other-app-x', 'someone-else']) await globalThis.caches.open(name);
            make(sc, { version: 'v3' });
            await dispatch(sc, 'install');
            await dispatch(sc, 'activate');
            expect([...sc.stores.keys()].sort()).toEqual([`${PREFIX}v3`, 'other-app-x', 'someone-else'].sort());
            expect(sc.did.claim).toBe(1);
        });

        test('claim: false does not claim', async () => {
            const sc = scope({ network: { ...files } });
            make(sc, { claim: false });
            await dispatch(sc, 'activate');
            expect(sc.did.claim).toBe(0);
        });
    });

    describe('cacheFirst', () => {
        test('serves the release even when the network has newer bytes', async () => {
            const sc = scope({ network: { ...files } });
            make(sc, { urls: ['./', 'src/main.js'] });
            await dispatch(sc, 'install');
            sc.network[`${ORIGIN}/src/main.js`] = 'code v2';
            sc.did.fetched.length = 0;
            const res = await dispatch(sc, 'fetch', { request: get('/src/main.js') });
            expect(await res.text()).toBe('code v1');
            expect(sc.did.fetched).toEqual([]);
        });

        test('a navigation miss gets the navigationFallback, whatever its query; offline too', async () => {
            const sc = scope({ network: { ...files } });
            make(sc);
            await dispatch(sc, 'install');
            for (const key of Object.keys(sc.network)) delete sc.network[key];
            const res = await dispatch(sc, 'fetch', { request: get('/?launch=1', 'navigate') });
            expect(await res.text()).toBe('page v1');
            const deep = await dispatch(sc, 'fetch', { request: get('/some/route', 'navigate') });
            expect(await deep.text()).toBe('page v1');
        });

        test('a custom navigationFallback', async () => {
            const sc = scope({ network: { [`${ORIGIN}/app.html`]: 'app shell' } });
            make(sc, { urls: ['app.html'], navigationFallback: 'app.html' });
            await dispatch(sc, 'install');
            const res = await dispatch(sc, 'fetch', { request: get('/route', 'navigate') });
            expect(await res.text()).toBe('app shell');
        });

        test('navigationFallback: null sends a navigation miss to the network', async () => {
            const sc = scope({ network: { ...files, [`${ORIGIN}/route`]: 'from network' } });
            make(sc, { navigationFallback: null });
            await dispatch(sc, 'install');
            const res = await dispatch(sc, 'fetch', { request: get('/route', 'navigate') });
            expect(await res.text()).toBe('from network');
            expect(sc.did.fetched).toContain(`${ORIGIN}/route`);
        });

        test('a file outside the list comes from the network and is kept; offline and unknown is an error', async () => {
            const sc = scope({ network: { ...files, [`${ORIGIN}/extra.txt`]: 'extra' } });
            make(sc);
            await dispatch(sc, 'install');
            const res = await dispatch(sc, 'fetch', { request: get('/extra.txt') });
            expect(await res.text()).toBe('extra');
            await Bun.sleep(0);
            expect(await (await sc.stores.get(`${PREFIX}v1`).match(`${ORIGIN}/extra.txt`))?.text()).toBe('extra');
            const miss = await dispatch(sc, 'fetch', { request: get('/nowhere') });
            expect(miss.type).toBe('error');
        });

        test('a non-200 network answer is returned but not kept', async () => {
            const sc = scope({ network: { [`${ORIGIN}/gone`]: { text: 'not found', status: 404 } } });
            make(sc, { urls: [] });
            const res = await dispatch(sc, 'fetch', { request: get('/gone') });
            expect(res.status).toBe(404);
            await Bun.sleep(0);
            expect(await sc.stores.get(`${PREFIX}v1`).match(`${ORIGIN}/gone`)).toBe(undefined);
        });

        test('cacheRuntime: false keeps nothing', async () => {
            const sc = scope({ network: { [`${ORIGIN}/extra.txt`]: 'extra' } });
            make(sc, { urls: [], cacheRuntime: false });
            const res = await dispatch(sc, 'fetch', { request: get('/extra.txt') });
            expect(await res.text()).toBe('extra');
            await Bun.sleep(0);
            expect(sc.stores.get(`${PREFIX}v1`).entries.size).toBe(0);
        });

        test('a failing cache put is swallowed', async () => {
            const sc = scope({ network: { [`${ORIGIN}/extra.txt`]: 'extra' } });
            const inst = make(sc, { urls: [] });
            const store = await globalThis.caches.open(inst.cacheName);
            store.put = async () => { throw new Error('quota'); };
            const res = await inst.cacheFirst(/** @type {any} */ (get('/extra.txt')));
            expect(await res.text()).toBe('extra');
            await Bun.sleep(0);
        });
    });

    describe('networkFirst', () => {
        const nf = (sc, opts = {}) => make(sc, { urls: [], strategy: () => 'network-first', ...opts });

        test('serves the network and keeps a 200 copy; offline, the copy answers', async () => {
            const sc = scope({ network: { [`${ORIGIN}/src/main.js`]: 'disk v1' } });
            nf(sc);
            expect(await (await dispatch(sc, 'fetch', { request: get('/src/main.js') })).text()).toBe('disk v1');
            sc.network[`${ORIGIN}/src/main.js`] = 'disk v2';
            expect(await (await dispatch(sc, 'fetch', { request: get('/src/main.js') })).text()).toBe('disk v2');
            await Bun.sleep(0);
            delete sc.network[`${ORIGIN}/src/main.js`];
            expect(await (await dispatch(sc, 'fetch', { request: get('/src/main.js') })).text()).toBe('disk v2');
        });

        test('an offline navigation matches its copy ignoring the query', async () => {
            const sc = scope({ network: { [`${ORIGIN}/`]: 'page' } });
            nf(sc);
            await dispatch(sc, 'fetch', { request: get('/', 'navigate') });
            await Bun.sleep(0);
            delete sc.network[`${ORIGIN}/`];
            const res = await dispatch(sc, 'fetch', { request: get('/?x=1', 'navigate') });
            expect(await res.text()).toBe('page');
        });

        test('nothing cached and offline is an error', async () => {
            const sc = scope();
            nf(sc);
            const res = await dispatch(sc, 'fetch', { request: get('/nowhere') });
            expect(res.type).toBe('error');
        });

        test('a non-200 answer is not kept; cacheRuntime: false keeps nothing', async () => {
            const sc = scope({ network: { [`${ORIGIN}/gone`]: { text: 'no', status: 404 }, [`${ORIGIN}/ok`]: 'ok' } });
            nf(sc, { cacheRuntime: false });
            expect((await dispatch(sc, 'fetch', { request: get('/gone') })).status).toBe(404);
            expect(await (await dispatch(sc, 'fetch', { request: get('/ok') })).text()).toBe('ok');
            await Bun.sleep(0);
            expect(sc.stores.has(`${PREFIX}v1`)).toBe(false);
        });

        test('a failing cache open is swallowed', async () => {
            const sc = scope({ network: { [`${ORIGIN}/ok`]: 'ok' } });
            const inst = nf(sc);
            globalThis.caches.open = async () => { throw new Error('broken'); };
            const res = await inst.networkFirst(/** @type {any} */ (get('/ok')));
            expect(await res.text()).toBe('ok');
            await Bun.sleep(0);
        });
    });

    describe('fetch', () => {
        test('strategy receives (request, url); pass leaves respondWith uncalled', async () => {
            const sc = scope({ network: { ...files } });
            const seen = [];
            make(sc, { strategy: (request, url) => { seen.push([request, url]); return 'pass'; } });
            const request = get('/src/main.js?v=2');
            let responded = false;
            sc.listeners.fetch({ request, respondWith() { responded = true; }, waitUntil() {} });
            expect(responded).toBe(false);
            expect(seen.length).toBe(1);
            expect(seen[0][0] === request).toBe(true);
            expect(seen[0][1] instanceof URL).toBe(true);
            expect(seen[0][1].href).toBe(`${ORIGIN}/src/main.js?v=2`);
        });

        test('strategy picks per request', async () => {
            const sc = scope({ network: { ...files } });
            make(sc, { urls: ['src/main.js'], strategy: (_r, url) => (url.pathname.startsWith('/api/') ? 'network-first' : 'cache-first') });
            await dispatch(sc, 'install');
            sc.network[`${ORIGIN}/src/main.js`] = 'code v2';
            sc.network[`${ORIGIN}/api/x`] = 'live';
            expect(await (await dispatch(sc, 'fetch', { request: get('/src/main.js') })).text()).toBe('code v1');
            expect(await (await dispatch(sc, 'fetch', { request: get('/api/x') })).text()).toBe('live');
        });

        test('other origins and other methods are left to the browser', () => {
            const sc = scope({ network: { ...files } });
            let calls = 0;
            make(sc, { strategy: () => { calls++; return 'cache-first'; } });
            let responded = false;
            const ev = (request) => ({ request, respondWith() { responded = true; }, waitUntil() {} });
            sc.listeners.fetch(ev({ method: 'GET', url: 'https://elsewhere.test/x', mode: 'cors' }));
            sc.listeners.fetch(ev({ method: 'POST', url: `${ORIGIN}/`, mode: 'cors' }));
            expect(responded).toBe(false);
            expect(calls).toBe(0);
        });
    });

    describe('message', () => {
        test('skipWaiting takes over', async () => {
            const sc = scope({ active: true });
            make(sc);
            await dispatch(sc, 'message', { data: { type: 'awa-sw-skip-waiting' } });
            expect(sc.did.skipWaiting).toBe(1);
        });

        test('version answers on the first port', async () => {
            const sc = scope();
            make(sc, { version: 'v7' });
            const answers = [];
            await dispatch(sc, 'message', { data: { type: 'awa-sw-version' }, ports: [{ postMessage: (m) => answers.push(m) }] });
            expect(answers).toEqual([{ version: 'v7' }]);
        });

        test('version without a port, unknown types and empty data are ignored', async () => {
            const sc = scope();
            make(sc);
            let waited = false;
            const ev = (init) => ({ ...init, waitUntil() { waited = true; } });
            sc.listeners.message(ev({ data: { type: 'awa-sw-version' } }));
            sc.listeners.message(ev({ data: { type: 'awa-sw-version' }, ports: [] }));
            sc.listeners.message(ev({ data: { type: 'something-else' } }));
            sc.listeners.message(ev({ data: null }));
            sc.listeners.message(ev({}));
            expect(waited).toBe(false);
            expect(sc.did.skipWaiting).toBe(0);
        });

        test('custom messages', async () => {
            const sc = scope();
            make(sc, { version: 'r9', messages: { skipWaiting: 'go', version: 'which' } });
            await dispatch(sc, 'message', { data: { type: 'go' } });
            expect(sc.did.skipWaiting).toBe(1);
            const answers = [];
            await dispatch(sc, 'message', { data: { type: 'which' }, ports: [{ postMessage: (m) => answers.push(m) }] });
            expect(answers).toEqual([{ version: 'r9' }]);
            await dispatch(sc, 'message', { data: { type: 'awa-sw-skip-waiting' } });
            expect(sc.did.skipWaiting).toBe(1);
        });

        test('messages: null makes the handler inert', () => {
            const sc = scope();
            const inst = make(sc, { messages: null });
            let waited = false;
            inst.handlers.message({ data: { type: 'awa-sw-skip-waiting' }, waitUntil() { waited = true; } });
            expect(waited).toBe(false);
        });
    });
});
