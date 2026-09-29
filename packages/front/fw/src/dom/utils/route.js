// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Hash-based router with guards and nested layouts.
 *
 * `sanity/base.js` blocks `history.pushState` / `replaceState`, so the only
 * navigation primitive available to fw apps is the URL hash (`#/path?key=v`).
 * This module wraps `hashchange` with a pattern matcher, named handlers,
 * before-enter / before-leave guards, and parent/child route chaining for
 * layout-style routing.
 *
 * Pattern syntax (Express/Sinatra family) :
 *   - Literal segments   : `/users/list`
 *   - Parameter segments : `/users/:id` → match captures `{id}`
 *   - Wildcard tail      : `/files/*rest` → captures all remaining segments
 *   - Optional trailing slash matches both `/users` and `/users/`.
 *
 * Concrete examples :
 *   route.on('home',  '/',                   handler);
 *   route.on('user',  '/users/:id',          handler);  // handler({id: '42'}, query, info)
 *   route.on('admin', '/admin/*path',        handler);  // handler({path: 'a/b/c'}, …)
 *
 * **Guards** - opts `{ beforeEnter, beforeLeave }` :
 *
 *   route.on('account', '/account', handler, {
 *       beforeEnter: (params, query, info) => isLoggedIn() || (route.go('/login'), false),
 *       beforeLeave: (params, query, info) => confirm('Discard changes?'),
 *   });
 *
 * Returning `false` (or a Promise that resolves to `false`) cancels the
 * navigation. Async guards are supported : dispatch becomes async when any
 * guard returns a Promise. The previous hash is restored on cancellation.
 *
 * **Nested routes** - opts `{ parent }` :
 *
 *   route.on('app',   '/app',           layoutHandler);
 *   route.on('users', '/users',         listHandler,   { parent: 'app' });
 *   route.on('user',  '/:id',           detailHandler, { parent: 'users' });
 *
 * The effective pattern of a child concatenates parent → child segments :
 *   `user` matches `/app/users/:id`.
 *
 * When the leaf matches, all ancestors' handlers fire too, **in parent →
 * child order**, each receiving the merged params bag. Useful for rendering
 * layouts (header + sidebar + detail).
 *
 * Multiple top-level handlers may still match the same path independently
 * (preserves the v1 behaviour) - they run in registration order after the
 * nested chain has finished.
 *
 */

/**
 * Route handler / info bag passed to handlers and guards.
 * @typedef {(params: Object<string, string>, query: Object<string, string>, info: { path: string, hash: string, name: string }) => void} RouteHandler
 */

/**
 * Guard return value: `false` (or a Promise resolving to `false`) cancels navigation.
 * @typedef {(params: Object<string, string>, query: Object<string, string>, info: { path: string, hash: string, name: string }) => (boolean|void|Promise<boolean|void>)} RouteGuard
 */

/**
 * Public surface returned by `route.factory()`.
 * @typedef {object} RouteAPI
 * @property {(name: string, pattern: string, fn: RouteHandler, opts?: { parent?: string, beforeEnter?: RouteGuard, beforeLeave?: RouteGuard }) => void} on
 *   Register (or replace) a named route handler.
 * @property {(name: string) => void} off Unregister a named route.
 * @property {(path: string, query?: Object<string, *>) => Promise<boolean>} go
 *   Navigate to a path; resolves `true` if it went through, `false` if a guard cancelled.
 * @property {(path: string, query?: Object<string, *>) => void} replace
 *   Replace the current hash without adding a history entry.
 * @property {() => { path: string, query: Object<string, string>, hash: string }} current
 *   Snapshot of the current parsed route state.
 * @property {() => ({ name: string, params: Object<string, string>, query: Object<string, string>, info: { path: string, hash: string, name: string }, hash: string } | null)} active
 *   Active primary matched route info, or `null` when nothing matched.
 * @property {() => Promise<void>} refresh Manually re-dispatch the current hash.
 * @property {() => void} start Install the `hashchange` listener and dispatch once (idempotent).
 * @property {() => void} dispose Detach the listener and clear all registered routes.
 * @property {number} size Number of registered routes (read-only getter).
 */

import { events } from '../query/events.js';

