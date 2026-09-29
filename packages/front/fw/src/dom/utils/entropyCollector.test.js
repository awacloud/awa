// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { entropyCollector } from './entropyCollector.js';

// ── Minimal EventTarget mock as a window substitute ───────────────────────────

class MockWindow {
    constructor() {
        this._listeners = {};
    }
    addEventListener(type, fn, opts) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(fn);
    }
    removeEventListener(type, fn) {
        if (this._listeners[type]) {
            this._listeners[type] = this._listeners[type].filter(f => f !== fn);
        }
    }
    // Helper: dispatch a mock event
    dispatch(type, data = {}) {
        const fns = this._listeners[type] || [];
        for (const fn of fns) fn(data);
    }
    listenerCount(type) {
        return (this._listeners[type] || []).length;
    }
}

// ── Sensors mock factory ───────────────────────────────────────────────────────

function makeSensorsMock({ motionSupported = true, permissionResult = 'granted' } = {}) {
    // Registered motion callbacks (for manual triggering in tests)
    const motionCallbacks = [];
    const unsubscribeSpies = [];

    const motion = {
        isSupported: () => motionSupported,
        watch(cb) {
            motionCallbacks.push(cb);
            let called = false;
            const unsub = () => {
                called = true;
                const idx = motionCallbacks.indexOf(cb);
                if (idx !== -1) motionCallbacks.splice(idx, 1);
            };
            unsub._called = () => called;
            unsubscribeSpies.push(unsub);
            return unsub;
        },
        // Test helper: trigger all registered callbacks
        _trigger(data) {
            for (const cb of [...motionCallbacks]) cb(data);
        },
        _watchCount: () => motionCallbacks.length,
    };

    const requestPermission = async () => permissionResult;

    return {
        motion,
        requestPermission,
        // orientation, gyroscope, accelerometer not needed
        _unsubscribeSpies: unsubscribeSpies,
    };
}

