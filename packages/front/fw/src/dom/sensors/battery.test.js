// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { battery as batteryModule } from './battery.js';

const battery = batteryModule.factory();

function makeMockManager(overrides = {}) {
    const listeners = {};
    return {
        level: 0.75,
        charging: true,
        chargingTime: 3600,
        dischargingTime: Infinity,
        ...overrides,
        addEventListener(ev, fn) {
            (listeners[ev] = listeners[ev] || []).push(fn);
        },
        removeEventListener(ev, fn) {
            if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== fn);
        },
        _fire(ev) { (listeners[ev] || []).forEach(fn => fn()); },
        _listenerCount(ev) { return (listeners[ev] || []).length; },
    };
}

describe('battery', () => {
    let savedNav;
    beforeEach(() => { savedNav = globalThis.navigator; });
    afterEach(() => { Object.defineProperty(globalThis, 'navigator', { value: savedNav, configurable: true, writable: true }); });

    describe('metadata', () => {
        test('worker-safe is false', () => expect(batteryModule.worker).toBe(false));
        test('no dependencies', () => expect(batteryModule.dependencies).toEqual([]));
    });

    describe('isSupported', () => {
        test('false when getBattery absent', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(battery.isSupported()).toBe(false);
        });
        test('true when getBattery present', () => {
            Object.defineProperty(globalThis, 'navigator', { value: { getBattery: () => Promise.resolve(makeMockManager()) }, configurable: true, writable: true });
            expect(battery.isSupported()).toBe(true);
        });
    });

    describe('current', () => {
        test('returns normalized payload', async () => {
            const mgr = makeMockManager();
            Object.defineProperty(globalThis, 'navigator', { value: { getBattery: () => Promise.resolve(mgr) }, configurable: true, writable: true });
            const b = await battery.current();
            expect(b.level).toBe(0.75);
            expect(b.charging).toBe(true);
            expect(b.chargingTime).toBe(3600);
            expect(b.dischargingTime).toBe(Infinity);
        });

        test('throws when unsupported', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            await expect(battery.current()).rejects.toThrow('unsupported');
        });
    });

    describe('watch', () => {
        test('initial callback on setup', async () => {
            const mgr = makeMockManager();
            Object.defineProperty(globalThis, 'navigator', { value: { getBattery: () => Promise.resolve(mgr) }, configurable: true, writable: true });
            const received = [];
            const stop = battery.watch(b => received.push(b));
            await Promise.resolve(); // flush microtask for getBattery
            await Promise.resolve();
            expect(received.length).toBeGreaterThanOrEqual(1);
            expect(received[0].level).toBe(0.75);
            stop();
        });

        test('callback triggered on levelchange', async () => {
            const mgr = makeMockManager();
            Object.defineProperty(globalThis, 'navigator', { value: { getBattery: () => Promise.resolve(mgr) }, configurable: true, writable: true });
            const received = [];
            const stop = battery.watch(b => received.push(b));
            await Promise.resolve();
            await Promise.resolve();
            mgr.level = 0.5;
            mgr._fire('levelchange');
            expect(received[received.length - 1].level).toBe(0.5);
            stop();
        });

        test('stop() removes all listeners', async () => {
            const mgr = makeMockManager();
            Object.defineProperty(globalThis, 'navigator', { value: { getBattery: () => Promise.resolve(mgr) }, configurable: true, writable: true });
            const stop = battery.watch(() => {});
            await Promise.resolve();
            await Promise.resolve();
            stop();
            const EVENTS = ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'];
            EVENTS.forEach(ev => expect(mgr._listenerCount(ev)).toBe(0));
        });

        test('throws when unsupported', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(() => battery.watch(() => {})).toThrow('unsupported');
        });
    });
});
