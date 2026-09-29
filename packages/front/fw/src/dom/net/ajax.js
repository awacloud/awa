// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview HTTP client built on the `fetch` API.
 *
 * The factory returns a `create(baseUrl, defaults)` function. Each instance
 * produced by `create` exposes `get`, `post`, `put`, `patch`, and `del`
 * methods that return Promises resolving to the parsed response body.
 *
 * Features vs the legacy XHR implementation:
 *   - `fetch`-based (no XHR, no ActiveXObject)
 *   - Automatic JSON serialisation on request / deserialisation on response
 *   - Per-request custom headers
 *   - Timeout via `AbortSignal.timeout` (Chrome 103+, Firefox 100+, Safari 16.4+)
 *   - External abort support via `signal` option
 *   - Combined timeout + external abort via `AbortSignal.any`
 *   - `PATCH` method
 *   - `scope(path, defaults)` to derive a sub-instance with a narrower base URL
 *   - HTTP error status codes throw structured `HttpError` instances
 *   - Response type auto-detected from `Content-Type`; can be overridden
 *
 * @note Browser requirements: `AbortSignal.timeout()` requires Chrome 103+,
 *   Firefox 100+, Safari 16.4+. `AbortSignal.any()` requires Chrome 119+,
 *   Firefox 124+, Safari 17.4+. When `AbortSignal.any()` is unavailable and
 *   both `timeout` and an external `signal` are supplied, the external signal
 *   takes precedence and the timeout is ignored.
 * @note No built-in retry logic - wrap externally if needed.
 *
 */

/**
 * @typedef {Object} AjaxInstance
 * @property {function(string, object=): Promise<*>} get
 * @property {function(string, *, object=): Promise<*>} post
 * @property {function(string, *, object=): Promise<*>} put
 * @property {function(string, *, object=): Promise<*>} patch
 * @property {function(string, object=): Promise<*>} del
 * @property {function(string=, object=): AjaxInstance} scope
 * @property {*} HttpError
 */

/**
 * Object returned by `ajax.factory()`: a `create(baseUrl, defaults)` factory
 * function producing {@link AjaxInstance} HTTP clients.
 * @typedef {function(string=, object=): AjaxInstance} AjaxAPI
 */

