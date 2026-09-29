// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { rateLimit } from './rateLimit.js';

describe('rateLimit module', () => {
    test('should have correct module metadata', () => {
        expect(rateLimit.name).toBe('rateLimit');
        expect(rateLimit.dependencies).toEqual([]);
        expect(typeof rateLimit.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = rateLimit.factory();
            expect(inst).toBeDefined();
            expect(typeof inst.debounce).toBe('function');
            expect(typeof inst.throttle).toBe('function');
        });
    });

    describe('debounce', () => {
        let inst;
        beforeEach(() => { inst = rateLimit.factory(); });

        test('throws on non-function fn', () => {
            expect(() => inst.debounce(42, 100)).toThrow('rateLimit: fn must be a function');
        });

        test('throws on delay <= 0', () => {
            expect(() => inst.debounce(() => {}, 0)).toThrow('rateLimit: delay must be a positive number');
            expect(() => inst.debounce(() => {}, -1)).toThrow();
        });

        test('throws on non-numeric delay', () => {
            expect(() => inst.debounce(() => {}, 'fast')).toThrow();
        });

        test('returns a function with cancel, flush, pending', () => {
            const d = inst.debounce(() => {}, 100);
            expect(typeof d).toBe('function');
            expect(typeof d.cancel).toBe('function');
            expect(typeof d.flush).toBe('function');
            expect(typeof d.pending).toBe('function');
        });

        test('pending() is false initially', () => {
            const d = inst.debounce(() => {}, 50);
            expect(d.pending()).toBe(false);
        });

        test('pending() is true after call, false after flush', () => {
            const d = inst.debounce(() => {}, 200);
            d('arg');
            expect(d.pending()).toBe(true);
            d.flush();
            expect(d.pending()).toBe(false);
        });

        test('flush() calls fn immediately and returns result', () => {
            let called = 0;
            const d = inst.debounce(() => { called++; return 42; }, 200);
            d();
            const result = d.flush();
            expect(called).toBe(1);
            expect(result).toBe(42);
        });

        test('flush() on nothing pending returns undefined', () => {
            const d = inst.debounce(() => 99, 200);
            const result = d.flush();
            expect(result).toBeUndefined();
        });

        test('cancel() prevents pending invocation', () => {
            let called = 0;
            const d = inst.debounce(() => { called++; }, 50);
            d();
            expect(d.pending()).toBe(true);
            d.cancel();
            expect(d.pending()).toBe(false);
            expect(called).toBe(0);
        });

        test('cancel() is no-op if nothing pending', () => {
            const d = inst.debounce(() => {}, 50);
            expect(() => d.cancel()).not.toThrow();
        });

        test('leading: true calls fn on first invocation synchronously (via flush)', () => {
            let calls = [];
            const d = inst.debounce((x) => { calls.push(x); return x; }, 200, { leading: true, trailing: false });
            d(1);
            expect(calls).toEqual([1]);
        });

        test('leading: false (default) does not call fn synchronously', () => {
            let calls = [];
            const d = inst.debounce((x) => { calls.push(x); }, 200);
            d(1);
            expect(calls).toEqual([]);
            d.flush();
            expect(calls).toEqual([1]);
        });

        test('trailing: true (default) calls fn on flush with last args', () => {
            let lastArg;
            const d = inst.debounce((x) => { lastArg = x; }, 200);
            d(1);
            d(2);
            d(3);
            d.flush();
            expect(lastArg).toBe(3);
        });

        test('this context is preserved', () => {
            let capturedThis;
            const fn = function() { capturedThis = this; };
            const d = inst.debounce(fn, 200);
            const obj = { method: d };
            obj.method();
            obj.method.flush();
            expect(capturedThis).toBe(obj);
        });

        test('after cancel(), new call restarts cycle', () => {
            let calls = 0;
            const d = inst.debounce(() => { calls++; }, 200);
            d();
            d.cancel();
            d();
            d.flush();
            expect(calls).toBe(1);
        });
    });

    describe('throttle', () => {
        let inst;
        beforeEach(() => { inst = rateLimit.factory(); });

        test('throws on non-function fn', () => {
            expect(() => inst.throttle(42, 100)).toThrow('rateLimit: fn must be a function');
        });

        test('throws on interval <= 0', () => {
            expect(() => inst.throttle(() => {}, 0)).toThrow();
            expect(() => inst.throttle(() => {}, -5)).toThrow();
        });

        test('throws when both leading and trailing are false', () => {
            expect(() => inst.throttle(() => {}, 100, { leading: false, trailing: false })).toThrow(
                'rateLimit: throttle options leading and trailing cannot both be false'
            );
        });

        test('returns a function with cancel, flush, pending', () => {
            const t = inst.throttle(() => {}, 100);
            expect(typeof t).toBe('function');
            expect(typeof t.cancel).toBe('function');
            expect(typeof t.flush).toBe('function');
            expect(typeof t.pending).toBe('function');
        });

        test('leading: true (default) fires on first call immediately', () => {
            let calls = 0;
            const t = inst.throttle(() => { calls++; }, 200, { leading: true, trailing: false });
            t();
            expect(calls).toBe(1);
        });

        test('cancel() and flush() work as on debounce', () => {
            let calls = 0;
            const t = inst.throttle(() => { calls++; }, 200);
            t();
            t.cancel();
            expect(calls).toBe(1); // leading fired
            t.flush(); // nothing pending
            expect(calls).toBe(1);
        });

        test('pending() reflects state', () => {
            const t = inst.throttle(() => {}, 200);
            expect(t.pending()).toBe(false);
        });
    });

    describe('async timer firing', () => {
        let inst;
        beforeEach(() => { inst = rateLimit.factory(); });

        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        test('debounce trailing edge fires via real setTimeout after delay', async () => {
            const calls = [];
            const d = inst.debounce((x) => { calls.push(x); }, 30);
            d(1);
            d(2);
            d(3);
            expect(calls).toEqual([]);
            expect(d.pending()).toBe(true);
            await wait(80);
            expect(calls).toEqual([3]);
            expect(d.pending()).toBe(false);
        });

        test('debounce restarts the timer when called again before expiration', async () => {
            const calls = [];
            const d = inst.debounce((x) => { calls.push(x); }, 40);
            d('a');
            await wait(20);
            d('b');
            await wait(20);
            // 40ms elapsed total, but timer was restarted at 20ms - fn not yet fired
            expect(calls).toEqual([]);
            await wait(50);
            expect(calls).toEqual(['b']);
        });

        test('throttle fires once at leading edge then again at maxWait under sustained calls', async () => {
            const calls = [];
            const t = inst.throttle((x) => { calls.push(x); }, 40);
            t(1); // leading edge fires immediately
            expect(calls).toEqual([1]);
            await wait(15);
            t(2);
            await wait(15);
            t(3);
            await wait(15);
            t(4);
            // sustained calls - maxWait (40ms since last invoke) should have fired
            await wait(60);
            expect(calls.length).toBeGreaterThanOrEqual(2);
            expect(calls[calls.length - 1]).toBe(4);
        });

        test('cancel() before timer expiration prevents trailing invocation', async () => {
            const calls = [];
            const d = inst.debounce((x) => { calls.push(x); }, 30);
            d(1);
            await wait(10);
            d.cancel();
            await wait(60);
            expect(calls).toEqual([]);
        });
    });

    describe('edge cases', () => {
        let inst;
        beforeEach(() => { inst = rateLimit.factory(); });

        test('debounce with NaN delay throws', () => {
            expect(() => inst.debounce(() => {}, NaN)).toThrow();
        });

        test('throttle with NaN interval throws', () => {
            expect(() => inst.throttle(() => {}, NaN)).toThrow();
        });

        test('debounce flush returns last result', () => {
            let count = 0;
            const d = inst.debounce(() => ++count, 200);
            d();
            d();
            const result = d.flush();
            expect(result).toBe(1);
        });
    });
});
