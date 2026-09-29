// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/readyState.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { readyState } from './readyState.js';

// ─── Mock document ───────────────────────────────────────────────────────────
//
// readyState.js depends on `document.readyState` and `document.addEventListener`.
// We install a minimal mock on globalThis for each test, saving any original.

let savedDocument;

function installMockDocument(initialReadyState = 'loading') {
    const listeners = new Map(); // type → Set<listener>

    const doc = {
        readyState: initialReadyState,
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
        },
        // Test helpers
        _setReadyState(value) {
            this.readyState = value;
        },
        _fireReadyStateChange() {
            const ls = listeners.get('readystatechange');
            if (!ls) return;
            for (const l of ls) l();
        },
        _listenerCount(type) {
            return listeners.get(type)?.size ?? 0;
        },
    };

    savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
        value: doc,
        writable: true,
        configurable: true,
    });
    return doc;
}

function restoreDocument() {
    if (savedDocument) {
        Object.defineProperty(globalThis, 'document', savedDocument);
    } else {
        delete globalThis.document;
    }
    savedDocument = undefined;
}

describe('readyState', () => {
    afterEach(restoreDocument);

    describe('API surface', () => {
        test('returns { loaded, complete } functions', () => {
            installMockDocument();
            const r = readyState();
            expect(typeof r.loaded).toBe('function');
            expect(typeof r.complete).toBe('function');
        });

        test('non-function callback is a no-op (no throw, no enqueue)', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            r.loaded('not-a-function');
            r.loaded(null);
            r.loaded(undefined);
            r.loaded(42);
            r.complete({});
            // No listener installed → no lazy init occurred.
            expect(doc._listenerCount('readystatechange')).toBe(0);
        });
    });

    describe('loaded() - DOM interactive', () => {
        test('executes immediately if document already interactive', () => {
            installMockDocument('interactive');
            const r = readyState();
            const calls = [];
            r.loaded(() => calls.push('A'));
            r.loaded(() => calls.push('B'));
            expect(calls).toEqual(['A', 'B']);
        });

        test('executes immediately if document already complete', () => {
            installMockDocument('complete');
            const r = readyState();
            const calls = [];
            r.loaded(() => calls.push('A'));
            expect(calls).toEqual(['A']);
        });

        test('queues if loading, flushes on readystatechange interactive', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            const calls = [];
            r.loaded(() => calls.push('A'));
            r.loaded(() => calls.push('B'));
            expect(calls).toEqual([]); // not yet flushed

            doc._setReadyState('interactive');
            doc._fireReadyStateChange();
            expect(calls).toEqual(['A', 'B']);
        });

        test('passes argArray to apply', () => {
            installMockDocument('interactive');
            const r = readyState();
            let received;
            r.loaded(function (a, b, c) { received = [a, b, c, this]; }, [1, 2, 3]);
            expect(received[0]).toBe(1);
            expect(received[1]).toBe(2);
            expect(received[2]).toBe(3);
            expect(received[3]).toEqual({}); // this = {}
        });

        test('argArray default = []', () => {
            installMockDocument('interactive');
            const r = readyState();
            let argLen;
            r.loaded(function () { argLen = arguments.length; });
            expect(argLen).toBe(0);
        });
    });

    describe('complete() - DOM complete', () => {
        test('executes immediately if already complete', () => {
            installMockDocument('complete');
            const r = readyState();
            const calls = [];
            r.complete(() => calls.push('A'));
            expect(calls).toEqual(['A']);
        });

        test('queues if interactive, flushes on transition to complete', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            const calls = [];
            r.complete(() => calls.push('C'));
            // Transitions to interactive - complete callbacks are NOT yet flushed.
            doc._setReadyState('interactive');
            doc._fireReadyStateChange();
            expect(calls).toEqual([]);
            // Transitions to complete - flush.
            doc._setReadyState('complete');
            doc._fireReadyStateChange();
            expect(calls).toEqual(['C']);
        });

        test('loaded callbacks flushed AT THE SAME TIME as complete callbacks', () => {
            // When complete is reached, interactive is also reached (cf.
            // updateFlagsFromStatus). Queued loaded callbacks must be flushed.
            const doc = installMockDocument('loading');
            const r = readyState();
            const calls = [];
            r.loaded(() => calls.push('L'));
            r.complete(() => calls.push('C'));
            doc._setReadyState('complete');
            doc._fireReadyStateChange();
            expect(calls).toEqual(['L', 'C']);
        });
    });

    describe('listener installation (lazy & idempotent)', () => {
        test('no listener until callback registered', () => {
            const doc = installMockDocument('loading');
            readyState();
            expect(doc._listenerCount('readystatechange')).toBe(0);
        });

        test('installs listener on first callback registered (loading)', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            r.loaded(() => {});
            expect(doc._listenerCount('readystatechange')).toBe(1);
        });

        test('only 1 listener even with multiple registrations', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            r.loaded(() => {});
            r.loaded(() => {});
            r.complete(() => {});
            r.complete(() => {});
            expect(doc._listenerCount('readystatechange')).toBe(1);
        });

        test('no listener installed if already complete at startup', () => {
            const doc = installMockDocument('complete');
            const r = readyState();
            r.loaded(() => {});
            r.complete(() => {});
            expect(doc._listenerCount('readystatechange')).toBe(0);
        });
    });

    describe('robustness', () => {
        test('exception in callback does not prevent following ones', () => {
            installMockDocument('interactive');
            const r = readyState();
            const calls = [];
            r.loaded(() => { throw new Error('boom'); });
            r.loaded(() => calls.push('B'));
            expect(calls).toEqual(['B']);
        });

        test('readyState transitions directly from loading to complete (skip interactive)', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            const calls = [];
            r.loaded(() => calls.push('L'));
            r.complete(() => calls.push('C'));
            doc._setReadyState('complete');
            doc._fireReadyStateChange();
            // Direct jump → loaded AND complete are satisfied.
            expect(calls).toEqual(['L', 'C']);
        });

        test('callbacks added AFTER flush are executed immediately', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            const calls = [];
            r.loaded(() => calls.push('first'));
            doc._setReadyState('complete');
            doc._fireReadyStateChange();
            expect(calls).toEqual(['first']);
            // Added after the flush
            r.loaded(() => calls.push('late'));
            r.complete(() => calls.push('late-complete'));
            expect(calls).toEqual(['first', 'late', 'late-complete']);
        });

        test('multiple readyState() instances are independent', () => {
            installMockDocument('interactive');
            const a = readyState();
            const b = readyState();
            const ca = [];
            const cb = [];
            a.loaded(() => ca.push('a'));
            b.loaded(() => cb.push('b'));
            expect(ca).toEqual(['a']);
            expect(cb).toEqual(['b']);
        });
    });

    describe('execution order', () => {
        test('loaded callbacks flushed in registration order', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            const calls = [];
            for (let i = 0; i < 5; i++) r.loaded(() => calls.push(i));
            doc._setReadyState('interactive');
            doc._fireReadyStateChange();
            expect(calls).toEqual([0, 1, 2, 3, 4]);
        });

        test('interactive queue drained before complete queue', () => {
            const doc = installMockDocument('loading');
            const r = readyState();
            const calls = [];
            r.complete(() => calls.push('C1'));
            r.loaded(() => calls.push('L1'));
            r.complete(() => calls.push('C2'));
            r.loaded(() => calls.push('L2'));
            doc._setReadyState('complete');
            doc._fireReadyStateChange();
            expect(calls).toEqual(['L1', 'L2', 'C1', 'C2']);
        });
    });
});
