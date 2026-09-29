// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { geolocation as geolocationModule } from './geolocation.js';

const geolocation = geolocationModule.factory();

const MOCK_POSITION = {
    coords: {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
    },
    timestamp: 1000,
};

function makeGeo({ success = true, error = null, watchPositions = [] } = {}) {
    let watchId = 0;
    const watchers = {};
    return {
        getCurrentPosition(successCb, errorCb) {
            if (success) successCb(MOCK_POSITION);
            else errorCb(error);
        },
        watchPosition(successCb, errorCb) {
            const id = ++watchId;
            watchers[id] = { successCb, errorCb };
            return id;
        },
        clearWatch(id) {
            delete watchers[id];
        },
        _fire(id, pos) { watchers[id]?.successCb(pos); },
        _fireError(id, err) { watchers[id]?.errorCb(err); },
        _hasWatcher(id) { return id in watchers; },
    };
}

describe('geolocation', () => {
    describe('metadata', () => {
        test('worker-safe is false', () => {
            expect(geolocationModule.worker).toBe(false);
        });
        test('no dependencies', () => {
            expect(geolocationModule.dependencies).toEqual([]);
        });
    });

    describe('isSupported', () => {
        test('returns false when geolocation absent', () => {
            const saved = globalThis.navigator;
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(geolocation.isSupported()).toBe(false);
            Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true, writable: true });
        });

        test('returns true when geolocation present', () => {
            const saved = globalThis.navigator;
            Object.defineProperty(globalThis, 'navigator', { value: { geolocation: makeGeo() }, configurable: true, writable: true });
            expect(geolocation.isSupported()).toBe(true);
            Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true, writable: true });
        });
    });

    describe('current', () => {
        let savedNav;
        beforeEach(() => { savedNav = globalThis.navigator; });
        afterEach(() => { Object.defineProperty(globalThis, 'navigator', { value: savedNav, configurable: true, writable: true }); });

        test('returns normalized payload', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: { geolocation: makeGeo({ success: true }) }, configurable: true, writable: true });
            const pos = await geolocation.current();
            expect(pos.lat).toBe(48.8566);
            expect(pos.lon).toBe(2.3522);
            expect(pos.accuracy).toBe(10);
            expect(pos.timestamp).toBe(1000);
            expect(pos.altitude).toBeNull();
        });

        test('rejects with error code 1 (denied)', async () => {
            const err = { message: 'User denied', code: 1 };
            Object.defineProperty(globalThis, 'navigator', { value: { geolocation: makeGeo({ success: false, error: err }) }, configurable: true, writable: true });
            await expect(geolocation.current()).rejects.toMatchObject({ code: 1 });
        });

        test('rejects when unsupported', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            await expect(geolocation.current()).rejects.toThrow('unsupported');
        });
    });

    describe('watch', () => {
        let savedNav;
        let mockGeo;
        beforeEach(() => {
            savedNav = globalThis.navigator;
            mockGeo = makeGeo();
            Object.defineProperty(globalThis, 'navigator', { value: { geolocation: mockGeo }, configurable: true, writable: true });
        });
        afterEach(() => { Object.defineProperty(globalThis, 'navigator', { value: savedNav, configurable: true, writable: true }); });

        test('calls callback with normalized position', () => {
            const received = [];
            const stop = geolocation.watch(pos => received.push(pos));
            mockGeo._fire(1, MOCK_POSITION);
            mockGeo._fire(1, { ...MOCK_POSITION, timestamp: 2000 });
            expect(received).toHaveLength(2);
            expect(received[0].lat).toBe(48.8566);
            expect(received[1].timestamp).toBe(2000);
            stop();
        });

        test('stop() clears the watch', () => {
            const received = [];
            const stop = geolocation.watch(pos => received.push(pos));
            mockGeo._fire(1, MOCK_POSITION);
            stop();
            expect(mockGeo._hasWatcher(1)).toBe(false);
            mockGeo._fire(1, MOCK_POSITION);
            expect(received).toHaveLength(1);
        });

        test('throws when unsupported', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(() => geolocation.watch(() => {})).toThrow('unsupported');
        });
    });
});
