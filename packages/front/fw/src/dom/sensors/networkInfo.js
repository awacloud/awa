// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Network Information sensor factory.
 *
 * Wraps `navigator.connection` with a normalized snapshot and a
 * change-watcher.
 *
 * Note: the Network Information API is **non-standard** and currently
 * shipped only by Chromium-based browsers (and Samsung Internet).
 * Safari and Firefox return `undefined` for `navigator.connection`, so
 * `isSupported()` reports `false` and `current`/`watch` throw on those
 * browsers - always check `isSupported()` before relying on this module.
 *
 */

/**
 * Normalized network information snapshot.
 *
 * A `timestamp` field (milliseconds since the Unix epoch) is included
 * for parity with the geolocation reading, even though the underlying
 * `NetworkInformation` object exposes no native timestamp.
 *
 * @typedef {Object} NetworkInfo
 * @property {number} downlink - Effective bandwidth estimate in Mbps.
 * @property {number|undefined} downlinkMax - Max downlink for the underlying connection technology, or `undefined` (e.g. WiFi on Chromium).
 * @property {'slow-2g'|'2g'|'3g'|'4g'} effectiveType - Effective connection type.
 * @property {number} rtt - Estimated round-trip time in ms.
 * @property {boolean} saveData - User has requested reduced data usage.
 * @property {'bluetooth'|'cellular'|'ethernet'|'none'|'wifi'|'wimax'|'other'|'unknown'} type - Underlying connection type.
 * @property {number} timestamp - `Date.now()` at the time of the snapshot.
 */

/**
 * Watch callback invoked on every `change` event with a fresh snapshot.
 *
 * @callback NetworkInfoWatchCallback
 * @param {NetworkInfo} info
 * @returns {void}
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
 * Object returned by `networkInfo.factory()`.
 *
 * @typedef {Object} NetworkInfoAPI
 * @property {() => boolean} isSupported `true` if `navigator.connection` is available.
 * @property {() => NetworkInfo} current Return the current network information snapshot (synchronous).
 * @property {(callback: NetworkInfoWatchCallback) => (() => void)} watch Subscribe to connection changes; returns a dispose function.
 */

export const networkInfo = {
    name: 'networkInfo',
    version: '1.0.0',
    type: 'fw.dom.sensors',
    dependencies: [],
    worker: false,

    /** @returns {NetworkInfoAPI} */
    factory() {
        /**
         * Reports whether `navigator.connection` is available.
         *
         * @returns {boolean}
         */
        function isSupported() {
            return 'connection' in navigator;
        }

        /**
         * Normalize a native `NetworkInformation` into a {@link NetworkInfo}.
         *
         * @private
         // @ts-ignore - vendor/experimental API not yet in TS lib types
         * @param {NetworkInformation} conn
         * @returns {NetworkInfo}
         */
        function _normalize(conn) {
            return {
                downlink: conn.downlink,
                // @ts-ignore - NetworkInformation is vendor API; TS typedef may differ
                downlinkMax: conn.downlinkMax,
                // @ts-ignore - NetworkInformation is vendor API; TS typedef may differ
                effectiveType: conn.effectiveType,
                rtt: conn.rtt,
                saveData: conn.saveData,
                // @ts-ignore - NetworkInformation is vendor API; TS typedef may differ
                type: conn.type,
                timestamp: Date.now(),
            };
        }

        /**
         * Resolve the current network information snapshot.
         *
         * @returns {NetworkInfo}
         * @throws {Error} `'networkInfo: unsupported'` if the API is absent.
         */
        function current() {
            if (!isSupported()) throw new Error('networkInfo: unsupported');
            // @ts-ignore - vendor/experimental API not yet in TS lib types
            return _normalize(navigator.connection);
        }

        /**
         * Subscribe to network connection changes.
         *
         * @param {NetworkInfoWatchCallback} callback
         * @returns {() => void} Dispose function - removes the listener.
         * @throws {Error} `'networkInfo: unsupported'` if the API is absent.
         */
        function watch(callback) {
            if (!isSupported()) throw new Error('networkInfo: unsupported');
            // @ts-ignore - vendor/experimental API not yet in TS lib types
            const conn = navigator.connection;
            function handler() { callback(_normalize(conn)); }
            conn.addEventListener('change', handler);
            return () => conn.removeEventListener('change', handler);
        }

        return { isSupported, current, watch };
    },
};
