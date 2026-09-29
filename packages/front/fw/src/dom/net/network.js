// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Network status and capability primitives.
 *
 * - Online/offline detection via `navigator.onLine` plus `online` / `offline`
 *   window events.
 * - Active-connection snapshot via the Network Information API
 *   (`navigator.connection`), exposing `effectiveType`, `downlink`, `rtt`,
 *   `saveData`, and `type` so apps can adapt image quality, prefetch budget
 *   and similar UX choices.
 * - `onConnectionChange(fn)` subscriber bridging `navigator.connection`'s
 *   `change` event with the same scope sub-API pattern as the rest of fw.
 * - Reachability `ping(url)` helper backed by `fetch`.
 *
 * worker-safe: partial - `navigator.onLine` and `navigator.connection` are
 * available in workers; `online`/`offline` window events are main-thread only.
 */

/**
 * @typedef {Object} NetworkInformation
 * @property {string} [effectiveType]
 * @property {number} [downlink]
 * @property {number} [rtt]
 * @property {boolean} [saveData]
 * @property {string} [type]
 * @property {function(string, function): void} addEventListener
 * @property {function(string, function): void} removeEventListener
 */

/**
 * Frozen snapshot of `navigator.connection`.
 * @typedef {Object} ConnectionSnapshot
 * @property {string|null} effectiveType
 * @property {number|null} downlink
 * @property {number|null} rtt
 * @property {boolean} saveData
 * @property {string|null} type
 */

/**
 * Public API returned by `network.factory()`.
 *
 * @typedef {Object} NetworkAPI
 * @property {() => boolean} isOnline Whether the browser believes it is online.
 * @property {(callback: () => void) => (() => void)} onOnline Subscribe to `online`; returns an unsubscribe.
 * @property {(callback: () => void) => (() => void)} onOffline Subscribe to `offline`; returns an unsubscribe.
 * @property {(callback: (online: boolean) => void, opts?: {immediate?: boolean}) => (() => void)} onChange Subscribe to online/offline changes; returns an unsubscribe.
 * @property {() => (ConnectionSnapshot|null)} connection Snapshot of `navigator.connection`, or `null`.
 * @property {(callback: (snapshot: ConnectionSnapshot|null) => void, opts?: {immediate?: boolean}) => (() => void)} onConnectionChange Subscribe to connection changes; returns an unsubscribe.
 * @property {() => boolean} saveData Whether the Data Saver preference is on.
 * @property {(url: string, opts?: {timeout?: number, method?: string}) => Promise<boolean>} ping Reachability check via `fetch`.
 * @property {() => void} off Remove all listeners and detach event bindings.
 */

