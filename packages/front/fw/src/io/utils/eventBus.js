// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Application-level pub/sub keyed by topic, distinct from DOM events (`fw.events`).
 * Supports plain named topics (`'log:error'`), sticky values (last value
 * replayed to new subscribers via `set`/`sticky`), limited wildcards
 * (`'a:*'` - a single trailing star), and scopes for atomic unsubscription.
 *
 * Each thread instantiates its own bus via `eventBus.create()`.
 * Cross-tab / cross-worker routing is delegated to `broadcastChannel` / `processMessage`.
 *
 * @example
 * const eventBus = runtime.resolve('eventBus');
 * const bus = eventBus.create();
 * const off = bus.on('log:error', (data) => console.error(data));
 * bus.emit('log:error', { msg: 'oops' });
 * off(); // unsubscribe
 */

/**
 * A single event bus instance returned by `create()`.
 * @typedef {object} EventBusInstance
 * @property {(topic: string, fn: Function, opts?: {replay?: boolean}) => Function} on - Subscribe to a topic (exact or `'a:*'` wildcard); returns an unsubscribe function.
 * @property {(topic: string, fn: Function) => void} off - Unsubscribe a handler from a topic.
 * @property {(topic: string, data: *) => void} emit - Synchronously dispatch data to all matching subscribers.
 * @property {(topic: string, fn: Function) => Function} sticky - Subscribe and immediately replay the last sticky value if any; returns an unsubscribe function.
 * @property {(topic: string, value: *) => void} set - Publish a value and store it for future sticky subscribers.
 * @property {(topic?: string) => void} clear - Clear the sticky value of a topic, or all sticky values when omitted.
 * @property {() => {on: (topic: string, fn: Function) => Function, sticky: (topic: string, fn: Function) => Function, dispose: () => void}} scope - Create a scope for atomic unsubscription of a group of subscriptions.
 * @property {() => string[]} topics - List active topics (with subscribers or sticky values).
 */

/**
 * Application-level pub/sub surface returned by `factory()`.
 * @typedef {object} EventBusAPI
 * @property {() => EventBusInstance} create - Create an independent event bus instance.
 */

