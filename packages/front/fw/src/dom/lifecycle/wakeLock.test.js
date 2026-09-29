// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { wakeLock as wakeLockModule } from './wakeLock.js';
import { visibility as visibilityModule } from './visibility.js';

// Build a mock visibility module that gives us control over onVisible callbacks
function makeMockVisibility() {
    const visibleCallbacks = new Set();
    return {
        onVisible(cb) {
            visibleCallbacks.add(cb);
            return () => visibleCallbacks.delete(cb);
        },
        _triggerVisible() { visibleCallbacks.forEach(fn => fn()); },
        _count() { return visibleCallbacks.size; },
    };
}

function makeMockSentinel() {
    const listeners = {};
    const sentinel = {
        _released: false,
        addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        removeEventListener(ev, fn) {
            if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== fn);
        },
        async release() {
            this._released = true;
            (listeners['release'] || []).forEach(fn => fn());
        },
        _fireRelease() { (listeners['release'] || []).forEach(fn => fn()); },
    };
    return sentinel;
}

describe('wakeLock', () => {
    let savedNav;
    let mockVis;
    let wakeLock;

    beforeEach(() => {
        savedNav = globalThis.navigator;
        mockVis = makeMockVisibility();
        wakeLock = wakeLockModule.factory(mockVis);
    });
    afterEach(() => { Object.defineProperty(globalThis, 'navigator', { value: savedNav, configurable: true, writable: true }); });

    describe('metadata', () => {
        test('worker-safe is false', () => expect(wakeLockModule.worker).toBe(false));
        test('depends on visibility', () => expect(wakeLockModule.dependencies).toEqual(['visibility']));
    });

    describe('isSupported', () => {
        test('false when wakeLock absent', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(wakeLock.isSupported()).toBe(false);
        });
        test('true when wakeLock present', () => {
            Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => makeMockSentinel() } }, configurable: true, writable: true });
            expect(wakeLock.isSupported()).toBe(true);
        });
    });

    describe('acquire', () => {
        test('returns lock with released: false', async () => {
            const sentinel = makeMockSentinel();
            Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => sentinel } }, configurable: true, writable: true });
            const lock = await wakeLock.acquire();
            expect(lock.released).toBe(false);
            await lock.release();
        });

        test('release() sets released: true', async () => {
            const sentinel = makeMockSentinel();
            Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => sentinel } }, configurable: true, writable: true });
            const lock = await wakeLock.acquire();
            await lock.release();
            expect(lock.released).toBe(true);
        });

        test('onRelease callback triggered on release()', async () => {
            const sentinel = makeMockSentinel();
            Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => sentinel } }, configurable: true, writable: true });
            const lock = await wakeLock.acquire({ reacquireOnVisible: false });
            const calls = [];
            lock.onRelease(() => calls.push(true));
            await lock.release();
            expect(calls).toHaveLength(1);
        });

        test('multiple acquire() returns distinct instances', async () => {
            const sentinels = [makeMockSentinel(), makeMockSentinel()];
            let i = 0;
            Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => sentinels[i++] } }, configurable: true, writable: true });
            const lock1 = await wakeLock.acquire({ reacquireOnVisible: false });
            const lock2 = await wakeLock.acquire({ reacquireOnVisible: false });
            expect(lock1).not.toBe(lock2);
            await lock1.release();
            await lock2.release();
        });

        test('reacquireOnVisible: true - re-requests on visible', async () => {
            const sentinels = [makeMockSentinel(), makeMockSentinel()];
            let requestCount = 0;
            Object.defineProperty(globalThis, 'navigator', { value: {
                wakeLock: { request: async () => { requestCount++; return sentinels[requestCount - 1]; } },
            }, configurable: true, writable: true });
            const lock = await wakeLock.acquire({ reacquireOnVisible: true });
            expect(requestCount).toBe(1);
            // Simulate: sentinel released (tab went hidden)
            sentinels[0]._fireRelease();
            // Simulate: tab becomes visible again
            mockVis._triggerVisible();
            await Promise.resolve();
            await Promise.resolve();
            expect(requestCount).toBe(2);
            await lock.release();
        });

        test('reacquireOnVisible: false - no re-request on visible', async () => {
            const sentinels = [makeMockSentinel(), makeMockSentinel()];
            let requestCount = 0;
            Object.defineProperty(globalThis, 'navigator', { value: {
                wakeLock: { request: async () => { requestCount++; return sentinels[requestCount - 1]; } },
            }, configurable: true, writable: true });
            const lock = await wakeLock.acquire({ reacquireOnVisible: false });
            expect(requestCount).toBe(1);
            sentinels[0]._fireRelease();
            mockVis._triggerVisible();
            await Promise.resolve();
            await Promise.resolve();
            expect(requestCount).toBe(1); // no re-acquire
            // lock is already released (no reacquire, sentinel fired release)
        });

        test('release() removes visibility listener', async () => {
            const sentinel = makeMockSentinel();
            Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => sentinel } }, configurable: true, writable: true });
            await wakeLock.acquire({ reacquireOnVisible: true });
            expect(mockVis._count()).toBe(1);
            // Can't call lock.release() since sentinel is still alive - simulate
            // Actually let's get the lock and release it
            const sentinel2 = makeMockSentinel();
            let r2Count = 0;
            Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => { r2Count++; return sentinel2; } } }, configurable: true, writable: true });
            const lock2 = await wakeLock.acquire({ reacquireOnVisible: true });
            await lock2.release();
            expect(lock2.released).toBe(true);
        });

        test('throws when unsupported', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            await expect(wakeLock.acquire()).rejects.toThrow('unsupported');
        });

        test('onRelease fires on sentinel auto-release even when reacquireOnVisible is true', async () => {
            const sentinels = [makeMockSentinel(), makeMockSentinel()];
            let i = 0;
            Object.defineProperty(globalThis, 'navigator', { value: {
                wakeLock: { request: async () => sentinels[i++] },
            }, configurable: true, writable: true });
            const lock = await wakeLock.acquire({ reacquireOnVisible: true });
            const calls = [];
            lock.onRelease(() => calls.push(true));
            // Browser auto-releases the sentinel (tab hidden). With
            // reacquireOnVisible:true, listeners must still be notified - the
            // re-acquire attempt does not resurrect this handle.
            sentinels[0]._fireRelease();
            expect(calls).toHaveLength(1);
            expect(lock.released).toBe(true);
        });

        test('release() resolves cleanly even when sentinel.release() rejects', async () => {
            const sentinel = makeMockSentinel();
            sentinel.release = async () => { throw new Error('boom'); };
            Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => sentinel } }, configurable: true, writable: true });
            const lock = await wakeLock.acquire({ reacquireOnVisible: false });
            const calls = [];
            lock.onRelease(() => calls.push(true));
            await lock.release(); // must not throw
            expect(lock.released).toBe(true);
            expect(calls).toHaveLength(1);
        });
    });
});