describe('entropyCollector module', () => {

    test('has correct module metadata', () => {
        expect(entropyCollector.name).toBe('entropyCollector');
        expect(entropyCollector.dependencies).toEqual(['sensors']);
        expect(typeof entropyCollector.factory).toBe('function');
    });

    test('factory.length is 1 (accepts sensors dep)', () => {
        expect(entropyCollector.factory.length).toBe(1);
    });

    describe('factory', () => {
        let createCollector;
        let sensorsMock;

        beforeEach(() => {
            sensorsMock = makeSensorsMock();
            createCollector = entropyCollector.factory(sensorsMock).create;
        });

        test('returns a create function', () => {
            expect(typeof createCollector).toBe('function');
        });

        describe('collector instance', () => {
            let mockWindow;
            let collector;
            let samples;

            beforeEach(() => {
                mockWindow = new MockWindow();
                samples = [];
                collector = createCollector(
                    (data, bits, source) => samples.push({ data, bits, source }),
                    { target: mockWindow }
                );
            });

            test('exposes start, stop, isActive, and requestMotionPermission', () => {
                expect(typeof collector.start).toBe('function');
                expect(typeof collector.stop).toBe('function');
                expect('isActive' in collector).toBe(true);
                expect(typeof collector.requestMotionPermission).toBe('function');
            });

            test('isActive is false before start()', () => {
                expect(collector.isActive).toBe(false);
            });

            test('start() attaches event listeners to the target', async () => {
                await collector.start();
                expect(collector.isActive).toBe(true);
                // At least mousemove, keydown, touchmove should be registered.
                expect(mockWindow.listenerCount('mousemove')).toBeGreaterThan(0);
                expect(mockWindow.listenerCount('keydown')).toBeGreaterThan(0);
                expect(mockWindow.listenerCount('touchmove')).toBeGreaterThan(0);
            });

            test('start() returns an object with motionGranted', async () => {
                const result = await collector.start();
                expect(result).toHaveProperty('motionGranted');
            });

            test('start() called without event returns motionGranted: null', async () => {
                const result = await collector.start();
                expect(result.motionGranted).toBeNull();
            });

            test('start() without event calls sensors.motion.watch when supported', async () => {
                await collector.start();
                expect(sensorsMock.motion._watchCount()).toBe(1);
            });

            test('start() without event does not call sensors.motion.watch when not supported', async () => {
                const mockSensorsNoMotion = makeSensorsMock({ motionSupported: false });
                const createNoMotion = entropyCollector.factory(mockSensorsNoMotion).create;
                const c = createNoMotion(
                    (data, bits, source) => {},
                    { target: mockWindow }
                );
                await c.start();
                expect(mockSensorsNoMotion.motion._watchCount()).toBe(0);
            });

            test('start() while already active is a no-op', async () => {
                await collector.start();
                const result = await collector.start();
                expect(result.motionGranted).toBeNull();
            });

            test('stop() detaches event listeners', async () => {
                await collector.start();
                collector.stop();
                expect(collector.isActive).toBe(false);
                expect(mockWindow.listenerCount('mousemove')).toBe(0);
                expect(mockWindow.listenerCount('keydown')).toBe(0);
            });

            test('stop() calls motionUnsubscribe and resets it', async () => {
                await collector.start();
                expect(sensorsMock._unsubscribeSpies.length).toBe(1);
                const spy = sensorsMock._unsubscribeSpies[0];
                expect(spy._called()).toBe(false);
                collector.stop();
                expect(spy._called()).toBe(true);
                expect(sensorsMock.motion._watchCount()).toBe(0);
            });

            test('stop() is idempotent (safe to call twice)', async () => {
                await collector.start();
                collector.stop();
                expect(() => collector.stop()).not.toThrow();
                expect(collector.isActive).toBe(false);
            });

            test('stop() while inactive is a no-op', () => {
                expect(() => collector.stop()).not.toThrow();
            });

            test('mousemove event produces an entropy sample', async () => {
                await collector.start();
                samples.length = 0; // clear timing sample from start()
                mockWindow.dispatch('mousemove', {
                    clientX: 100,
                    clientY: 200
                });
                expect(samples.some(s => s.source === 'mouse')).toBe(true);
            });

            test('mousemove is throttled to 1 per 100ms', async () => {
                await collector.start();
                samples.length = 0;
                // Two rapid mousemove events - only the first should produce a 'mouse' sample.
                mockWindow.dispatch('mousemove', { clientX: 10, clientY: 20 });
                mockWindow.dispatch('mousemove', { clientX: 11, clientY: 21 });
                const mouseSamples = samples.filter(s => s.source === 'mouse');
                expect(mouseSamples.length).toBe(1);
            });

            test('keydown event produces a timing entropy sample', async () => {
                await collector.start();
                samples.length = 0;
                mockWindow.dispatch('keydown', {});
                expect(samples.some(s => s.source === 'keyboard')).toBe(true);
            });

            test('touchmove event produces a touch entropy sample', async () => {
                await collector.start();
                samples.length = 0;
                mockWindow.dispatch('touchmove', {
                    touches: [{ clientX: 50, clientY: 60 }],
                    changedTouches: []
                });
                expect(samples.some(s => s.source === 'touch')).toBe(true);
            });

            test('sensors.motion callback produces accelerometer entropy sample', async () => {
                await collector.start();
                samples.length = 0;
                sensorsMock.motion._trigger({
                    accelerationIncludingGravity: { x: 1.5, y: 2.3, z: 0.8 }
                });
                expect(samples.some(s => s.source === 'accelerometer')).toBe(true);
                const accSample = samples.find(s => s.source === 'accelerometer');
                expect(accSample.bits).toBe(2);
            });

            test('sensors.motion callback with null acceleration skips accelerometer sample', async () => {
                await collector.start();
                samples.length = 0;
                sensorsMock.motion._trigger({
                    accelerationIncludingGravity: null
                });
                expect(samples.some(s => s.source === 'accelerometer')).toBe(false);
                // timing should still fire
                expect(samples.some(s => s.source === 'timing')).toBe(true);
            });

            test('requestMotionPermission returns true when sensors.requestPermission returns granted', async () => {
                const result = await collector.requestMotionPermission();
                expect(result).toBe(true);
            });

            test('requestMotionPermission returns false when sensors.requestPermission returns denied', async () => {
                const deniedMock = makeSensorsMock({ permissionResult: 'denied' });
                const createDenied = entropyCollector.factory(deniedMock).create;
                const c = createDenied(() => {}, { target: mockWindow });
                const result = await c.requestMotionPermission();
                expect(result).toBe(false);
            });

            test('requestMotionPermission returns false when sensors.requestPermission returns unsupported', async () => {
                const unsupportedMock = makeSensorsMock({ permissionResult: 'unsupported' });
                const createUnsupported = entropyCollector.factory(unsupportedMock).create;
                const c = createUnsupported(() => {}, { target: mockWindow });
                const result = await c.requestMotionPermission();
                expect(result).toBe(false);
            });

            test('requestMotionPermission resolves to a boolean', async () => {
                const result = await collector.requestMotionPermission();
                expect(typeof result).toBe('boolean');
            });
        });

        describe('start() with Event - permission flow', () => {
            let mockWindow;
            let samples;

            beforeEach(() => {
                mockWindow = new MockWindow();
                samples = [];
            });

            test('start(event) with granted permission calls motion.watch and returns motionGranted: true', async () => {
                const grantedMock = makeSensorsMock({ permissionResult: 'granted', motionSupported: true });
                const create = entropyCollector.factory(grantedMock).create;
                const collector = create((d, b, s) => samples.push(s), { target: mockWindow });

                const fakeEvent = new Event('click');
                const result = await collector.start(fakeEvent);

                expect(result.motionGranted).toBe(true);
                expect(grantedMock.motion._watchCount()).toBe(1);
            });

            test('start(event) with denied permission skips motion.watch and returns motionGranted: false', async () => {
                const deniedMock = makeSensorsMock({ permissionResult: 'denied', motionSupported: true });
                const create = entropyCollector.factory(deniedMock).create;
                const collector = create((d, b, s) => samples.push(s), { target: mockWindow });

                const fakeEvent = new Event('click');
                const result = await collector.start(fakeEvent);

                expect(result.motionGranted).toBe(false);
                expect(deniedMock.motion._watchCount()).toBe(0);
            });

            test('start(event) with denied permission still attaches DOM listeners', async () => {
                const deniedMock = makeSensorsMock({ permissionResult: 'denied' });
                const create = entropyCollector.factory(deniedMock).create;
                const collector = create((d, b, s) => samples.push(s), { target: mockWindow });

                const fakeEvent = new Event('click');
                await collector.start(fakeEvent);

                expect(mockWindow.listenerCount('mousemove')).toBeGreaterThan(0);
                expect(mockWindow.listenerCount('keydown')).toBeGreaterThan(0);
                expect(mockWindow.listenerCount('touchmove')).toBeGreaterThan(0);
            });
        });

        describe('factory isolation', () => {
            test('multiple factory calls return independent create fns', () => {
                const m1 = makeSensorsMock();
                const m2 = makeSensorsMock();
                const cf1 = entropyCollector.factory(m1).create;
                const cf2 = entropyCollector.factory(m2).create;
                expect(cf1).not.toBe(cf2);
            });

            test('multiple collector instances are independent', async () => {
                const mockW2 = new MockWindow();
                const samples2 = [];
                const mockW1 = new MockWindow();
                const samples1 = [];
                const m2 = makeSensorsMock();
                const c2 = entropyCollector.factory(m2).create(
                    (d, b, s) => samples2.push(s),
                    { target: mockW2 }
                );

                const m1 = makeSensorsMock();
                const cf1 = entropyCollector.factory(m1).create;
                const c1 = cf1(
                    (d, b, s) => samples1.push(s),
                    { target: mockW1 }
                );

                await c1.start();
                await c2.start();

                c1.stop();
                expect(c2.isActive).toBe(true);
                c2.stop();
                expect(c1.isActive).toBe(false);
            });
        });
    });
});
