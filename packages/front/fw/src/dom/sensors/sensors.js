// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Aggregate motion/orientation sensors factory.
 *
 * Exposes four sub-APIs - `orientation`, `motion`, `gyroscope`,
 * `accelerometer` - plus an iOS 13+ `requestPermission` helper. The
 * `gyroscope` and `accelerometer` sub-APIs prefer the Generic Sensor
 * API (`Gyroscope`, `Accelerometer`, `GravitySensor`) and fall back
 * to `DeviceMotionEvent` when those classes are unavailable.
 *
 * Note on axis conventions: the Generic Sensor API and the
 * `DeviceMotionEvent.rotationRate` field follow **different axis
 * conventions**. The Generic Sensor `Gyroscope` exposes
 * `x`/`y`/`z` aligned with the device's screen coordinate system,
 * whereas `DeviceMotionEvent.rotationRate` exposes
 * `alpha`/`beta`/`gamma` around the device's z/x/y axes
 * respectively. The fallback in this module maps
 * `beta → x`, `gamma → y`, `alpha → z` as a best-effort
 * approximation; readings may differ in sign and magnitude across
 * the two paths. Consumers that switch between paths should
 * recalibrate or restrict themselves to a single path.
 *
 * Note on `isSupported` semantics: for `gyroscope` and `accelerometer`,
 * `isSupported()` reports whether the relevant **API** is present -
 * it does not probe for actual hardware. On most desktops
 * `DeviceMotionEvent` is defined but no events fire.
 *
 */

/**
 * @typedef {Object} OrientationReading
 * @property {number|null} alpha - Rotation around z-axis (0-360°).
 * @property {number|null} beta - Rotation around x-axis (-180-180°).
 * @property {number|null} gamma - Rotation around y-axis (-90-90°).
 * @property {boolean} absolute - `true` for absolute orientation.
 * @property {number} timestamp - `event.timeStamp`.
 */

/**
 * @typedef {Object} MotionReading
 * @property {{x:number,y:number,z:number}|null} acceleration - Acceleration excluding gravity (m/s²).
 * @property {{x:number,y:number,z:number}|null} accelerationIncludingGravity - Acceleration including gravity (m/s²).
 * @property {{alpha:number,beta:number,gamma:number}|null} rotationRate - Rotation rate (°/s).
 * @property {number} interval - Sampling interval in ms.
 * @property {number} timestamp - `event.timeStamp`.
 */

/**
 * @typedef {Object} GyroReading
 * @property {number|null} x - Rotation rate around x-axis (rad/s, Generic Sensor) or °/s (fallback).
 * @property {number|null} y - Rotation rate around y-axis.
 * @property {number|null} z - Rotation rate around z-axis.
 * @property {number} timestamp - Sensor timestamp or `event.timeStamp`.
 */

/**
 * @typedef {Object} AccelReading
 * @property {number|null} x - Acceleration along x-axis (m/s²).
 * @property {number|null} y - Acceleration along y-axis.
 * @property {number|null} z - Acceleration along z-axis.
 * @property {number} timestamp - Sensor timestamp or `event.timeStamp`.
 */

/**
 * Device orientation sub-API.
 * @typedef {Object} OrientationAPI
 * @property {() => boolean} isSupported `true` if `DeviceOrientationEvent` is defined.
 * @property {(callback: (reading: OrientationReading) => void, opts?: { absolute?: boolean }) => (() => void)} watch Subscribe to orientation events; returns a dispose function.
 */

/**
 * Device motion sub-API.
 * @typedef {Object} MotionAPI
 * @property {() => boolean} isSupported `true` if `DeviceMotionEvent` is defined.
 * @property {(callback: (reading: MotionReading) => void) => (() => void)} watch Subscribe to motion events; returns a dispose function.
 */

/**
 * Gyroscope sub-API (Generic Sensor preferred, DeviceMotion fallback).
 * @typedef {Object} GyroscopeAPI
 * @property {() => boolean} isSupported `true` if `Gyroscope` or `DeviceMotionEvent` is defined.
 * @property {(callback: (reading: GyroReading) => void, opts?: { frequency?: number }) => (() => void)} watch Subscribe to gyroscope readings; returns a dispose function.
 */

/**
 * Accelerometer sub-API (Generic Sensor preferred, DeviceMotion fallback).
 * @typedef {Object} AccelerometerAPI
 * @property {() => boolean} isSupported `true` if `Accelerometer` or `DeviceMotionEvent` is defined.
 * @property {(callback: (reading: AccelReading) => void, opts?: { frequency?: number, includeGravity?: boolean }) => (() => void)} watch Subscribe to accelerometer readings; returns a dispose function.
 */

