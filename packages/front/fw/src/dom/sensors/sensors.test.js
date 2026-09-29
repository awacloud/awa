// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { sensors as sensorsModule } from './sensors.js';

const sensors = sensorsModule.factory();

// Helper: mock window event system
function setupWindow() {
    const listeners = {};
    globalThis.window = {
        addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        removeEventListener(ev, fn) {
            if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== fn);
        },
        _fire(ev, data) { (listeners[ev] || []).forEach(fn => fn(data)); },
        _count(ev) { return (listeners[ev] || []).length; },
    };
    return listeners;
}

describe('sensors', () => {
    let savedWindow, savedDeviceMotionEvent, savedDeviceOrientationEvent, savedGyroscope, savedAccelerometer;
    beforeEach(() => {
        savedWindow = globalThis.window;
        savedDeviceMotionEvent = globalThis.DeviceMotionEvent;
        savedDeviceOrientationEvent = globalThis.DeviceOrientationEvent;
        savedGyroscope = globalThis.Gyroscope;
        savedAccelerometer = globalThis.Accelerometer;
    });
    afterEach(() => {
        globalThis.window = savedWindow;
        globalThis.DeviceMotionEvent = savedDeviceMotionEvent;
        globalThis.DeviceOrientationEvent = savedDeviceOrientationEvent;
        globalThis.Gyroscope = savedGyroscope;
        globalThis.Accelerometer = savedAccelerometer;
    });

    describe('metadata', () => {
        test('worker-safe is false', () => expect(sensorsModule.worker).toBe(false));
        test('no dependencies', () => expect(sensorsModule.dependencies).toEqual([]));
    });

    describe('orientation', () => {
        test('isSupported false when absent', () => {
            globalThis.DeviceOrientationEvent = undefined;
            expect(sensors.orientation.isSupported()).toBe(false);
        });
        test('isSupported true when present', () => {
            globalThis.DeviceOrientationEvent = {};
            expect(sensors.orientation.isSupported()).toBe(true);
        });
        test('watch receives normalized payload', () => {
            setupWindow();
            globalThis.DeviceOrientationEvent = {};
            const received = [];
            const stop = sensors.orientation.watch(e => received.push(e));
            window._fire('deviceorientation', { alpha: 10, beta: 20, gamma: 30, absolute: false, timeStamp: 100 });
            expect(received).toHaveLength(1);
            expect(received[0].alpha).toBe(10);
            expect(received[0].beta).toBe(20);
            stop();
        });
        test('stop() removes listener', () => {
            setupWindow();
            const stop = sensors.orientation.watch(() => {});
            stop();
            expect(window._count('deviceorientation')).toBe(0);
        });
    });

    describe('motion', () => {
        test('isSupported false when absent', () => {
            globalThis.DeviceMotionEvent = undefined;
            expect(sensors.motion.isSupported()).toBe(false);
        });
        test('watch receives payload', () => {
            setupWindow();
            globalThis.DeviceMotionEvent = {};
            const received = [];
            const stop = sensors.motion.watch(e => received.push(e));
            window._fire('devicemotion', {
                acceleration: { x: 1, y: 2, z: 3 },
                accelerationIncludingGravity: { x: 1, y: 2, z: 12.8 },
                rotationRate: { alpha: 0, beta: 0, gamma: 0 },
                interval: 16,
                timeStamp: 200,
            });
            expect(received).toHaveLength(1);
            expect(received[0].acceleration.x).toBe(1);
            expect(received[0].interval).toBe(16);
            stop();
        });
    });

    describe('gyroscope', () => {
        test('isSupported uses DeviceMotionEvent fallback', () => {
            globalThis.Gyroscope = undefined;
            globalThis.DeviceMotionEvent = {};
            expect(sensors.gyroscope.isSupported()).toBe(true);
        });
        test('Generic Sensor preferred over DeviceMotion', () => {
            const readings = [];
            let sensorRef;
            globalThis.Gyroscope = class {
                constructor(opts) { sensorRef = this; this.x = 1; this.y = 2; this.z = 3; this.timestamp = 500; }
                start() {}
                stop() {}
                addEventListener(ev, fn) { readings.push(fn); }
                removeEventListener() {}
            };
            setupWindow();
            const received = [];
            const stop = sensors.gyroscope.watch(e => received.push(e));
            readings[0](); // fire reading event
            expect(received).toHaveLength(1);
            expect(received[0].x).toBe(1);
            stop();
        });
        test('DeviceMotion fallback used when no Generic Sensor', () => {
            globalThis.Gyroscope = undefined;
            setupWindow();
            const received = [];
            const stop = sensors.gyroscope.watch(e => received.push(e));
            window._fire('devicemotion', {
                rotationRate: { beta: 1, gamma: 2, alpha: 3 },
                timeStamp: 300,
            });
            expect(received).toHaveLength(1);
            expect(received[0].z).toBe(3);
            stop();
        });
    });

    describe('accelerometer', () => {
        test('isSupported false when both absent', () => {
            globalThis.Accelerometer = undefined;
            globalThis.DeviceMotionEvent = undefined;
            expect(sensors.accelerometer.isSupported()).toBe(false);
        });
        test('watch DeviceMotion fallback', () => {
            globalThis.Accelerometer = undefined;
            setupWindow();
            const received = [];
            const stop = sensors.accelerometer.watch(e => received.push(e));
            window._fire('devicemotion', {
                acceleration: { x: 1, y: 2, z: 3 },
                accelerationIncludingGravity: null,
                timeStamp: 400,
            });
            expect(received).toHaveLength(1);
            expect(received[0].x).toBe(1);
            stop();
        });
    });

    describe('requestPermission', () => {
        test('returns granted when no requestPermission method (Android/desktop)', async () => {
            globalThis.DeviceMotionEvent = {}; // no requestPermission
            const status = await sensors.requestPermission();
            expect(status).toBe('granted');
        });
        test('returns unsupported when DeviceMotionEvent absent', async () => {
            globalThis.DeviceMotionEvent = undefined;
            const status = await sensors.requestPermission();
            expect(status).toBe('unsupported');
        });
        test('returns granted when iOS requestPermission grants', async () => {
            globalThis.DeviceMotionEvent = {
                requestPermission: async () => 'granted',
            };
            globalThis.DeviceOrientationEvent = {
                requestPermission: async () => 'granted',
            };
            const status = await sensors.requestPermission();
            expect(status).toBe('granted');
        });
        test('returns denied when iOS requestPermission denies', async () => {
            globalThis.DeviceMotionEvent = {
                requestPermission: async () => 'denied',
            };
            const status = await sensors.requestPermission();
            expect(status).toBe('denied');
        });
    });
});
