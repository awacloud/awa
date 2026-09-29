// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Geolocation sensor factory.
 *
 * Wraps `navigator.geolocation.getCurrentPosition` / `watchPosition`
 * with a normalized payload and Promise/callback ergonomics.
 *
 */

/**
 * Normalized geolocation reading.
 *
 * Note: `altitude`, `altitudeAccuracy`, `heading`, and `speed` are
 * passed through from the underlying `GeolocationCoordinates` and may
 * be `null` on devices that do not report them.
 *
 * @typedef {Object} GeolocationFix
 * @property {number} lat - Latitude in decimal degrees.
 * @property {number} lon - Longitude in decimal degrees.
 * @property {number} accuracy - Horizontal accuracy in meters.
 * @property {number|null} altitude - Altitude in meters, or null.
 * @property {number|null} altitudeAccuracy - Vertical accuracy in meters, or null.
 * @property {number|null} heading - Heading in degrees (0-360), or null.
 * @property {number|null} speed - Speed in m/s, or null.
 * @property {number} timestamp - DOMHighResTimeStamp of the fix.
 */

/**
 * Error passed to `watch` callbacks on failure.
 *
 * @typedef {Error & { code?: number }} GeolocationWatchError
 */

/**
 * Watch callback invoked with `(fix, err?)` - see `watch`.
 *
 * @callback GeolocationWatchCallback
 * @param {GeolocationFix|null} fix - Normalized reading, or `null` on error.
 * @param {GeolocationWatchError} [err] - Present only on error.
 * @returns {void}
 */

/**
 * Object returned by `geolocation.factory()`.
 *
 * @typedef {Object} GeolocationAPI
 * @property {() => boolean} isSupported `true` if the Geolocation API is available.
 * @property {(options?: PositionOptions) => Promise<GeolocationFix>} current Resolve the current device position.
 * @property {(callback: GeolocationWatchCallback, options?: PositionOptions) => (() => void)} watch Subscribe to position updates; returns a dispose function that calls `clearWatch`.
 */

export const geolocation = {
    name: 'geolocation',
    version: '1.0.0',
    type: 'fw.dom.sensors',
    dependencies: [],
    worker: false,

    /** @returns {GeolocationAPI} */
    factory() {
        /**
         * Reports whether the Geolocation API is available on `navigator`.
         *
         * @returns {boolean}
         */
        function isSupported() {
            return 'geolocation' in navigator;
        }

        /**
         * Normalize a native `GeolocationPosition` into a {@link GeolocationFix}.
         *
         * @private
         * @param {GeolocationPosition} pos
         * @returns {GeolocationFix}
         */
        function _normalize(pos) {
            return {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude,
                altitudeAccuracy: pos.coords.altitudeAccuracy,
                heading: pos.coords.heading,
                speed: pos.coords.speed,
                timestamp: pos.timestamp,
            };
        }

        /**
         * Resolve the current device position.
         *
         * @param {PositionOptions} [options] - Native `PositionOptions`.
         * @returns {Promise<GeolocationFix>} Resolves with a normalized fix.
         *   Rejects with an `Error` carrying a `code` property mirroring
         *   `GeolocationPositionError.code`, or with `'geolocation: unsupported'`.
         */
        function current(options) {
            if (!isSupported()) return Promise.reject(new Error('geolocation: unsupported'));
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    pos => resolve(_normalize(pos)),
                    err => {
                        const e = new Error(err.message);
                        // @ts-ignore - Error.code/context is a non-standard but widely-used extension
                        e.code = err.code;
                        reject(e);
                    },
                    options
                );
            });
        }

        /**
         * Subscribe to continuous position updates.
         *
         * Contract: the callback is invoked with `(fix)` on every successful
         * reading and with `(null, err)` on failure - a `(value, err?)` shape
         * (note: this is the inverse of Node's `(err, value)` convention).
         * The `err` argument is an `Error` instance with a `code` property
         * mirroring `GeolocationPositionError.code`.
         *
         * @example
         *   const stop = geolocation.watch((fix, err) => {
         *       if (err) { console.error(err.code, err.message); return; }
         *       console.log(fix.lat, fix.lon);
         *   });
         *   // ...later
         *   stop();
         *
         * @param {GeolocationWatchCallback} callback
         * @param {PositionOptions} [options] - Native `PositionOptions`.
         * @returns {() => void} Dispose function - calls `clearWatch`.
         * @throws {Error} `'geolocation: unsupported'` if the API is absent.
         */
        function watch(callback, options) {
            if (!isSupported()) throw new Error('geolocation: unsupported');
            const id = navigator.geolocation.watchPosition(
                pos => callback(_normalize(pos)),
                err => {
                    const e = new Error(err.message);
                    // @ts-ignore - Error.code/context is a non-standard but widely-used extension
                    e.code = err.code;
                    callback(null, e);
                },
                options
            );
            return () => navigator.geolocation.clearWatch(id);
        }

        return { isSupported, current, watch };
    },
};
