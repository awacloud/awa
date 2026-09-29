// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * EventSource (Server-Sent Events) wrapper with exponential auto-reconnect,
 * Last-Event-ID tracking (replay-on-reconnect via query parameter), and
 * full lifecycle telemetry (`onError` surfacing `readyState` so the UI can
 * show "reconnecting…" banners).
 *
 * Not worker-safe: `EventSource` is only available in the main thread.
 *
 * Tracked listeners - including custom named events - are stored in a
 * per-event `Map<event, Set<fn>>` and the underlying EventSource bridges
 * are removed on `off()` / `close()`, eliminating any listener leak when
 * the connection is re-opened or replaced.
 */
/**
 * A live SSE connection handle returned by `SseAPI.connect()`.
 *
 * @typedef {Object} SseConnection
 * @property {(eventName: string, callback: Function) => void} on Register a listener for an event name.
 * @property {(eventName: string, callback: Function) => void} off Remove a listener.
 * @property {(cb: (event: Event, readyState: number) => void) => (() => void)} onError Subscribe to error events; returns an unsubscribe.
 * @property {(cb: (info: {attempt: number, delay: number}) => void) => (() => void)} onReconnect Subscribe to reconnect telemetry; returns an unsubscribe.
 * @property {() => void} close Close the connection and clear listeners.
 * @property {number} readyState 0 = CONNECTING, 1 = OPEN, 2 = CLOSED (read-only).
 * @property {string} url Configured base URL, without query mutation (read-only).
 * @property {string|null} lastEventId Most recent Last-Event-ID seen, or `null` (read-only).
 */

/**
 * Public API returned by `sse.factory()`.
 *
 * @typedef {Object} SseAPI
 * @property {(url: string, options?: {withCredentials?: boolean, retry?: {initial?: number, max?: number, factor?: number}, autoConnect?: boolean, lastEventIdParam?: string, initialLastEventId?: string|null}) => SseConnection} connect Open an SSE connection.
 */