/**
 * Object returned by `sensors.factory()`.
 * @typedef {Object} SensorsAPI
 * @property {OrientationAPI} orientation Device orientation sub-API.
 * @property {MotionAPI} motion Device motion sub-API.
 * @property {GyroscopeAPI} gyroscope Gyroscope sub-API.
 * @property {AccelerometerAPI} accelerometer Accelerometer sub-API.
 * @property {() => Promise<'granted'|'denied'|'unsupported'>} requestPermission Request motion/orientation permission (iOS 13+).
 */

export const sensors = {
    name: 'sensors',
    version: '1.0.0',
    type: 'fw.dom.sensors',
    dependencies: [],
    worker: false,

    /** @returns {SensorsAPI} */
    factory() {
        // --- orientation (DeviceOrientationEvent) ---
        /**
         * Device orientation sub-API.
         *
         * @namespace orientation
         */
        const orientation = {
            /**
             * @returns {boolean} `true` if `DeviceOrientationEvent` is defined.
             */
            isSupported() {
                return typeof DeviceOrientationEvent !== 'undefined';
            },
            /**
             * Subscribe to `deviceorientation` events.
             *
             * @param {(reading: OrientationReading) => void} callback
             * @param {{ absolute?: boolean }} [opts] - When `absolute` is true,
             *   listens to `deviceorientationabsolute` instead.
             * @returns {() => void} Dispose function.
             */
            watch(callback, { absolute = false } = {}) {
                const eventName = absolute ? 'deviceorientationabsolute' : 'deviceorientation';
                function handler(e) {
                    callback({
                        alpha: e.alpha,
                        beta: e.beta,
                        gamma: e.gamma,
                        absolute: e.absolute,
                        timestamp: e.timeStamp,
                    });
                }
                window.addEventListener(eventName, handler);
                return () => window.removeEventListener(eventName, handler);
            },
        };

        // --- motion (DeviceMotionEvent) ---
        /**
         * Device motion sub-API.
         *
         * @namespace motion
         */
        const motion = {
            /**
             * @returns {boolean} `true` if `DeviceMotionEvent` is defined.
             */
            isSupported() {
                return typeof DeviceMotionEvent !== 'undefined';
            },
            /**
             * Subscribe to `devicemotion` events.
             *
             * @param {(reading: MotionReading) => void} callback
             * @returns {() => void} Dispose function.
             */
            watch(callback) {
                function handler(e) {
                    callback({
                        acceleration: e.acceleration,
                        accelerationIncludingGravity: e.accelerationIncludingGravity,
                        rotationRate: e.rotationRate,
                        interval: e.interval,
                        timestamp: e.timeStamp,
                    });
                }
                window.addEventListener('devicemotion', handler);
                return () => window.removeEventListener('devicemotion', handler);
            },
        };

        // --- gyroscope (Generic Sensor API preferred, DeviceMotion fallback) ---
        /**
         * Gyroscope sub-API - Generic Sensor preferred, DeviceMotion fallback.
         *
         * See the module note on axis-convention differences between the
         * Generic Sensor `Gyroscope` and the `DeviceMotionEvent.rotationRate`
         * fallback.
         *
         * @namespace gyroscope
         */
        const gyroscope = {
            /**
             * @returns {boolean} `true` if either `Gyroscope` (Generic Sensor)
             *   or `DeviceMotionEvent` is defined. Does not probe hardware.
             */
            isSupported() {
                // @ts-ignore - Gyroscope is a W3C Generic Sensor API not yet in TS lib types
                return typeof Gyroscope !== 'undefined' || typeof DeviceMotionEvent !== 'undefined';
            },
            /**
             * Subscribe to gyroscope readings.
             *
             * @param {(reading: GyroReading) => void} callback
             * @param {{ frequency?: number }} [opts] - Sampling frequency in Hz
             *   for the Generic Sensor path (default 60). Ignored by the fallback.
             * @returns {() => void} Dispose function.
             */
            watch(callback, { frequency = 60 } = {}) {
                // @ts-ignore - Gyroscope is a W3C Generic Sensor API not yet in TS lib types
                if (typeof Gyroscope !== 'undefined') {
                    // @ts-ignore - Gyroscope is a W3C Generic Sensor API not yet in TS lib types
                    const sensor = new Gyroscope({ frequency });
                    function handler() {
                        callback({ x: sensor.x, y: sensor.y, z: sensor.z, timestamp: sensor.timestamp });
                    }
                    sensor.addEventListener('reading', handler);
                    sensor.start();
                    return () => { sensor.stop(); sensor.removeEventListener('reading', handler); };
                }
                // DeviceMotion fallback - note: axis mapping differs from Generic Sensor.
                function handler(e) {
                    const rr = e.rotationRate;
                    callback({
                        x: rr ? rr.beta : null,
                        y: rr ? rr.gamma : null,
                        z: rr ? rr.alpha : null,
                        timestamp: e.timeStamp,
                    });
                }
                window.addEventListener('devicemotion', handler);
                return () => window.removeEventListener('devicemotion', handler);
            },
        };

        // --- accelerometer (Generic Sensor API preferred, DeviceMotion fallback) ---
        /**
         * Accelerometer sub-API - Generic Sensor preferred, DeviceMotion fallback.
         *
         * When `includeGravity: true` and `GravitySensor` is available, uses
         * `GravitySensor` (Chrome 67+); otherwise falls back to `Accelerometer`
         * (which excludes gravity) on the Generic Sensor path, or to
         * `accelerationIncludingGravity` on the DeviceMotion path.
         *
         * @namespace accelerometer
         */
        const accelerometer = {
            /**
             * @returns {boolean} `true` if either `Accelerometer` (Generic Sensor)
             *   or `DeviceMotionEvent` is defined. Does not probe hardware.
             */
            isSupported() {
                // @ts-ignore - Accelerometer is a W3C Generic Sensor API not yet in TS lib types
                return typeof Accelerometer !== 'undefined' || typeof DeviceMotionEvent !== 'undefined';
            },
            /**
             * Subscribe to accelerometer readings.
             *
             * @param {(reading: AccelReading) => void} callback
             * @param {{ frequency?: number, includeGravity?: boolean }} [opts]
             *   - `frequency`: sampling frequency in Hz for the Generic Sensor path
             *     (default 60).
             *   - `includeGravity`: when true, prefer `GravitySensor` on the
             *     Generic Sensor path (if defined) and use
             *     `accelerationIncludingGravity` on the DeviceMotion fallback.
             * @returns {() => void} Dispose function.
             */
            watch(callback, { frequency = 60, includeGravity = false } = {}) {
                // @ts-ignore - Accelerometer/GravitySensor are W3C Generic Sensor APIs not yet in TS lib types
                if (typeof Accelerometer !== 'undefined') {
                    // @ts-ignore - Accelerometer/GravitySensor are W3C Generic Sensor APIs not yet in TS lib types
                    const SensorClass = includeGravity && typeof GravitySensor !== 'undefined'
                        // @ts-ignore - Accelerometer/GravitySensor are W3C Generic Sensor APIs not yet in TS lib types
                        ? GravitySensor : Accelerometer;
                    const sensor = new SensorClass({ frequency });
                    function handler() {
                        callback({ x: sensor.x, y: sensor.y, z: sensor.z, timestamp: sensor.timestamp });
                    }
                    sensor.addEventListener('reading', handler);
                    sensor.start();
                    return () => { sensor.stop(); sensor.removeEventListener('reading', handler); };
                }
                // DeviceMotion fallback
                function handler(e) {
                    const a = includeGravity ? e.accelerationIncludingGravity : e.acceleration;
                    callback({
                        x: a ? a.x : null,
                        y: a ? a.y : null,
                        z: a ? a.z : null,
                        timestamp: e.timeStamp,
                    });
                }
                window.addEventListener('devicemotion', handler);
                return () => window.removeEventListener('devicemotion', handler);
            },
        };

        // --- requestPermission (iOS 13+) ---
        /**
         * Request motion/orientation permission (iOS 13+).
         *
         * Resolves with:
         *   - `'granted'` if both motion and orientation permissions are
         *     granted, or if the platform does not require permission
         *     (Android, desktop, older iOS).
         *   - `'denied'` if either permission is denied, or if the
         *     underlying `requestPermission` call throws.
         *   - `'unsupported'` if `DeviceMotionEvent` itself is undefined.
         *
         * Must be invoked from a user-gesture handler on iOS.
         *
         * @returns {Promise<'granted'|'denied'|'unsupported'>}
         */
        async function requestPermission() {
            if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
            // @ts-ignore - requestPermission is an iOS 13+ extension not in TS lib types
            if (typeof DeviceMotionEvent.requestPermission !== 'function') return 'granted';
            try {
                const [motionStatus, orientationStatus] = await Promise.all([
                    // @ts-ignore - requestPermission is an iOS 13+ extension not in TS lib types
                    DeviceMotionEvent.requestPermission(),
                    // @ts-ignore - requestPermission is an iOS 13+ extension not in TS lib types
                    typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'
                        // @ts-ignore - requestPermission is an iOS 13+ extension not in TS lib types
                        ? DeviceOrientationEvent.requestPermission()
                        : Promise.resolve('granted'),
                ]);
                if (motionStatus === 'denied' || orientationStatus === 'denied') return 'denied';
                return 'granted';
            } catch {
                return 'denied';
            }
        }

        return { orientation, motion, gyroscope, accelerometer, requestPermission };
    },
};
