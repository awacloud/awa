// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { network } from './network.js';

let originalNavigator, originalWindow;

beforeEach(() => {
    originalNavigator = globalThis.navigator;
    originalWindow = globalThis.window;
    // Provide a minimal window mock with event support
    const _listeners = {};
    Object.defineProperty(globalThis, 'window', { value: {
        addEventListener(type, fn) {
            if (!_listeners[type]) _listeners[type] = [];
            _listeners[type].push(fn);
        },
        removeEventListener(type, fn) {
            if (_listeners[type]) _listeners[type] = _listeners[type].filter(f => f !== fn);
        },
        _fire(type) {
            (_listeners[type] ?? []).forEach(fn => fn());
        },
    }, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
});

afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
});

describe('network module', () => {
    test('should have correct module metadata', () => {
        expect(network.name).toBe('network');
        expect(network.dependencies).toEqual([]);
        expect(typeof network.factory).toBe('function');
    });

    describe('factory', () => {
        let inst;
        beforeEach(() => { inst = network.factory(); });

        test('returns expected API', () => {
            expect(typeof inst.isOnline).toBe('function');
            expect(typeof inst.onOnline).toBe('function');
            expect(typeof inst.onOffline).toBe('function');
            expect(typeof inst.onChange).toBe('function');
            expect(typeof inst.ping).toBe('function');
            expect(typeof inst.off).toBe('function');
        });

        test('isOnline reflects navigator.onLine', () => {
            Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
            expect(inst.isOnline()).toBe(true);
            Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
            expect(inst.isOnline()).toBe(false);
        });

        test('onOnline callback fires on window online event', () => {
            const calls = [];
            inst.onOnline(() => calls.push('online'));
            window._fire('online');
            expect(calls).toEqual(['online']);
        });

        test('onOffline callback fires on window offline event', () => {
            const calls = [];
            inst.onOffline(() => calls.push('offline'));
            window._fire('offline');
            expect(calls).toEqual(['offline']);
        });

        test('onOnline returns unsubscribe fn', () => {
            const calls = [];
            const unsub = inst.onOnline(() => calls.push(1));
            unsub();
            window._fire('online');
            expect(calls).toEqual([]);
        });

        test('onChange callback fires with true on online event', () => {
            const states = [];
            inst.onChange((online) => states.push(online), { immediate: false });
            window._fire('online');
            expect(states).toContain(true);
        });

        test('onChange callback fires with false on offline event', () => {
            const states = [];
            inst.onChange((online) => states.push(online), { immediate: false });
            window._fire('offline');
            expect(states).toContain(false);
        });

        test('onChange immediate=true calls callback immediately with current state', () => {
            Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
            const states = [];
            inst.onChange((online) => states.push(online), { immediate: true });
            expect(states[0]).toBe(true);
        });

        test('onChange immediate defaults to true', () => {
            const states = [];
            inst.onChange((s) => states.push(s));
            expect(states.length).toBe(1);
        });

        test('onChange returns unsubscribe fn', () => {
            const states = [];
            const unsub = inst.onChange((s) => states.push(s), { immediate: false });
            unsub();
            window._fire('online');
            expect(states).toEqual([]);
        });

        test('off() removes all listeners', () => {
            const calls = [];
            inst.onOnline(() => calls.push('online'));
            inst.onOffline(() => calls.push('offline'));
            inst.off();
            window._fire('online');
            window._fire('offline');
            expect(calls).toEqual([]);
        });

        test('multiple onChange listeners all called', () => {
            const a = [], b = [];
            inst.onChange((s) => a.push(s), { immediate: false });
            inst.onChange((s) => b.push(s), { immediate: false });
            window._fire('online');
            expect(a).toContain(true);
            expect(b).toContain(true);
        });

        test('ping returns true when fetch succeeds', async () => {
            globalThis.fetch = async () => ({ status: 200, ok: true });
            const result = await inst.ping('https://example.com');
            expect(result).toBe(true);
        });

        test('ping returns false when fetch throws (timeout/error)', async () => {
            globalThis.fetch = async () => { throw new Error('network error'); };
            const result = await inst.ping('https://example.com');
            expect(result).toBe(false);
        });

        // ── Network Information API ──────────────────────────────────────────

        describe('connection() snapshot', () => {
            test('returns null when navigator.connection is absent', () => {
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true }, configurable: true, writable: true
                });
                const inst2 = network.factory();
                expect(inst2.connection()).toBeNull();
            });

            test('returns a frozen snapshot of effectiveType/downlink/rtt/saveData/type', () => {
                const connListeners = [];
                const conn = {
                    effectiveType: '4g',
                    downlink: 10,
                    rtt: 50,
                    saveData: true,
                    type: 'wifi',
                    addEventListener(type, fn) { connListeners.push({ type, fn }); },
                    removeEventListener() {},
                };
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true, connection: conn },
                    configurable: true, writable: true
                });
                const inst2 = network.factory();
                const snap = inst2.connection();
                expect(snap.effectiveType).toBe('4g');
                expect(snap.downlink).toBe(10);
                expect(snap.rtt).toBe(50);
                expect(snap.saveData).toBe(true);
                expect(snap.type).toBe('wifi');
                expect(Object.isFrozen(snap)).toBe(true);
            });

            test('fills missing fields with null / false', () => {
                Object.defineProperty(globalThis, 'navigator', {
                    value: {
                        onLine: true,
                        connection: { addEventListener() {}, removeEventListener() {} }
                    },
                    configurable: true, writable: true
                });
                const inst2 = network.factory();
                const snap = inst2.connection();
                expect(snap.effectiveType).toBeNull();
                expect(snap.downlink).toBeNull();
                expect(snap.rtt).toBeNull();
                expect(snap.saveData).toBe(false);
                expect(snap.type).toBeNull();
            });

            test('falls back to mozConnection / webkitConnection', () => {
                Object.defineProperty(globalThis, 'navigator', {
                    value: {
                        onLine: true,
                        webkitConnection: {
                            effectiveType: '3g',
                            addEventListener() {}, removeEventListener() {},
                        },
                    },
                    configurable: true, writable: true,
                });
                const inst2 = network.factory();
                expect(inst2.connection().effectiveType).toBe('3g');
            });
        });

        describe('saveData()', () => {
            test('returns false when API unavailable', () => {
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true }, configurable: true, writable: true
                });
                const inst2 = network.factory();
                expect(inst2.saveData()).toBe(false);
            });

            test('mirrors navigator.connection.saveData', () => {
                Object.defineProperty(globalThis, 'navigator', {
                    value: {
                        onLine: true,
                        connection: { saveData: true, addEventListener() {}, removeEventListener() {} }
                    },
                    configurable: true, writable: true
                });
                const inst2 = network.factory();
                expect(inst2.saveData()).toBe(true);
            });
        });

        describe('onConnectionChange()', () => {
            test('attaches change listener on navigator.connection', () => {
                let attached = null;
                const conn = {
                    effectiveType: '4g',
                    addEventListener(type, fn) { if (type === 'change') attached = fn; },
                    removeEventListener() {},
                };
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true, connection: conn },
                    configurable: true, writable: true
                });
                const inst2 = network.factory();
                inst2.onConnectionChange(() => {}, { immediate: false });
                expect(typeof attached).toBe('function');
            });

            test('fires callback with a fresh snapshot on change', () => {
                let attached = null;
                const conn = {
                    effectiveType: '4g',
                    downlink: 5,
                    addEventListener(type, fn) { if (type === 'change') attached = fn; },
                    removeEventListener() {},
                };
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true, connection: conn },
                    configurable: true, writable: true
                });
                const inst2 = network.factory();
                const seen = [];
                inst2.onConnectionChange((s) => seen.push(s), { immediate: false });
                conn.effectiveType = '2g';
                conn.downlink = 0.5;
                attached(); // simulate connection.change
                expect(seen.length).toBe(1);
                expect(seen[0].effectiveType).toBe('2g');
                expect(seen[0].downlink).toBe(0.5);
            });

            test('immediate=true fires once synchronously with current snapshot', () => {
                const conn = {
                    effectiveType: '4g',
                    addEventListener() {}, removeEventListener() {},
                };
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true, connection: conn },
                    configurable: true, writable: true
                });
                const inst2 = network.factory();
                const seen = [];
                inst2.onConnectionChange((s) => seen.push(s));
                expect(seen.length).toBe(1);
                expect(seen[0].effectiveType).toBe('4g');
            });

            test('returned unsubscribe removes the callback', () => {
                let attached = null;
                const conn = {
                    effectiveType: '4g',
                    addEventListener(type, fn) { if (type === 'change') attached = fn; },
                    removeEventListener() {},
                };
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true, connection: conn },
                    configurable: true, writable: true
                });
                const inst2 = network.factory();
                const seen = [];
                const unsub = inst2.onConnectionChange((s) => seen.push(s), { immediate: false });
                unsub();
                attached();
                expect(seen).toEqual([]);
            });

            test('no-op (no throw) when API unavailable', () => {
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true }, configurable: true, writable: true
                });
                const inst2 = network.factory();
                expect(() => {
                    const unsub = inst2.onConnectionChange(() => {}, { immediate: false });
                    unsub();
                }).not.toThrow();
            });

            test('off() detaches the connection change listener', () => {
                let removed = false;
                const conn = {
                    effectiveType: '4g',
                    addEventListener() {},
                    removeEventListener(type) { if (type === 'change') removed = true; },
                };
                Object.defineProperty(globalThis, 'navigator', {
                    value: { onLine: true, connection: conn },
                    configurable: true, writable: true
                });
                const inst2 = network.factory();
                inst2.onConnectionChange(() => {}, { immediate: false });
                inst2.off();
                expect(removed).toBe(true);
            });
        });
    });
});
