// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The notepad's service worker (module worker): offline once
 * visited, same origin, GET only, and updates that never break a running
 * page.
 *
 * A build (`tools/build-sw.js`) stamps the worker with the dist's content
 * version and the list of every file the app needs — the page, the bundle,
 * the sheets, the icons, and the licence texts, so the About panel's
 * licences open offline too. Install PRE-CACHES that list into a cache
 * named after the version.
 *
 * The versioned shell is served CACHE-FIRST: the page and its code always
 * come from one release, online or offline, and a slow network never
 * delays the start. A new release is found by the browser's own worker
 * update check, or by the page's "Check for updates": it installs into its
 * own cache and then WAITS — it never takes over a page running the
 * previous release. The page shows "A new version is ready"; when the user
 * accepts, the page asks this worker to take over (`awa-sw-skip-waiting`)
 * and reloads. Only then does `activate` delete the previous release's
 * cache — only caches of this app, never the page's other storage.
 *
 * The very first install (no release active yet) takes over at once, so
 * the first visit already works offline. From the sources (`dev`, nothing
 * stamped) every request goes to the network first, so development always
 * runs the code on disk.
 *
 * Text files never pass through here: the notepad reads and writes them
 * on the device, it never requests them. Before it accepts an update, the
 * page keeps the unsaved text as a draft (`app.js`).
 *
 * The only import is fw's worker-safe `cache` descriptor; the relative
 * import resolves against the repo layout in development, and
 * `tools/build-sw.js` bundles the worker into a dist.
 *
 * @module notepad/sw
 */
import { cache as cacheMod } from '../../../../packages/front/fw/src/dom/sw/cache.js';

/* global __AWA_NOTEPAD_VERSION__, __AWA_NOTEPAD_PRECACHE__ */
/** The release: the dist's content hash (tools/build-sw.js), `dev` from the sources. */
const VERSION = typeof __AWA_NOTEPAD_VERSION__ === 'string' ? __AWA_NOTEPAD_VERSION__ : 'dev';
/** The app's files, relative to the worker (tools/build-sw.js); the page alone from the sources. */
const PRECACHE = typeof __AWA_NOTEPAD_PRECACHE__ === 'object' ? __AWA_NOTEPAD_PRECACHE__ : ['./'];
const PREFIX = 'awa-notepad-';
const CACHE_NAME = PREFIX + VERSION;
/** The messages a page sends. */
const SKIP_WAITING = 'awa-sw-skip-waiting';
const GET_VERSION = 'awa-sw-version';
const caches_ = cacheMod.factory();

/** @param {Request} request */
async function networkFirst(request) {
    let response;
    try {
        response = await fetch(request);
    } catch {
        response = null;
    }
    if (response) {
        if (response.status === 200) {
            const copy = response.clone();
            caches_.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
        }
        return response;
    }
    const c = await caches_.open(CACHE_NAME);
    return (await c.match(request, { ignoreSearch: request.mode === 'navigate' })) || Response.error();
}

/**
 * The release's own copy first; a navigation inside the app gets the page.
 * A file outside the pre-cached list goes to the network and is kept.
 * @param {Request} request
 */
async function cacheFirst(request) {
    const c = await caches_.open(CACHE_NAME);
    const navigate = request.mode === 'navigate';
    const hit = (await c.match(request, { ignoreSearch: navigate }))
        || (navigate ? await c.match(new URL('./', self.location.href).href) : undefined);
    if (hit) return hit;
    let response;
    try {
        response = await fetch(request);
    } catch {
        return Response.error();
    }
    if (response.status === 200) {
        const copy = response.clone();
        c.put(request, copy).catch(() => {});
    }
    return response;
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches_.open(CACHE_NAME)
            .then((c) => c.addAll(PRECACHE))
            // First install: nothing to replace, take over now (offline from the first visit).
            .then(() => (self.registration.active ? undefined : self.skipWaiting()))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches_.keys()
            .then((names) => Promise.all(names
                .filter((n) => n.startsWith(PREFIX) && n !== CACHE_NAME)
                .map((n) => caches_.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    const type = event.data && event.data.type;
    if (type === SKIP_WAITING) {
        event.waitUntil(self.skipWaiting());
    } else if (type === GET_VERSION && event.ports && event.ports[0]) {
        event.ports[0].postMessage({ version: VERSION });
    }
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    event.respondWith(VERSION === 'dev' ? networkFirst(request) : cacheFirst(request));
});
