// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Battery sensor factory.
 *
 * Wraps `navigator.getBattery()` with a normalized snapshot and a
 * change-watcher that aggregates the four standard `BatteryManager`
 * events (`levelchange`, `chargingchange`, `chargingtimechange`,
 * `dischargingtimechange`).
 *
 */

/**
 * Normalized battery snapshot.
 *
 * Note: unlike geolocation/networkInfo readings, this payload does
 * not include a `timestamp` field - `BatteryManager` is a stateful
 * object and changes fire as events rather than as discrete samples.
 *
 * @typedef {Object} BatteryStatus
 * @property {number} level - Charge level in `[0, 1]`.
 * @property {boolean} charging - `true` while charging.
 * @property {number} chargingTime - Seconds until fully charged, or `Infinity`.
 * @property {number} dischargingTime - Seconds until empty, or `Infinity`.
 */

/**
 * Watch callback. On success invoked with `(status)`. If `getBattery()`
 * rejects after the watch has started, invoked with `(null, err)` for
 * parity with the geolocation watch contract.
 *
 * @callback BatteryWatchCallback
 * @param {BatteryStatus|null} status
 * @param {Error} [err]
 * @returns {void}
 */


/**
 * @typedef {Object} BatteryManager
 * @property {boolean} charging
 * @property {number} chargingTime
 * @property {number} dischargingTime
 * @property {number} level
 * @property {function(string, function): void} addEventListener
 * @property {function(string, function): void} removeEventListener
 */

/**
 * Object returned by `battery.factory()`.
 *
 * @typedef {Object} BatteryAPI
 * @property {() => boolean} isSupported `true` if the Battery Status API is available.
 * @property {() => Promise<BatteryStatus>} current Resolve the current battery snapshot.
 * @property {(callback: BatteryWatchCallback) => (() => void)} watch Subscribe to battery changes; returns a dispose function.
 */

export const battery = {
    name: 'battery',
    version: '1.0.0',
    type: 'fw.dom.sensors',
    dependencies: [],
    worker: false,

    /** @returns {BatteryAPI} */
    factory() {
        /**
         * Reports whether the Battery Status API is available on `navigator`.
         *
         * @returns {boolean}
         */
        function isSupported() {
            return 'getBattery' in navigator;
        }

        /**
         * Normalize a native `BatteryManager` into a {@link BatteryStatus}.
         *
         * @private
         // @ts-ignore - vendor/experimental API not yet in TS lib types
         * @param {BatteryManager} mgr
         * @returns {BatteryStatus}
         */
        function _normalize(mgr) {
            return {
                level: mgr.level,
                charging: mgr.charging,
                chargingTime: mgr.chargingTime,
                dischargingTime: mgr.dischargingTime,
            };
        }

        /**
         * Resolve the current battery snapshot.
         *
         * @returns {Promise<BatteryStatus>}
         * @throws {Error} `'battery: unsupported'` if the API is absent.
         */
        async function current() {
            if (!isSupported()) throw new Error('battery: unsupported');
            // @ts-ignore - vendor/experimental API not yet in TS lib types
            const mgr = await navigator.getBattery();
            return _normalize(mgr);
        }

        /**
         * Subscribe to battery status changes.
         *
         * Fires the callback once initially with the current snapshot,
         * then on every `levelchange`/`chargingchange`/`chargingtimechange`/
         * `dischargingtimechange` event.
         *
         * If `navigator.getBattery()` rejects after the watch starts (rare
         * but possible in restricted contexts), the callback is invoked
         * with `(null, err)` to mirror the geolocation watch contract.
         *
         * @param {BatteryWatchCallback} callback
         * @returns {() => void} Dispose function - removes all listeners.
         * @throws {Error} `'battery: unsupported'` if the API is absent.
         */
        function watch(callback) {
            if (!isSupported()) throw new Error('battery: unsupported');

            let mgr = null;
            let stopped = false;

            const EVENTS = ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'];

            function handler() {
                if (!stopped) callback(_normalize(mgr));
            }

            // @ts-ignore - vendor/experimental API not yet in TS lib types
            navigator.getBattery().then(m => {
                if (stopped) return;
                mgr = m;
                EVENTS.forEach(ev => mgr.addEventListener(ev, handler));
                callback(_normalize(mgr));
            }).catch(err => {
                if (!stopped) callback(null, err);
            });

            return function stop() {
                stopped = true;
                if (mgr) EVENTS.forEach(ev => mgr.removeEventListener(ev, handler));
            };
        }

        return { isSupported, current, watch };
    },
};