export const ajax = {
    name: 'ajax',
    type: 'fw.dom.net',
    dependencies: [],

    /** @returns {AjaxAPI} */
    factory() {

        // --- Internal ---

        /**
         * Resolve `endpoint` against `base`.
         *
         * Rules (mirrors standard URL resolution):
         *   - Absolute URL (`http://…` / `https://…`): returned as-is.
         *   - Absolute path (`/foo`): appended to the base origin.
         *   - Relative path (`foo`): appended to the base, replacing any
         *     trailing filename segment (base always treated as a directory).
         *
         * @param {string} base
         * @param {string} [endpoint]
         * @returns {string}
         */
        function buildUrl(base, endpoint) {
            if (!endpoint) return base;
            if (/^https?:\/\//i.test(endpoint)) return endpoint;
            // Normalise base to end with '/' so URL resolution works as a directory
            const normalised = base.endsWith('/') ? base : base + '/';
            return new URL(endpoint.replace(/^\//, ''), normalised).href;
        }

        /**
         * Parse a `Response` body according to the requested `type` or by
         * auto-detecting the `Content-Type` header.
         *
         * Supported `type` values: `'json'`, `'text'`, `'blob'`, `'buffer'`,
         * `'response'` (raw `Response` object). Omit `type` for auto-detection.
         *
         * @param {Response} res
         * @param {string}   [type]
         * @returns {Promise<*>}
         */
        async function parseResponse(res, type) {
            if (type === 'response') return res;
            if (type === 'blob')     return res.blob();
            if (type === 'buffer')   return res.arrayBuffer();
            if (type === 'text')     return res.text();
            if (type === 'json') {
                const text = await res.text();
                try { return JSON.parse(text); }
                catch (e) { throw new SyntaxError(`Invalid JSON response: ${e.message}`, { cause: e }); }
            }
            // Auto-detect
            const ct = res.headers.get('content-type') ?? '';
            if (ct.includes('application/json') || ct.includes('+json')) {
                const text = await res.text();
                try { return JSON.parse(text); } catch { return text; }
            }
            if (ct.startsWith('text/')) return res.text();
            return res.arrayBuffer();
        }

        /**
         * Structured HTTP error thrown when a response has a non-2xx status.
         *
         * @property {number}   status   - HTTP status code.
         * @property {string}   message  - Human-readable description.
         * @property {Response} response - Raw fetch `Response`.
         */
        class HttpError extends Error {
            constructor(response) {
                super(`HTTP ${response.status} ${response.statusText}`);
                // defineProperty (not `this.name =`) so it survives sanity's
                // frozen Error.prototype (non-writable inherited `name`).
                Object.defineProperty(this, 'name', { value: 'HttpError', writable: true, configurable: true });
                this.status   = response.status;
                this.response = response;
            }
        }

        /**
         * Execute an HTTP request.
         *
         * @param {string} method  - HTTP verb (uppercase).
         * @param {string} url     - Fully resolved URL.
         * @param {object} [opts]
         * @param {object}       [opts.headers={}]  - Additional request headers.
         * @param {*}            [opts.body]         - Request body. Plain objects/arrays
         *   are JSON-serialised automatically.
         * @param {string}       [opts.type]         - Expected response type.
         * @param {number}       [opts.timeout=0]    - Timeout in ms (0 = none).
         * @param {AbortSignal}  [opts.signal]       - External abort signal.
         * @returns {Promise<*>}
         */
        async function request(method, url, { headers = {}, body, type, timeout = 0, signal: external } = {}) {
            // Build a combined abort signal when both timeout and external signal are present
            let signal;
            if (timeout > 0 && external) {
                signal = (typeof AbortSignal.any === 'function')
                    ? AbortSignal.any([AbortSignal.timeout(timeout), external])
                    : external;
            } else if (timeout > 0) {
                signal = AbortSignal.timeout(timeout);
            } else if (external) {
                signal = external;
            }

            const reqHeaders = new Headers(headers);
            const init = { method, headers: reqHeaders, signal };

            if (body !== undefined && body !== null) {
                if (
                    typeof body === 'object' &&
                    !(body instanceof FormData) &&
                    !(body instanceof Blob) &&
                    !(body instanceof ArrayBuffer) &&
                    !(body instanceof URLSearchParams)
                ) {
                    init.body = JSON.stringify(body);
                    if (!reqHeaders.has('Content-Type')) {
                        reqHeaders.set('Content-Type', 'application/json');
                    }
                } else {
                    init.body = body;
                }
            }

            const res = await fetch(url, init);

            if (!res.ok) throw new HttpError(res);

            return parseResponse(res, type);
        }

        // --- Public API ---

        /**
         * Create an HTTP client instance.
         *
         * @param {string} [baseUrl='']      - Base URL prepended to all endpoints.
         *   Defaults to `location.origin` in browser contexts.
         * @param {object} [defaults={}]     - Default options merged into every
         *   request. Supports all keys accepted by the request `opts` parameter
         *   (`headers`, `type`, `timeout`). Per-request options take precedence.
         * @returns {AjaxInstance}
         */
        return function create(baseUrl = '', defaults = {}) {
            const base = baseUrl
                ? baseUrl.replace(/\/$/, '')
                : (typeof location !== 'undefined' ? location.origin : '');

            /**
             * @param {string} method
             * @param {string} endpoint
             * @param {object} opts
             */
            function req(method, endpoint, opts = {}) {
                // Shallow-spread merges all options, then deep-merge headers so that
                // per-request headers extend (not replace) the instance defaults.
                const merged = { ...defaults, ...opts };
                merged.headers = { ...(defaults.headers ?? {}), ...(opts.headers ?? {}) };
                return request(method, buildUrl(base, endpoint), merged);
            }

            return {
                /**
                 * GET request.
                 *
                 * @param {string} endpoint
                 * @param {object} [opts]
                 * @returns {Promise<*>}
                 */
                get(endpoint, opts) {
                    return req('GET', endpoint, opts);
                },

                /**
                 * POST request with optional body.
                 *
                 * @param {string} endpoint
                 * @param {*}      [body]
                 * @param {object} [opts]
                 * @returns {Promise<*>}
                 */
                post(endpoint, body, opts) {
                    return req('POST', endpoint, { ...opts, body });
                },

                /**
                 * PUT request with optional body.
                 *
                 * @param {string} endpoint
                 * @param {*}      [body]
                 * @param {object} [opts]
                 * @returns {Promise<*>}
                 */
                put(endpoint, body, opts) {
                    return req('PUT', endpoint, { ...opts, body });
                },

                /**
                 * PATCH request with optional body.
                 *
                 * @param {string} endpoint
                 * @param {*}      [body]
                 * @param {object} [opts]
                 * @returns {Promise<*>}
                 */
                patch(endpoint, body, opts) {
                    return req('PATCH', endpoint, { ...opts, body });
                },

                /**
                 * DELETE request.
                 *
                 * @param {string} endpoint
                 * @param {object} [opts]
                 * @returns {Promise<*>}
                 */
                del(endpoint, opts) {
                    return req('DELETE', endpoint, opts);
                },

                /**
                 * Derive a child instance that inherits this instance's base URL
                 * and default options, extended with `path` and `opts`.
                 *
                 * Useful for grouping requests by resource or adding auth headers
                 * to a subset of calls without affecting the parent instance.
                 *
                 * @example
                 * const api   = ajax('/api/v2');
                 * const users = api.scope('users', { headers: { Authorization: `Bearer ${token}` } });
                 * users.get('42');   // GET /api/v2/users/42  (with auth header)
                 *
                 * @param {string} [path='']
                 * @param {object} [opts={}]
                 * @returns {AjaxInstance}
                 */
                scope(path = '', opts = {}) {
                    return create(buildUrl(base, path), { ...defaults, ...opts });
                },

                /**
                 * `HttpError` class exposed on the instance so callers can
                 * `instanceof`-check caught errors without importing separately.
                 *
                 * @type {typeof HttpError}
                 */
                HttpError
            };
        };
    }
};
