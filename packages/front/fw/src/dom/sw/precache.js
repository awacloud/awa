// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Worker-side release precache for a service worker, over the `cache` module.
 *
 * `install` pre-caches a release's files into a cache named after its
 * version (`prefix + version`); the very first install (no active
 * registration) takes over at once, a later one WAITS for the page's word.
 * `activate` deletes this prefix's older caches — never another app's — and
 * claims the pages. `fetch` serves same-origin GET requests cache-first (the
 * release's own copy, a navigation miss falling back to the page) or
 * network-first (the network, its last copy when offline), as chosen per
 * request by a strategy function. `message` answers the page-side `swUpdate`
 * protocol: skip waiting, and report the release on a transferred port.
 *
 * Worker-safe: runs inside a ServiceWorkerGlobalScope. The scope is passed
 * explicitly (`scope: self`), never captured.
 *
 * @example
 * // sw.js (module worker)
 * import { cache } from './fw/dom/sw/cache.js';
 * import { precache } from './fw/dom/sw/precache.js';
 * precache.factory(cache.factory()).create({
 *     scope: self, prefix: 'my-app-', version: 'v1', urls: ['./', 'main.js'],
 * }).listen();
 */
import { cache } from './cache.js';

/**
 * Strategy chosen for one request.
 * @typedef {'cache-first'|'network-first'|'pass'} StrategyKind
 */

/**
 * The message types the worker answers.
 * @typedef {object} PrecacheMessages
 * @property {string} skipWaiting - Take over now (`skipWaiting()`).
 * @property {string} version - Answer `{ version }` on the first transferred port.
 */

/**
 * Options of `create()`.
 * @typedef {object} PrecacheOptions
 * @property {any} scope - The worker global scope (`self`); required.
 * @property {string} prefix - Cache-name prefix owned by this app.
 * @property {string} version - The release; the cache is `prefix + version`.
 * @property {string[]} urls - The release's files, relative to the worker.
 * @property {(request: Request, url: URL) => StrategyKind} [strategy] - Per-request strategy (default always `'cache-first'`).
 * @property {string|null} [navigationFallback] - URL served for a navigation miss in cache-first (default `'./'`; `null` goes to the network).
 * @property {boolean} [cacheRuntime] - Keep a copy of 200 network responses (default `true`).
 * @property {'first-install'|'always'|'never'} [takeOver] - When install calls `skipWaiting()` (default `'first-install'`).
 * @property {boolean} [claim] - `clients.claim()` on activate (default `true`).
 * @property {PrecacheMessages|null} [messages] - The message protocol (default `DEFAULT_MESSAGES`; `null` installs no message listener).
 */

/**
 * The event handlers of one instance.
 * @typedef {object} PrecacheHandlers
 * @property {(event: any) => void} install - Pre-cache, then take over per `takeOver`.
 * @property {(event: any) => void} activate - Delete this prefix's other caches, then claim.
 * @property {(event: any) => void} fetch - Route a same-origin GET through the strategy.
 * @property {(event: any) => void} message - Answer skip-waiting and version requests.
 */

/**
 * The instance returned by `create()`.
 * @typedef {object} PrecacheInstance
 * @property {string} cacheName - `prefix + version`.
 * @property {PrecacheHandlers} handlers - The event handlers, callable directly.
 * @property {(request: Request) => Promise<Response>} cacheFirst - The release's copy first, then the network.
 * @property {(request: Request) => Promise<Response>} networkFirst - The network first, then the last copy.
 * @property {() => PrecacheInstance} listen - Attach the handlers to the scope (idempotent).
 */

/**
 * Public surface returned by the precache factory.
 * @typedef {object} PrecacheAPI
 * @property {(opts: PrecacheOptions) => PrecacheInstance} create - Build a release precache for one worker scope.
 * @property {Readonly<PrecacheMessages>} DEFAULT_MESSAGES - The default wire protocol (shared with `swUpdate`).
 */

export const precache = {
    name: 'precache',
    version: '1.0.0',
    type: 'fw.dom.sw',
    dependencies: ['cache'],
    deps: [cache],

    /**
     * @param {{open: (name: string) => Promise<any>, delete: (name: string) => Promise<boolean>, keys: () => Promise<string[]>}} cache - Module cache (fw)
     * @returns {PrecacheAPI}
     */
    factory(cache) {
        const DEFAULT_MESSAGES = Object.freeze({ skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' });
        const TAKE_OVER = ['first-install', 'always', 'never'];

        /**
         * @param {unknown} v
         * @returns {boolean}
         * @private
         */
        function isNonEmptyString(v) {
            return typeof v === 'string' && v !== '';
        }

        /**
         * Build a release precache for one worker scope.
         * @param {PrecacheOptions} opts
         * @returns {PrecacheInstance}
         * @throws {TypeError} When an option is invalid (see the guards).
         */
        function create({
            scope,
            prefix,
            version,
            urls,
            strategy = () => 'cache-first',
            navigationFallback = './',
            cacheRuntime = true,
            takeOver = 'first-install',
            claim = true,
            messages = DEFAULT_MESSAGES,
        } = /** @type {any} */ ({})) {
            if (!scope || typeof scope.addEventListener !== 'function') {
                throw new TypeError('precache.create: scope must be an EventTarget (the worker global scope)');
            }
            if (!isNonEmptyString(prefix)) throw new TypeError('precache.create: prefix must be a non-empty string');
            if (!isNonEmptyString(version)) throw new TypeError('precache.create: version must be a non-empty string');
            if (!Array.isArray(urls) || !urls.every((u) => typeof u === 'string')) {
                throw new TypeError('precache.create: urls must be an array of strings');
            }
            if (typeof strategy !== 'function') throw new TypeError('precache.create: strategy must be a function');
            if (!TAKE_OVER.includes(takeOver)) {
                throw new TypeError(`precache.create: takeOver must be one of ${TAKE_OVER.join(', ')}`);
            }

            const cacheName = prefix + version;
            let listening = false;

            /**
             * @param {Request} request
             * @returns {Promise<Response>}
             */
            async function cacheFirst(request) {
                const c = await cache.open(cacheName);
                const navigate = request.mode === 'navigate';
                const hit = (await c.match(request, { ignoreSearch: navigate }))
                    || (navigate && navigationFallback
                        ? await c.match(new URL(navigationFallback, scope.location.href).href)
                        : undefined);
                if (hit) return hit;
                let response;
                try {
                    response = await fetch(request);
                } catch {
                    return Response.error();
                }
                if (response.status === 200 && cacheRuntime) {
                    c.put(request, response.clone()).catch(() => {});
                }
                return response;
            }

            /**
             * @param {Request} request
             * @returns {Promise<Response>}
             */
            async function networkFirst(request) {
                let response;
                try {
                    response = await fetch(request);
                } catch {
                    response = null;
                }
                if (response) {
                    if (response.status === 200 && cacheRuntime) {
                        const copy = response.clone();
                        cache.open(cacheName).then((c) => c.put(request, copy)).catch(() => {});
                    }
                    return response;
                }
                const c = await cache.open(cacheName);
                return (await c.match(request, { ignoreSearch: request.mode === 'navigate' })) || Response.error();
            }

            /** @type {PrecacheHandlers} */
            const handlers = {
                install(event) {
                    event.waitUntil(
                        cache.open(cacheName)
                            .then((c) => c.addAll(urls))
                            .then(() => {
                                if (takeOver === 'always' || (takeOver === 'first-install' && !scope.registration.active)) {
                                    return scope.skipWaiting();
                                }
                                return undefined;
                            })
                    );
                },
                activate(event) {
                    event.waitUntil(
                        cache.keys()
                            .then((names) => Promise.all(names
                                .filter((n) => n.startsWith(prefix) && n !== cacheName)
                                .map((n) => cache.delete(n))))
                            .then(() => (claim ? scope.clients.claim() : undefined))
                    );
                },
                fetch(event) {
                    const request = event.request;
                    if (request.method !== 'GET') return;
                    const url = new URL(request.url);
                    if (url.origin !== new URL(scope.location.href).origin) return;
                    const kind = strategy(request, url);
                    if (kind === 'pass') return;
                    if (kind === 'network-first') {
                        event.respondWith(networkFirst(request));
                        return;
                    }
                    event.respondWith(cacheFirst(request));
                },
                message(event) {
                    if (messages === null) return;
                    const type = event.data && event.data.type;
                    if (type === messages.skipWaiting) {
                        event.waitUntil(scope.skipWaiting());
                    } else if (type === messages.version && event.ports && event.ports[0]) {
                        event.ports[0].postMessage({ version });
                    }
                },
            };

            /** @type {PrecacheInstance} */
            const instance = {
                cacheName,
                handlers,
                cacheFirst,
                networkFirst,
                listen() {
                    if (listening) return instance;
                    listening = true;
                    scope.addEventListener('install', handlers.install);
                    scope.addEventListener('activate', handlers.activate);
                    scope.addEventListener('fetch', handlers.fetch);
                    if (messages !== null) scope.addEventListener('message', handlers.message);
                    return instance;
                },
            };
            return instance;
        }

        return { create, DEFAULT_MESSAGES };
    },
};
