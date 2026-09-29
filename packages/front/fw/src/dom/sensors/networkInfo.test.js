// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { networkInfo as networkInfoModule } from './networkInfo.js';

const networkInfo = networkInfoModule.factory();

function makeConn(overrides = {}) {
    const listeners = {};
    return {
        downlink: 10,
        downlinkMax: undefined,
        effectiveType: '4g',
        rtt: 50,
        saveData: false,
        type: 'wifi',
        ...overrides,
        addEventListener(ev, fn) {
            (listeners[ev] = listeners[ev] || []).push(fn);
        },
        removeEventListener(ev, fn) {
            if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== fn);
        },
        _fire() { (listeners['change'] || []).forEach(fn => fn()); },
        _listenerCount() { return (listeners['change'] || []).length; },
    };
}

describe('networkInfo', () => {
    let savedNav;
    beforeEach(() => { savedNav = globalThis.navigator; });
    afterEach(() => { Object.defineProperty(globalThis, 'navigator', { value: savedNav, configurable: true, writable: true }); });

    describe('metadata', () => {
        test('worker-safe is false', () => expect(networkInfoModule.worker).toBe(false));
        test('no dependencies', () => expect(networkInfoModule.dependencies).toEqual([]));
    });

    describe('isSupported', () => {
        test('false when connection absent', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(networkInfo.isSupported()).toBe(false);
        });
        test('true when connection present', () => {
            Object.defineProperty(globalThis, 'navigator', { value: { connection: makeConn() }, configurable: true, writable: true });
            expect(networkInfo.isSupported()).toBe(true);
        });
    });

    describe('current', () => {
        test('returns normalized payload', () => {
            Object.defineProperty(globalThis, 'navigator', { value: { connection: makeConn() }, configurable: true, writable: true });
            const info = networkInfo.current();
            expect(info.downlink).toBe(10);
            expect(info.effectiveType).toBe('4g');
            expect(info.rtt).toBe(50);
            expect(info.saveData).toBe(false);
            expect(info.type).toBe('wifi');
        });

        test('throws when unsupported', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(() => networkInfo.current()).toThrow('unsupported');
        });
    });

    describe('watch', () => {
        test('callback on change event', () => {
            const conn = makeConn();
            Object.defineProperty(globalThis, 'navigator', { value: { connection: conn }, configurable: true, writable: true });
            const received = [];
            const stop = networkInfo.watch(info => received.push(info));
            conn.effectiveType = '3g';
            conn._fire();
            expect(received).toHaveLength(1);
            expect(received[0].effectiveType).toBe('3g');
            stop();
        });

        test('stop() removes listener', () => {
            const conn = makeConn();
            Object.defineProperty(globalThis, 'navigator', { value: { connection: conn }, configurable: true, writable: true });
            const stop = networkInfo.watch(() => {});
            stop();
            expect(conn._listenerCount()).toBe(0);
        });

        test('throws when unsupported', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(() => networkInfo.watch(() => {})).toThrow('unsupported');
        });
    });
});
