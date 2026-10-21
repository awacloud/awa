// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `public/sw.js` in a fake worker scope: a release pre-caches
 * its files, the first install takes over at once, a later one waits for
 * the page's word, the shell is served cache-first (the network never
 * replaces a running release), activation deletes only this app's older
 * caches, and the sources (`dev`) stay network-first.
 *
 * @module notepad/tests/sw.test
 */
import { describe, test, expect, afterEach } from 'bun:test';

const ORIGIN = 'https://notepad.test';
const VERSION_GLOBAL = '__AWA_NOTEPAD_VERSION__';
const PRECACHE_GLOBAL = '__AWA_NOTEPAD_PRECACHE__';
const PREFIX = 'awa-notepad-';
const WORKER = '../public/sw.js';

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

/** A worker scope: listeners, caches, a network, and what the worker did. */
function scope({ active = false, network = {} } = {}) {
    const listeners = {};
    const stores = new Map();
    const did = { skipWaiting: 0, claim: 0, fetched: [] };
    const saved = { self: globalThis.self, caches: globalThis.caches, fetch: globalThis.fetch };
    globalThis.self = /** @type {any} */ ({
        location: new URL(`${ORIGIN}/sw.js`),
        registration: { active: active ? {} : null },
        clients: { claim: async () => { did.claim++; } },
        skipWaiting: async () => { did.skipWaiting++; },
        addEventListener: (type, fn) => { listeners[type] = fn; }
    });
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
        return new Response(network[url], { status: 200 });
    });
    return {
        listeners, stores, did, network,
        restore() { Object.assign(globalThis, saved); }
    };
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

let n = 0;
/** Load the worker as a release (`version`, `precache`) or from the sources (`null`). */
async function load(version, precache = ['./']) {
    if (version) {
        globalThis[VERSION_GLOBAL] = version;
        globalThis[PRECACHE_GLOBAL] = precache;
    } else {
        delete globalThis[VERSION_GLOBAL];
        delete globalThis[PRECACHE_GLOBAL];
    }
    await import(`${WORKER}?case=${++n}`);
}

const get = (path, mode = 'cors') => ({ method: 'GET', url: `${ORIGIN}${path}`, mode });

/** @type {ReturnType<typeof scope>|null} */
let sc = null;
afterEach(() => {
    sc?.restore();
    sc = null;
    delete globalThis[VERSION_GLOBAL];
    delete globalThis[PRECACHE_GLOBAL];
});

describe('a release', () => {
    const files = { [`${ORIGIN}/`]: 'page v1', [`${ORIGIN}/src/main.js`]: 'code v1', [`${ORIGIN}/LICENSE`]: 'licence' };

    test('install pre-caches the release, the licence texts included; the first install takes over', async () => {
        sc = scope({ network: { ...files } });
        await load('v1', ['./', 'src/main.js', 'LICENSE']);
        await dispatch(sc, 'install');
        expect([...sc.stores.keys()]).toEqual([`${PREFIX}v1`]);
        expect([...(await sc.stores.get(`${PREFIX}v1`).keys())].sort()).toEqual(Object.keys(files).sort());
        expect(sc.did.skipWaiting).toBe(1);
    });

    test('a later release installs and WAITS: no take-over without the page', async () => {
        sc = scope({ active: true, network: { ...files } });
        await load('v2', ['./', 'src/main.js']);
        await dispatch(sc, 'install');
        expect(sc.did.skipWaiting).toBe(0);
        await dispatch(sc, 'message', { data: { type: 'awa-sw-skip-waiting' } });
        expect(sc.did.skipWaiting).toBe(1);
    });

    test('the shell is served from the release, even when the network has newer bytes', async () => {
        sc = scope({ network: { ...files } });
        await load('v1', ['./', 'src/main.js']);
        await dispatch(sc, 'install');
        sc.network[`${ORIGIN}/src/main.js`] = 'code v2';
        sc.did.fetched.length = 0;
        const res = await dispatch(sc, 'fetch', { request: get('/src/main.js') });
        expect(await res.text()).toBe('code v1');
        expect(sc.did.fetched).toEqual([]);
    });

    test('a navigation inside the app gets the page, whatever its query; offline too', async () => {
        sc = scope({ network: { ...files } });
        await load('v1', ['./']);
        await dispatch(sc, 'install');
        for (const key of Object.keys(sc.network)) delete sc.network[key];
        const res = await dispatch(sc, 'fetch', { request: get('/?launch=1', 'navigate') });
        expect(await res.text()).toBe('page v1');
    });

    test('a file outside the list comes from the network and is kept; offline and unknown is an error', async () => {
        sc = scope({ network: { ...files, [`${ORIGIN}/extra.txt`]: 'extra' } });
        await load('v1', ['./']);
        await dispatch(sc, 'install');
        const res = await dispatch(sc, 'fetch', { request: get('/extra.txt') });
        expect(await res.text()).toBe('extra');
        await Bun.sleep(0);
        expect(await (await sc.stores.get(`${PREFIX}v1`).match(`${ORIGIN}/extra.txt`))?.text()).toBe('extra');
        const miss = await dispatch(sc, 'fetch', { request: get('/nowhere') });
        expect(miss.type).toBe('error');
    });

    test('activate deletes this app\'s older releases only, then claims the pages', async () => {
        sc = scope({ network: { ...files } });
        for (const name of [`${PREFIX}old`, 'awa-viewer-x', 'someone-else']) await globalThis.caches.open(name);
        await load('v3', ['./']);
        await dispatch(sc, 'install');
        await dispatch(sc, 'activate');
        expect([...sc.stores.keys()].sort()).toEqual([`${PREFIX}v3`, 'awa-viewer-x', 'someone-else'].sort());
        expect(sc.did.claim).toBe(1);
    });

    test('the worker tells a page which release it serves', async () => {
        sc = scope({ network: { ...files } });
        await load('v7');
        const answers = [];
        await dispatch(sc, 'message', { data: { type: 'awa-sw-version' }, ports: [{ postMessage: (m) => answers.push(m) }] });
        expect(answers).toEqual([{ version: 'v7' }]);
    });

    test('other origins and other methods are left to the browser', async () => {
        sc = scope({ network: { ...files } });
        await load('v1');
        let responded = false;
        const ev = (request) => ({ request, respondWith() { responded = true; }, waitUntil() {} });
        sc.listeners.fetch(ev({ method: 'GET', url: 'https://elsewhere.test/x', mode: 'cors' }));
        sc.listeners.fetch(ev({ method: 'POST', url: `${ORIGIN}/`, mode: 'cors' }));
        expect(responded).toBe(false);
    });
});

describe('the sources (dev)', () => {
    test('network first: the code on disk runs; offline, the last copy answers', async () => {
        sc = scope({ network: { [`${ORIGIN}/src/main.js`]: 'disk v1' } });
        await load(null);
        expect(await (await dispatch(sc, 'fetch', { request: get('/src/main.js') })).text()).toBe('disk v1');
        sc.network[`${ORIGIN}/src/main.js`] = 'disk v2';
        expect(await (await dispatch(sc, 'fetch', { request: get('/src/main.js') })).text()).toBe('disk v2');
        await Bun.sleep(0);
        delete sc.network[`${ORIGIN}/src/main.js`];
        expect(await (await dispatch(sc, 'fetch', { request: get('/src/main.js') })).text()).toBe('disk v2');
    });
});