export const network = {
    name: 'network',
    type: 'fw.dom.net',
    dependencies: [],

    /** @returns {NetworkAPI} */
    factory() {
        const _listeners = {
            online: new Set(),
            offline: new Set(),
            change: new Set(),
            connection: new Set(),
        };
        let _boundOnline, _boundOffline, _boundConnection;

        /**
         * Resolve the `window`/`self` target used for online/offline events.
         */
        function _eventTarget() {
            return typeof window !== 'undefined'
                ? window
                : (typeof self !== 'undefined' ? self : null);
        }

        /**
         * Resolve the live `navigator.connection` (with vendor-prefix fallbacks).
         // @ts-ignore - vendor/experimental API not yet in TS lib types
         * @returns {NetworkInformation|null}
         */
        function _conn() {
            if (typeof navigator === 'undefined') return null;
            return (
                // @ts-ignore - vendor/experimental API not yet in TS lib types
                navigator.connection
                // @ts-ignore - vendor/experimental API not yet in TS lib types
                ?? navigator.mozConnection
                // @ts-ignore - vendor/experimental API not yet in TS lib types
                ?? navigator.webkitConnection
                ?? null
            );
        }

        /**
         * Lazily attach `online` / `offline` listeners. Idempotent.
         */
        function _attach() {
            if (_boundOnline) return;
            _boundOnline = () => {
                for (const fn of _listeners.online) fn();
                for (const fn of _listeners.change) fn(true);
            };
            _boundOffline = () => {
                for (const fn of _listeners.offline) fn();
                for (const fn of _listeners.change) fn(false);
            };
            const target = _eventTarget();
            if (target) {
                target.addEventListener('online', _boundOnline);
                target.addEventListener('offline', _boundOffline);
            }
        }

        /**
         * Lazily attach the `navigator.connection.change` listener. Idempotent.
         * Bails out silently when the Network Information API is unavailable.
         */
        function _attachConnection() {
            if (_boundConnection) return;
            const c = _conn();
            if (!c || typeof c.addEventListener !== 'function') return;
            _boundConnection = () => {
                const snap = connection();
                for (const fn of _listeners.connection) fn(snap);
            };
            c.addEventListener('change', _boundConnection);
        }

        /**
         * @returns {boolean} `true` when the browser believes it is online.
         *   Falls back to `true` outside a navigator-bearing environment.
         */
        function isOnline() {
            return typeof navigator !== 'undefined' ? navigator.onLine : true;
        }

        /**
         * Snapshot of `navigator.connection`.
         *
         * @returns {{effectiveType: string|null, downlink: number|null,
         *           rtt: number|null, saveData: boolean, type: string|null}|null}
         *   `null` when the Network Information API is not available.
         */
        function connection() {
            const c = _conn();
            if (!c) return null;
            return Object.freeze({
                effectiveType: c.effectiveType ?? null,
                downlink:      typeof c.downlink === 'number' ? c.downlink : null,
                rtt:           typeof c.rtt === 'number' ? c.rtt : null,
                saveData:      !!c.saveData,
                type:          c.type ?? null,
            });
        }

        /**
         * Convenience shortcut for the "Data Saver" preference.
         * @returns {boolean} `true` when the user has requested reduced data
         *   usage, `false` when the API is missing or the flag is off.
         */
        function saveData() {
            const c = _conn();
            return !!(c && c.saveData);
        }

        function onOnline(callback) {
            _attach();
            _listeners.online.add(callback);
            return () => _listeners.online.delete(callback);
        }

        function onOffline(callback) {
            _attach();
            _listeners.offline.add(callback);
            return () => _listeners.offline.delete(callback);
        }

        function onChange(callback, { immediate = true } = {}) {
            _attach();
            _listeners.change.add(callback);
            if (immediate) callback(isOnline());
            return () => _listeners.change.delete(callback);
        }

        /**
         * Subscribe to `navigator.connection.change`.
         *
         * The callback receives the same frozen snapshot shape as
         * {@link connection}. When `immediate` is true (default), the
         * callback fires once synchronously with the current snapshot so
         * subscribers do not have to read it separately.
         *
         * Returns a no-op unsubscribe when the Network Information API is
         * absent - code paths that depend on it will simply never fire.
         *
         * @param {(snapshot: ReturnType<typeof connection>) => void} callback
         * @param {{immediate?: boolean}} [opts]
         * @returns {() => void} unsubscribe handle
         */
        function onConnectionChange(callback, { immediate = true } = {}) {
            _attachConnection();
            _listeners.connection.add(callback);
            if (immediate) callback(connection());
            return () => _listeners.connection.delete(callback);
        }

        async function ping(url, { timeout = 3000, method = 'HEAD' } = {}) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            try {
                await fetch(url, {
                    method,
                    cache: 'no-store',
                    signal: controller.signal,
                    mode: 'no-cors',
                });
                return true;
            } catch {
                return false;
            } finally {
                clearTimeout(timer);
            }
        }

        function off() {
            _listeners.online.clear();
            _listeners.offline.clear();
            _listeners.change.clear();
            _listeners.connection.clear();

            const target = _eventTarget();
            if (target && _boundOnline) {
                target.removeEventListener('online', _boundOnline);
                target.removeEventListener('offline', _boundOffline);
            }
            _boundOnline = null;
            _boundOffline = null;

            const c = _conn();
            if (c && _boundConnection && typeof c.removeEventListener === 'function') {
                c.removeEventListener('change', _boundConnection);
            }
            _boundConnection = null;
        }

        return {
            isOnline,
            onOnline, onOffline, onChange,
            connection, onConnectionChange, saveData,
            ping, off,
        };
    },
};