export const eventBus = {
    name: 'eventBus',
    version: '1.0.0',
    type: 'fw.io.utils',
    dependencies: [],

    /**
     * @returns {EventBusAPI}
     */
    factory() {

        /**
         * Validates and normalizes a topic.
         * Throws if the topic is the global wildcard `'*'` or an invalid wildcard.
         * @param {string} topic
         * @param {boolean} [allowWildcard=true]
         */
        function _validateTopic(topic, allowWildcard = true) {
            if (typeof topic !== 'string' || topic.length === 0) {
                throw new TypeError('eventBus: topic must be a non-empty string');
            }
            if (topic === '*') {
                throw new Error('eventBus: global wildcard "*" is not allowed; use a namespaced pattern like "ns:*"');
            }
            const starCount = (topic.match(/\*/g) || []).length;
            if (starCount > 0) {
                if (!allowWildcard) {
                    throw new Error('eventBus: wildcards not allowed in emit/set/clear topic: ' + topic);
                }
                if (starCount > 1 || !topic.endsWith(':*')) {
                    throw new Error('eventBus: invalid wildcard pattern "' + topic + '"; only "prefix:*" is allowed');
                }
            }
        }

        /**
         * Tests whether a published topic matches a subscribed pattern.
         * @param {string} pattern - pattern (may contain `:*`)
         * @param {string} emittedTopic - exact emitted topic
         * @returns {boolean}
         */
        function _matches(pattern, emittedTopic) {
            if (pattern === emittedTopic) return true;
            if (pattern.endsWith(':*')) {
                const prefix = pattern.slice(0, -1); // 'a:' for 'a:*'
                return emittedTopic.startsWith(prefix) && emittedTopic.length > prefix.length;
            }
            return false;
        }

        /**
         * Creates an independent event bus instance.
         * @returns {object}
         */
        function create() {
            // Map<topic, Set<Function>> - exact-topic subscribers
            const _subscribers = new Map();
            // Map<wildcard_pattern, Set<Function>> - separate index for wildcard subscribers
            const _wildcardSubscribers = new Map();
            // Map<topic, any> - sticky values
            const _sticky = new Map();

            /**
             * Returns or creates the subscriber Set for an exact topic.
             */
            function _getSet(topic) {
                if (!_subscribers.has(topic)) _subscribers.set(topic, new Set());
                return _subscribers.get(topic);
            }

            /**
             * Returns or creates the subscriber Set for a wildcard pattern.
             */
            function _getWildcardSet(pattern) {
                if (!_wildcardSubscribers.has(pattern)) _wildcardSubscribers.set(pattern, new Set());
                return _wildcardSubscribers.get(pattern);
            }

            /**
             * Subscribes to a topic (exact or wildcard `'a:*'`).
             *
             * Option `{replay: true}` - alias of `sticky(topic, fn)`:
             * subscribes AND immediately replays the last value published via
             * `set` if one exists.
             *
             * Note: `{replay: true}` (and `sticky()`) only replay exact-topic
             * sticky values. Wildcard subscribers (`'log:*'`) receive future
             * emits but never replay sticky values - sticky storage is keyed
             * by exact topic, so `replay` is a no-op for wildcard patterns.
             *
             * @param {string} topic
             * @param {Function} fn
             * @param {{replay?: boolean}} [opts]
             * @returns {Function} unsubscribe
             */
            function on(topic, fn, opts) {
                _validateTopic(topic, true);
                if (typeof fn !== 'function') throw new TypeError('eventBus: listener must be a function');

                let unsubscribe;
                if (topic.endsWith(':*')) {
                    _getWildcardSet(topic).add(fn);
                    unsubscribe = () => off(topic, fn);
                } else {
                    _getSet(topic).add(fn);
                    unsubscribe = () => off(topic, fn);
                }
                // Replay sticky if requested (additive alias of `sticky`).
                if (opts && opts.replay === true && _sticky.has(topic)) {
                    try { fn(_sticky.get(topic)); }
                    catch (e) { console.error('eventBus sticky replay error:', e); }
                }
                return unsubscribe;
            }

            /**
             * Unsubscribes a handler from a topic. When the resulting subscriber
             * Set becomes empty, the entry is removed from the underlying map so
             * `topics()` does not report phantom topics and memory does not grow
             * with the number of topics ever subscribed.
             * @param {string} topic
             * @param {Function} fn
             */
            function off(topic, fn) {
                _validateTopic(topic, true);
                if (topic.endsWith(':*')) {
                    const s = _wildcardSubscribers.get(topic);
                    if (s) {
                        s.delete(fn);
                        if (s.size === 0) _wildcardSubscribers.delete(topic);
                    }
                } else {
                    const s = _subscribers.get(topic);
                    if (s) {
                        s.delete(fn);
                        if (s.size === 0) _subscribers.delete(topic);
                    }
                }
            }

            /**
             * Synchronously dispatches to all matching subscribers of the topic
             * (exact subscribers plus wildcard subscribers whose pattern matches).
             * If a handler throws, the error is logged via console.error and the
             * remaining handlers still run.
             * @param {string} topic
             * @param {*} data
             */
            function emit(topic, data) {
                _validateTopic(topic, false);

                // Exact subscribers
                const exact = _subscribers.get(topic);
                if (exact && exact.size > 0) {
                    for (const fn of [...exact]) {
                        try { fn(data); } catch (e) { console.error('eventBus handler error:', e); }
                    }
                }

                // Wildcards
                for (const [pattern, fns] of _wildcardSubscribers) {
                    if (_matches(pattern, topic)) {
                        for (const fn of [...fns]) {
                            try { fn(data); } catch (e) { console.error('eventBus handler error:', e); }
                        }
                    }
                }
            }

            /**
             * Subscribes AND immediately replays the last value if one exists (via `set`).
             *
             * Note: only exact-topic sticky values are replayed. Wildcard
             * patterns (`'log:*'`) are accepted as the subscription target but
             * never trigger a replay, because sticky values are keyed by exact
             * topic.
             *
             * @param {string} topic
             * @param {Function} fn
             * @returns {Function} unsubscribe
             */
            function sticky(topic, fn) {
                _validateTopic(topic, true);
                if (typeof fn !== 'function') throw new TypeError('eventBus: listener must be a function');
                const unsubscribe = on(topic, fn);
                if (_sticky.has(topic)) {
                    try { fn(_sticky.get(topic)); } catch (e) { console.error('eventBus sticky replay error:', e); }
                }
                return unsubscribe;
            }

            /**
             * Publishes AND stores the value for future `sticky(topic)` subscribers.
             * @param {string} topic
             * @param {*} value
             */
            function set(topic, value) {
                _validateTopic(topic, false);
                _sticky.set(topic, value);
                emit(topic, value);
            }

            /**
             * Clears the sticky value of a topic, or all sticky values if topic is omitted.
             * @param {string} [topic]
             */
            function clear(topic) {
                if (topic === undefined) {
                    _sticky.clear();
                } else {
                    _validateTopic(topic, false);
                    _sticky.delete(topic);
                }
            }

            /**
             * Creates a scope for atomic unsubscription of a group of subscriptions.
             *
             * Note: `dispose()` is terminal. After `dispose()` has been called,
             * the scope object is drained and no longer guarantees the original
             * atomic-cleanup grouping for further registrations - create a fresh
             * scope rather than re-registering on a disposed one.
             *
             * @returns {{ on: Function, sticky: Function, dispose: Function }}
             */
            function scope() {
                const _unsubscribers = [];

                function scopeOn(topic, fn) {
                    const unsubscribe = on(topic, fn);
                    _unsubscribers.push(unsubscribe);
                    return unsubscribe;
                }

                function scopeSticky(topic, fn) {
                    const unsubscribe = sticky(topic, fn);
                    _unsubscribers.push(unsubscribe);
                    return unsubscribe;
                }

                function dispose() {
                    for (const unsubscribe of _unsubscribers) {
                        try { unsubscribe(); } catch (e) { console.error('eventBus scope dispose error:', e); }
                    }
                    _unsubscribers.length = 0;
                }

                return { on: scopeOn, sticky: scopeSticky, dispose };
            }

            /**
             * Lists active topics (those with at least one subscriber or a sticky value). Debug use.
             * @returns {string[]}
             */
            function topics() {
                const result = new Set();
                for (const [topic, fns] of _subscribers) {
                    if (fns.size > 0) result.add(topic);
                }
                for (const [pattern, fns] of _wildcardSubscribers) {
                    if (fns.size > 0) result.add(pattern);
                }
                for (const topic of _sticky.keys()) {
                    result.add(topic);
                }
                return [...result];
            }

            return { on, off, emit, sticky, set, clear, scope, topics };
        }

        return { create };
    }
};
