// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Wrapper around the global `caches` API (Cache API).
 * Worker-safe: `caches` is available in main thread, dedicated Worker, and Service Worker.
 *
 * @example
 * const cache = registry.resolve('cache');
 * const c = await cache.open('v1');
 * await c.put('/api/data', response);
 */

/**
 * @typedef {Object} CacheWrapper
 * @property {(request: RequestInfo, response: Response) => Promise<void>} put
 *   Store a response keyed by request.
 * @property {(request: RequestInfo, options?: CacheQueryOptions) => Promise<Response|undefined>} match
 *   Return the first matching response or undefined.
 * @property {(request?: RequestInfo, options?: CacheQueryOptions) => Promise<Response[]>} matchAll
 *   Return all matching responses.
 * @property {(request: RequestInfo) => Promise<void>} add
 *   Fetch and store a single request.
 * @property {(requests: RequestInfo[]) => Promise<void>} addAll
 *   Fetch and store multiple requests atomically.
 * @property {(request: RequestInfo, options?: CacheQueryOptions) => Promise<boolean>} delete
 *   Remove an entry; resolves to true if anything was deleted.
 * @property {(request?: RequestInfo, options?: CacheQueryOptions) => Promise<Request[]>} keys
 *   List stored requests.
 */

/**
 * CacheStorage helper surface returned by `factory()`.
 * @typedef {object} CacheAPI
 * @property {(name: string) => Promise<CacheWrapper>} open - Open (creating if needed) a named cache.
 * @property {(name: string) => Promise<boolean>} delete - Delete an entire named cache; resolves true if it existed.
 * @property {(name: string) => Promise<boolean>} has - Check whether a named cache exists.
 * @property {() => Promise<string[]>} keys - List all cache names.
 * @property {(request: RequestInfo, options?: CacheQueryOptions) => Promise<Response|undefined>} match - Match a request across every cache.
 */

export const cache = {
    name: 'cache',
    version: '1.0.0',
    type: 'fw.dom.sw',
    dependencies: [],

    /**
     * @returns {CacheAPI}
     */
    factory() {
        /**
         * Returns the global `caches` object or throws if missing.
         * @returns {CacheStorage}
         * @private
         */
        function _getCaches() {
            // `caches` resolves through globalThis in module scope.
            const c = globalThis.caches;
            if (!c) throw new Error('cache: caches API is not available in this environment');
            return c;
        }

        /**
         * Wraps a native Cache instance behind a stable, future-proof shape.
         * Pass-through today; kept as an indirection point for future hooks
         * (telemetry, instrumentation, policy enforcement).
         * @param {Cache} nativeCache
         * @returns {CacheWrapper}
         * @private
         */
        function _wrapCache(nativeCache) {
            return {
                put: (request, response) => nativeCache.put(request, response),
                match: (request, options) => nativeCache.match(request, options),
                // @ts-ignore - CacheStorage returns readonly arrays; we treat them as mutable
                matchAll: (request, options) => nativeCache.matchAll(request, options),
                add: (request) => nativeCache.add(request),
                addAll: (requests) => nativeCache.addAll(requests),
                delete: (request, options) => nativeCache.delete(request, options),
                // @ts-ignore - CacheStorage returns readonly arrays; we treat them as mutable
                keys: (request, options) => nativeCache.keys(request, options),
            };
        }

        /**
         * Open (creating if needed) a named cache.
         * @param {string} name - Cache name.
         * @returns {Promise<CacheWrapper>}
         */
        async function open(name) {
            const nativeCache = await _getCaches().open(name);
            return _wrapCache(nativeCache);
        }

        /**
         * Delete an entire named cache.
         * @param {string} name - Cache name.
         * @returns {Promise<boolean>} true if the cache existed and was deleted.
         */
        async function del(name) {
            return _getCaches().delete(name);
        }

        /**
         * Check whether a named cache exists.
         * Note: this is O(n) over `keys()`; acceptable given the small expected
         * number of cache names.
         * @param {string} name - Cache name.
         * @returns {Promise<boolean>}
         */
        async function has(name) {
            const keys = await _getCaches().keys();
            return keys.includes(name);
        }

        /**
         * List all cache names.
         * @returns {Promise<string[]>}
         */
        async function keys() {
            return _getCaches().keys();
        }

        /**
         * Match a request across every cache (CacheStorage.match).
         * @param {RequestInfo} request
         * @param {CacheQueryOptions} [options]
         * @returns {Promise<Response|undefined>}
         */
        async function match(request, options) {
            return _getCaches().match(request, options);
        }

        return { open, delete: del, has, keys, match };
    },
};