export const sse = {
    name: 'sse',
    type: 'fw.dom.net',
    dependencies: [],

    /** @returns {SseAPI} */
    factory() {
        // Built-in events we wire to native EventSource handlers directly.
        const BUILTIN_EVENTS = new Set(['open', 'error', 'message', 'close']);

        /**
         * Open a Server-Sent Events connection.
         *
         * @param {string} url - SSE endpoint URL.
         * @param {object} [options]
         * @param {boolean} [options.withCredentials=false] - Forwarded to EventSource.
         * @param {{initial?: number, max?: number, factor?: number}} [options.retry]
         *   Exponential back-off configuration for auto-reconnect.
         * @param {boolean} [options.autoConnect=true] - Open immediately on call.
         * @param {string}  [options.lastEventIdParam='lastEventId']
         *   Query-parameter name used to replay from a known event id on reconnect.
         *   Native EventSource cannot set custom headers, so the id is sent as a
         *   query string; the server must read and honour it.
         * @param {string|null} [options.initialLastEventId=null]
         *   Optional starting event id (e.g. restored from local storage) injected
         *   in the very first connect.
         * @returns {object} connection handle
         */
        function connect(url, options = {}) {
            const {
                withCredentials = false,
                retry = { initial: 1000, max: 30000, factor: 2 },
                autoConnect = true,
                lastEventIdParam = 'lastEventId',
                initialLastEventId = null,
            } = options;

            /** @type {Map<string, Set<Function>>} user-facing listeners by event name */
            const _listeners = new Map();
            /**
             * Per-event-name bridges currently attached to the underlying
             * EventSource. Map<eventName, Function>.
             *
             * We attach exactly one bridge per event-name per EventSource, and
             * always remove it via `removeEventListener` when closing or
             * recycling the underlying source. This guarantees no native
             * listener leak across reconnects.
             *
             * @type {Map<string, Function>}
             */
            let _bridges = new Map();

            let _es = null;
            let _closed = false;
            let _attempts = 0;
            let _retryTimer = null;
            let _lastEventId = initialLastEventId;

            function _emit(name, ...args) {
                const fns = _listeners.get(name);
                if (!fns) return;
                for (const fn of fns) {
                    if (fn(...args) === false) break;
                }
            }

            /**
             * Build the URL for the next connection, appending the
             * `lastEventId` query parameter when one is known.
             */
            function _buildUrl() {
                if (!_lastEventId) return url;
                try {
                    // Use URL when possible (handles existing query string + encoding).
                    const u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
                    u.searchParams.set(lastEventIdParam, _lastEventId);
                    return u.toString();
                } catch {
                    // Fallback for non-absolute URLs in environments without `location`.
                    const sep = url.includes('?') ? '&' : '?';
                    return `${url}${sep}${encodeURIComponent(lastEventIdParam)}=${encodeURIComponent(_lastEventId)}`;
                }
            }

            /**
             * Attach a bridge for a named event on the current EventSource.
             * Idempotent: bails out when one is already registered.
             */
            function _bridge(eventName) {
                if (!_es || _bridges.has(eventName)) return;
                const bridge = (e) => {
                    if (e && e.lastEventId) _lastEventId = e.lastEventId;
                    _emit(eventName, e?.data, e);
                };
                _es.addEventListener(eventName, bridge);
                _bridges.set(eventName, bridge);
            }

            /**
             * Detach every bridge from the current EventSource. Used before
             * closing or recycling the underlying source.
             */
            function _unbridgeAll() {
                if (!_es) {
                    _bridges = new Map();
                    return;
                }
                for (const [eventName, bridge] of _bridges) {
                    try { _es.removeEventListener(eventName, bridge); } catch { /* ignore */ }
                }
                _bridges = new Map();
            }

            function _scheduleReconnect() {
                if (_closed) return;
                const { initial = 1000, max = 30000, factor = 2 } = retry;
                const delay = Math.min(initial * Math.pow(factor, _attempts), max);
                _attempts++;
                // Surface telemetry so apps can render "reconnecting in Xms" banners.
                _emit('reconnect', { attempt: _attempts, delay });
                _retryTimer = setTimeout(() => {
                    if (!_closed) _open();
                }, delay);
            }

            function _open() {
                const ES = typeof EventSource !== 'undefined' ? EventSource : globalThis.EventSource;
                if (!ES) throw new Error('sse: EventSource is not available in this environment');
                _es = new ES(_buildUrl(), { withCredentials });

                // Re-attach bridges for any custom event names the caller already
                // registered before (or between) connections.
                for (const eventName of _listeners.keys()) {
                    if (!BUILTIN_EVENTS.has(eventName) && eventName !== 'reconnect') {
                        _bridge(eventName);
                    }
                }

                _es.addEventListener('open', () => {
                    _attempts = 0;
                    _emit('open');
                });

                _es.addEventListener('error', (e) => {
                    // Emit BEFORE recycling so callers see the active readyState.
                    _emit('error', e, _es ? _es.readyState : 2);
                    _unbridgeAll();
                    if (_es) { _es.close(); _es = null; }
                    _scheduleReconnect();
                });

                _es.addEventListener('message', (e) => {
                    if (e && e.lastEventId) _lastEventId = e.lastEventId;
                    _emit('message', e.data, e);
                });
            }

            /**
             * Register a listener on `eventName`.
             *
             * For custom event names, a single bridge per event-name is added
             * to the underlying EventSource and tracked so that `off()` and
             * `close()` remove it cleanly.
             */
            function on(eventName, callback) {
                if (!_listeners.has(eventName)) _listeners.set(eventName, new Set());
                _listeners.get(eventName).add(callback);

                // For custom (non-built-in) events, wire a bridge on the live ES.
                if (!BUILTIN_EVENTS.has(eventName) && eventName !== 'reconnect') {
                    _bridge(eventName);
                }
            }

            /**
             * Remove a listener. When no listeners remain for a custom event
             * name, the underlying bridge is removed from the EventSource as
             * well to avoid retaining a closure reference per orphaned event.
             */
            function off(eventName, callback) {
                const set = _listeners.get(eventName);
                if (!set) return;
                set.delete(callback);
                if (set.size === 0) {
                    _listeners.delete(eventName);
                    // Tear down the bridge for custom events.
                    if (_es && _bridges.has(eventName)) {
                        const bridge = _bridges.get(eventName);
                        try { _es.removeEventListener(eventName, bridge); } catch { /* ignore */ }
                        _bridges.delete(eventName);
                    }
                }
            }

            /**
             * Convenience: subscribe to error events with the connection
             * `readyState` as a second argument. Returns an unsubscribe function.
             *
             * @param {(event: Event, readyState: number) => void} cb
             * @returns {() => void}
             */
            function onError(cb) {
                on('error', cb);
                return () => off('error', cb);
            }

            /**
             * Convenience: subscribe to reconnect-scheduling telemetry.
             * Each callback fires with `{ attempt, delay }` just before the
             * reconnect timer is armed.
             *
             * @param {(info: {attempt: number, delay: number}) => void} cb
             * @returns {() => void}
             */
            function onReconnect(cb) {
                on('reconnect', cb);
                return () => off('reconnect', cb);
            }

            function close() {
                _closed = true;
                if (_retryTimer !== null) {
                    clearTimeout(_retryTimer);
                    _retryTimer = null;
                }
                _unbridgeAll();
                if (_es) {
                    _es.close();
                    _es = null;
                }
                _emit('close');
                _listeners.clear();
            }

            if (autoConnect) _open();

            return {
                on, off, onError, onReconnect, close,
                /**
                 * @returns {number} 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
                 */
                get readyState() {
                    if (_closed) return 2;
                    if (!_es) return 0;
                    return _es.readyState;
                },
                /** @returns {string} the configured base URL (without query mutation). */
                get url() { return url; },
                /** @returns {string|null} the most recent Last-Event-ID seen, or null. */
                get lastEventId() { return _lastEventId; },
            };
        }

        return { connect };
    },
};