export const route = {
    name: 'route',
    version: '1.1.0',
    type: 'fw.dom.utils',
    dependencies: ['events'],
    deps: [events],

    /** @returns {RouteAPI} */
    factory(events) {

        /**
         * Compiled route entry.
         * @typedef {Object} RouteEntry
         * @property {string}   name
         * @property {string}   pattern        - Effective pattern (parent joined).
         * @property {RegExp}   regex
         * @property {Array<{name:string, tail:boolean}>} paramNames
         * @property {Function} fn
         * @property {Function} [beforeEnter]
         * @property {Function} [beforeLeave]
         * @property {string}   [parent]       - Parent route name.
         * @property {RouteEntry[]} [chain]    - Parent → self chain (cached).
         */
        const routes = [];
        let started = false;

        // ── Pattern compilation ─────────────────────────────────────────────

        function compilePattern(pattern) {
            const paramNames = [];
            let re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
            re = re.replace(/\*([A-Za-z_]\w*)/g, (_, n) => {
                paramNames.push({ name: n, tail: true });
                return '(.*)';
            });
            re = re.replace(/:([A-Za-z_]\w*)/g, (_, n) => {
                paramNames.push({ name: n, tail: false });
                return '([^/]+)';
            });
            if (re !== '/' && re !== '\\/') re = re.replace(/\/+$/, '') + '\\/?';
            return { regex: new RegExp('^' + re + '$'), paramNames };
        }

        /** Resolve the effective pattern of a child by walking up its parent chain. */
        function _joinPatterns(parentEntry, childPattern) {
            const parentPath = parentEntry.pattern.replace(/\/+$/, '');
            const childPath  = childPattern.startsWith('/') ? childPattern : '/' + childPattern;
            return parentPath + childPath;
        }

        /** Pre-compute the parent chain `[ancestor, …, parent, self]`. */
        function _buildChain(entry) {
            const chain = [entry];
            let p = entry.parent ? _findRoute(entry.parent) : null;
            while (p) {
                chain.unshift(p);
                p = p.parent ? _findRoute(p.parent) : null;
            }
            return chain;
        }

        function _findRoute(name) {
            for (const r of routes) if (r.name === name) return r;
            return null;
        }

        /**
         * Recompute the cached parent chain of every route that transitively
         * descends from `ancestorName`. Called after replacing a parent so
         * that children stop pointing at the stale entry.
         *
         * @param {string} ancestorName - Name of the route just replaced.
         */
        function _invalidateDescendantChains(ancestorName) {
            // Build the set of all names that have `ancestorName` in their
            // parent chain (transitively). Walk via parent pointers.
            const descendants = new Set();
            let changed = true;
            // Repeat passes until no new descendants are discovered (handles
            // deep nesting without recursion).
            while (changed) {
                changed = false;
                for (const r of routes) {
                    if (descendants.has(r.name)) continue;
                    if (r.parent === ancestorName || descendants.has(r.parent)) {
                        descendants.add(r.name);
                        changed = true;
                    }
                }
            }
            for (const r of routes) {
                if (descendants.has(r.name)) r.chain = _buildChain(r);
            }
        }

        // ── URL parsing ─────────────────────────────────────────────────────

        function parseHash(hash) {
            const raw = (hash || '').replace(/^#/, '');
            const stripped = raw.startsWith('/') ? raw : '/' + raw;
            const qIdx = stripped.indexOf('?');
            const path = qIdx === -1 ? stripped : stripped.slice(0, qIdx);
            const queryStr = qIdx === -1 ? '' : stripped.slice(qIdx + 1);
            const query = {};
            if (queryStr) {
                for (const pair of queryStr.split('&')) {
                    if (!pair) continue;
                    const eq = pair.indexOf('=');
                    const k = decodeURIComponent(eq === -1 ? pair        : pair.slice(0, eq));
                    const v = decodeURIComponent(eq === -1 ? ''          : pair.slice(eq + 1));
                    query[k] = v;
                }
            }
            return { path: path || '/', query };
        }

        function buildHash(path, query) {
            let out = '#' + (path.startsWith('/') ? path : '/' + path);
            if (query && typeof query === 'object') {
                const entries = Object.entries(query).filter(([, v]) => v != null);
                if (entries.length) {
                    out += '?' + entries.map(([k, v]) =>
                        encodeURIComponent(k) + '=' + encodeURIComponent(String(v))
                    ).join('&');
                }
            }
            return out;
        }

        // ── Dispatch ────────────────────────────────────────────────────────

        let _dispatching = false;
        /** Last successfully-matched route info, for `beforeLeave`. */
        let _activeRoute = null;   // { name, params, query, info, prevHash } | null

        /**
         * Convert a guard return value to a boolean (sync) or `Promise<boolean>`.
         * `undefined` / `true` → pass. `false` → cancel. Promises are awaited.
         */
        function _resolveGuard(r) {
            if (r && typeof r.then === 'function') {
                return r.then(v => v !== false);
            }
            return r !== false;
        }

        function _cancelNavigation(prevHash) {
            // Restore the prior hash without re-triggering dispatch.
            _dispatching = true;
            try {
                if (location.hash !== prevHash) location.hash = prevHash;
            } finally {
                _dispatching = false;
            }
        }

        async function dispatch() {
            if (_dispatching) return;
            _dispatching = true;
            const currentHash = location.hash;
            try {
                const { path, query } = parseHash(currentHash);

                // 1. Find all top-level matches (preserves v1 multi-match semantics).
                const matches = [];
                for (const r of routes) {
                    const m = r.regex.exec(path);
                    if (!m) continue;
                    const params = {};
                    for (let i = 0; i < r.paramNames.length; ++i) {
                        params[r.paramNames[i].name] = m[i + 1];
                    }
                    matches.push({ entry: r, params });
                }
                if (matches.length === 0) {
                    _activeRoute = null;
                    return;
                }

                // 2. Pick the FIRST match as the "primary" - the one whose
                //    beforeLeave/beforeEnter chain participates and whose
                //    ancestry runs. Subsequent matches still fire as
                //    independent handlers (analytics-style).
                const primary = matches[0];
                const info = { path, hash: currentHash, name: primary.entry.name };

                // 3. beforeLeave on the previously-active route (if any and
                //    if we're transitioning to a different name).
                if (_activeRoute && _activeRoute.name !== primary.entry.name) {
                    const prev = _findRoute(_activeRoute.name);
                    if (prev && typeof prev.beforeLeave === 'function') {
                        const ok = await _resolveGuard(prev.beforeLeave(
                            _activeRoute.params, _activeRoute.query, _activeRoute.info,
                        ));
                        if (!ok) { _cancelNavigation(_activeRoute.hash); return; }
                    }
                }

                // 4. beforeEnter chain (parent → child) for the primary match.
                const chain = primary.entry.chain || [primary.entry];
                for (const entry of chain) {
                    if (typeof entry.beforeEnter === 'function') {
                        const ok = await _resolveGuard(entry.beforeEnter(
                            primary.params, query, info,
                        ));
                        if (!ok) {
                            if (_activeRoute) _cancelNavigation(_activeRoute.hash);
                            return;
                        }
                    }
                }

                // 5. Fire chain handlers in parent → child order.
                for (const entry of chain) {
                    try { entry.fn(primary.params, query, { ...info, name: entry.name }); }
                    catch (e) {
                        try { console.error('route: handler threw', e); } catch { /* swallow */ }
                    }
                }

                // 6. Fire remaining independent matches (analytics-style).
                for (let i = 1; i < matches.length; ++i) {
                    const m = matches[i];
                    try { m.entry.fn(m.params, query, { ...info, name: m.entry.name }); }
                    catch (e) {
                        try { console.error('route: handler threw', e); } catch { /* swallow */ }
                    }
                }

                // 7. Record active state.
                _activeRoute = {
                    name:   primary.entry.name,
                    params: primary.params,
                    query,
                    info,
                    hash:   currentHash,
                };
            } finally {
                _dispatching = false;
            }
        }

        // ── Public API ──────────────────────────────────────────────────────

        const api = {

            /**
             * Register a route handler.
             *
             * @param {string}   name    - Unique identifier (replaces previous).
             * @param {string}   pattern - Pattern with `:param` and `*wildcard`.
             *   When `opts.parent` is provided, the pattern is interpreted
             *   relative to the parent.
             * @param {Function} fn      - `(params, query, info) => void`.
             * @param {Object}   [opts]
             * @param {string}   [opts.parent]      - Name of parent route.
             * @param {Function} [opts.beforeEnter] - Guard `(p,q,i) => bool|Promise<bool>`.
             * @param {Function} [opts.beforeLeave] - Guard fired when navigating away
             *   from this route (i.e. this was the previously-active primary match).
             */
            on(name, pattern, fn, opts = {}) {
                if (typeof name !== 'string' || !name)
                    throw new Error('route.on: name must be a non-empty string');
                if (typeof pattern !== 'string')
                    throw new Error('route.on: pattern must be a string');
                if (typeof fn !== 'function')
                    throw new Error('route.on: fn must be a function');

                // Remove existing entry with the same name (replace semantics).
                const wasReplaced = (() => {
                    for (let i = routes.length - 1; i >= 0; --i) {
                        if (routes[i].name === name) { routes.splice(i, 1); return true; }
                    }
                    return false;
                })();

                let effectivePattern = pattern;
                if (opts.parent) {
                    const parentEntry = _findRoute(opts.parent);
                    if (!parentEntry) {
                        throw new Error(
                            `route.on: parent '${opts.parent}' not found ` +
                            `(define parent routes before children)`
                        );
                    }
                    effectivePattern = _joinPatterns(parentEntry, pattern);
                }

                const { regex, paramNames } = compilePattern(effectivePattern);
                const entry = {
                    name,
                    pattern: effectivePattern,
                    regex,
                    paramNames,
                    fn,
                    parent:      opts.parent || null,
                    beforeEnter: typeof opts.beforeEnter === 'function' ? opts.beforeEnter : null,
                    beforeLeave: typeof opts.beforeLeave === 'function' ? opts.beforeLeave : null,
                };
                entry.chain = _buildChain(entry);
                routes.push(entry);

                // If we just REPLACED a route, any descendant whose ancestry
                // included it still caches a chain referencing the old entry.
                // Recompute chains for all descendants so they pick up the
                // fresh handler / guards.
                if (wasReplaced) _invalidateDescendantChains(name);
            },

            /**
             * Unregister a named route. No-op when not found.
             */
            off(name) {
                for (let i = routes.length - 1; i >= 0; --i) {
                    if (routes[i].name === name) { routes.splice(i, 1); break; }
                }
            },

            /**
             * Navigate to a path. Returns a Promise resolving to `true` if
             * the navigation went through, `false` if a guard cancelled it.
             */
            go(path, query) {
                const next = buildHash(path, query);
                if (location.hash !== next) location.hash = next;
                return dispatch().then(() => _activeRoute !== null && _activeRoute.hash === next);
            },

            /**
             * Replace the current hash without adding a history entry.
             */
            replace(path, query) {
                const next = buildHash(path, query);
                const base = location.href.split('#')[0];
                location.replace(base + next);
            },

            /**
             * Snapshot of the current route state - `{ path, query, hash }`.
             */
            current() {
                const { path, query } = parseHash(location.hash);
                return { path, query, hash: location.hash };
            },

            /**
             * Active matched route (primary) info, or `null` when nothing matched.
             * Includes `{ name, params, query, info, hash }`.
             */
            active() {
                if (!_activeRoute) return null;
                return {
                    name:   _activeRoute.name,
                    params: { ..._activeRoute.params },
                    query:  { ..._activeRoute.query },
                    info:   { ..._activeRoute.info },
                    hash:   _activeRoute.hash,
                };
            },

            /**
             * Manually re-dispatch the current hash.
             */
            refresh() {
                return dispatch();
            },

            /**
             * Install the `hashchange` listener and fire once for the current
             * URL. Idempotent.
             */
            start() {
                if (started) return;
                started = true;
                events.on('fw:route:hashchange', window, 'hashchange', dispatch);
                dispatch();
            },

            /**
             * Detach the listener and clear all registered routes.
             */
            dispose() {
                if (started) {
                    events.off('fw:route:hashchange');
                    started = false;
                }
                routes.length = 0;
                _activeRoute = null;
            },

            get size() { return routes.length; },
        };

        return /** @type {RouteAPI} */ (/** @type {any} */ (api));
    },
};
