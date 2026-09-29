// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { abort } from './abort.js';

describe('abort module', () => {
    test('should have correct module metadata', () => {
        expect(abort.name).toBe('abort');
        expect(abort.dependencies).toEqual([]);
        expect(typeof abort.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = abort.factory();
            expect(typeof inst.timeout).toBe('function');
            expect(typeof inst.any).toBe('function');
            expect(typeof inst.wait).toBe('function');
            expect(typeof inst.race).toBe('function');
            expect(typeof inst.throwIfAborted).toBe('function');
            expect(typeof inst.error).toBe('function');
        });
    });

    describe('error', () => {
        let inst;
        beforeEach(() => { inst = abort.factory(); });

        test('creates an error with name AbortError', () => {
            const e = inst.error();
            expect(e.name).toBe('AbortError');
        });

        test('uses default message when no reason given', () => {
            const e = inst.error();
            expect(e.message).toBe('The operation was aborted');
        });

        test('uses custom message', () => {
            const e = inst.error('custom reason');
            expect(e.message).toBe('custom reason');
        });
    });

    describe('timeout', () => {
        let inst;
        beforeEach(() => { inst = abort.factory(); });

        test('returns signal, controller, abort', () => {
            const result = inst.timeout(1000);
            expect(result.signal).toBeInstanceOf(AbortSignal);
            expect(result.controller).toBeInstanceOf(AbortController);
            expect(typeof result.abort).toBe('function');
            result.abort(); // cleanup
        });

        test('throws on invalid ms', () => {
            expect(() => inst.timeout(0)).toThrow('abort: ms must be a positive number');
            expect(() => inst.timeout(-1)).toThrow();
            expect(() => inst.timeout('fast')).toThrow();
        });

        test('manual abort() before timeout marks signal as aborted', () => {
            const { signal, abort: cancel } = inst.timeout(5000);
            expect(signal.aborted).toBe(false);
            cancel();
            expect(signal.aborted).toBe(true);
        });

        test('auto-aborts after ms', async () => {
            const { signal } = inst.timeout(10);
            await new Promise(r => setTimeout(r, 30));
            expect(signal.aborted).toBe(true);
        });
    });

    describe('any', () => {
        let inst;
        beforeEach(() => { inst = abort.factory(); });

        test('throws with no arguments', () => {
            expect(() => inst.any()).toThrow('abort: any() requires at least one signal');
        });

        test('throws if argument is not AbortSignal', () => {
            expect(() => inst.any({})).toThrow('abort: any() arguments must be AbortSignal instances');
        });

        test('returns an AbortSignal', () => {
            const c = new AbortController();
            const result = inst.any(c.signal);
            expect(result).toBeInstanceOf(AbortSignal);
        });

        test('combined signal aborts when one source aborts', async () => {
            const c1 = new AbortController();
            const c2 = new AbortController();
            const combined = inst.any(c1.signal, c2.signal);
            expect(combined.aborted).toBe(false);
            c1.abort();
            expect(combined.aborted).toBe(true);
        });

        test('if a signal is already aborted, combined is immediately aborted', () => {
            const c = new AbortController();
            c.abort();
            const combined = inst.any(c.signal);
            expect(combined.aborted).toBe(true);
        });
    });

    describe('wait', () => {
        let inst;
        beforeEach(() => { inst = abort.factory(); });

        test('throws on non-AbortSignal', () => {
            expect(() => inst.wait({})).toThrow('abort: wait() requires an AbortSignal');
        });

        test('rejects immediately if signal already aborted', async () => {
            const c = new AbortController();
            c.abort(new Error('aborted'));
            await expect(inst.wait(c.signal)).rejects.toBeInstanceOf(Error);
        });

        test('rejects when signal aborts', async () => {
            const c = new AbortController();
            const p = inst.wait(c.signal);
            setTimeout(() => c.abort(), 10);
            await expect(p).rejects.toBeInstanceOf(Error);
        });
    });

    describe('race', () => {
        let inst;
        beforeEach(() => { inst = abort.factory(); });

        test('returns promise directly if signal is null', async () => {
            const p = Promise.resolve(42);
            const result = await inst.race(p, null);
            expect(result).toBe(42);
        });

        test('returns promise directly if signal is undefined', async () => {
            const result = await inst.race(Promise.resolve('ok'), undefined);
            expect(result).toBe('ok');
        });

        test('resolves with promise value if promise wins', async () => {
            const c = new AbortController();
            const result = await inst.race(Promise.resolve(99), c.signal);
            expect(result).toBe(99);
            c.abort(); // cleanup
        });

        test('rejects with abort error if signal wins', async () => {
            const c = new AbortController();
            const neverResolves = new Promise(() => {});
            const racePromise = inst.race(neverResolves, c.signal);
            c.abort();
            await expect(racePromise).rejects.toHaveProperty('name', 'AbortError');
        });

        test('rejects immediately if signal already aborted', async () => {
            const c = new AbortController();
            c.abort();
            await expect(inst.race(new Promise(() => {}), c.signal)).rejects.toHaveProperty('name', 'AbortError');
        });
    });

    describe('throwIfAborted', () => {
        let inst;
        beforeEach(() => { inst = abort.factory(); });

        test('is no-op for undefined', () => {
            expect(() => inst.throwIfAborted(undefined)).not.toThrow();
        });

        test('is no-op for null', () => {
            expect(() => inst.throwIfAborted(null)).not.toThrow();
        });

        test('is no-op for non-aborted signal', () => {
            const c = new AbortController();
            expect(() => inst.throwIfAborted(c.signal)).not.toThrow();
        });

        test('throws for aborted signal', () => {
            const c = new AbortController();
            c.abort();
            expect(() => inst.throwIfAborted(c.signal)).toThrow();
        });

        test('throws with signal reason', () => {
            const c = new AbortController();
            const reason = new Error('cancelled by user');
            c.abort(reason);
            expect(() => inst.throwIfAborted(c.signal)).toThrow('cancelled by user');
        });
    });
});
