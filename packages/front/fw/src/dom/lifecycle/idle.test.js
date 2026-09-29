// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { idle as idleModule } from './idle.js';

const idle = idleModule.factory();

function setupWindow() {
    const listeners = {};
    globalThis.window = {
        addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        removeEventListener(ev, fn) {
            if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== fn);
        },
        _fire(ev) { (listeners[ev] || []).forEach(fn => fn()); },
        _count(ev) { return (listeners[ev] || []).length; },
    };
}

describe('idle', () => {
    let savedWindow, savedIdleDetector;
    beforeEach(() => {
        savedWindow = globalThis.window;
        savedIdleDetector = globalThis.IdleDetector;
    });
    afterEach(() => {
        globalThis.window = savedWindow;
        globalThis.IdleDetector = savedIdleDetector;
    });

    describe('metadata', () => {
        test('worker-safe is false', () => expect(idleModule.worker).toBe(false));
        test('no dependencies', () => expect(idleModule.dependencies).toEqual([]));
    });

    describe('isSupported', () => {
        test('false when IdleDetector absent', () => {
            globalThis.IdleDetector = undefined;
            expect(idle.isSupported()).toBe(false);
        });
        test('true when IdleDetector present', () => {
            globalThis.IdleDetector = class {};
            expect(idle.isSupported()).toBe(true);
        });
    });

    describe('create (IdleDetector)', () => {
        test('throws when not supported', async () => {
            globalThis.IdleDetector = undefined;
            await expect(idle.create()).rejects.toThrow('not supported');
        });

        test('returns detector with userState and screenState', async () => {
            const mockListeners = {};
            globalThis.IdleDetector = class {
                constructor() { this.userState = 'active'; this.screenState = 'unlocked'; }
                addEventListener(ev, fn) { (mockListeners[ev] = mockListeners[ev] || []).push(fn); }
                async start() {}
                stop() {}
            };
            const detector = await idle.create({ threshold: 60000 });
            expect(detector.userState).toBe('active');
            expect(detector.screenState).toBe('unlocked');
        });

        test('onChange callback triggered on IdleDetector change', async () => {
            let detectorRef;
            const mockListeners = {};
            globalThis.IdleDetector = class {
                constructor() {
                    this.userState = 'active';
                    this.screenState = 'unlocked';
                    detectorRef = this;
                }
                addEventListener(ev, fn) { (mockListeners[ev] = mockListeners[ev] || []).push(fn); }
                async start() {}
                stop() {}
            };
            const detector = await idle.create();
            const received = [];
            detector.onChange(s => received.push(s));
            detectorRef.userState = 'idle';
            (mockListeners['change'] || []).forEach(fn => fn());
            expect(received).toHaveLength(1);
            expect(received[0].userState).toBe('idle');
        });
    });

    describe('fallback', () => {
        test('initial userState is active', () => {
            setupWindow();
            const f = idle.fallback({ threshold: 100 });
            f.start();
            expect(f.userState).toBe('active');
            f.stop();
        });

        test('transitions to idle after threshold', async () => {
            setupWindow();
            const f = idle.fallback({ threshold: 60, events: ['mousemove'] });
            f.start();
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(f.userState).toBe('idle');
            f.stop();
        });

        test('event resets timer back to active', async () => {
            setupWindow();
            const states = [];
            const f = idle.fallback({ threshold: 60, events: ['mousemove'] });
            f.onChange(({ userState }) => states.push(userState));
            f.start();
            await new Promise(resolve => setTimeout(resolve, 40));
            window._fire('mousemove'); // reset
            await new Promise(resolve => setTimeout(resolve, 40));
            // should still be active since timer reset
            expect(f.userState).toBe('active');
            f.stop();
        });

        test('stop() prevents idle transition', async () => {
            setupWindow();
            const f = idle.fallback({ threshold: 50, events: ['mousemove'] });
            f.start();
            f.stop();
            await new Promise(resolve => setTimeout(resolve, 80));
            // userState stays active since timer was cleared
            expect(f.userState).toBe('active');
        });

        test('stop() removes event listeners', () => {
            setupWindow();
            const f = idle.fallback({ threshold: 100, events: ['mousemove', 'keydown'] });
            f.start();
            f.stop();
            expect(window._count('mousemove')).toBe(0);
            expect(window._count('keydown')).toBe(0);
        });
    });

    describe('requestPermission', () => {
        test('denied when not supported', async () => {
            globalThis.IdleDetector = undefined;
            const result = await idle.requestPermission();
            expect(result).toBe('denied');
        });
        test('returns IdleDetector.requestPermission result', async () => {
            globalThis.IdleDetector = { requestPermission: async () => 'granted' };
            const result = await idle.requestPermission();
            expect(result).toBe('granted');
        });
    });
});
