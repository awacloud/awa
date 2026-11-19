// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The logger's opt-out (D9 G4): the console takeover stays the default
// (recorded; printed only in dev), and `native(true)` makes every console
// call of the realm print as the native console does, still recorded.

import { describe, test, expect, afterAll } from 'bun:test';
import { logger } from './logger.js';

const _savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const _savedSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
afterAll(() => {
    if (_savedWindow) Object.defineProperty(globalThis, 'window', _savedWindow);
    else delete globalThis.window;
    if (_savedSelf) Object.defineProperty(globalThis, 'self', _savedSelf);
});

function freshWindow() {
    const calls = [];
    const con = { log: (...a) => calls.push(['log', ...a]), warn: (...a) => calls.push(['warn', ...a]), error: () => {}, info: () => {}, debug: () => {} };
    globalThis.window = { console: con };
    return { calls };
}

describe('logger.main: native() opt-out', () => {
    test('by default (dev off) a call is recorded, not printed', () => {
        const { calls } = freshWindow();
        const l = logger.main(false);
        window.console.log('quiet');
        expect(calls).toEqual([]);
        expect(l.get().map((e) => e.data)).toEqual([['quiet']]);
    });

    test('native(true): printed as the native console does (no appended stack), still recorded; native(false) restores', () => {
        const { calls } = freshWindow();
        const l = logger.main(false);
        expect(l.native(true)).toBe(true);
        window.console.log('a', 1);
        window.console.warn('b');
        expect(calls).toEqual([['log', 'a', 1], ['warn', 'b']]);
        expect(l.get().map((e) => [e.lvl, e.data])).toEqual([['log', ['a', 1]], ['warn', ['b']]]);
        expect(l.native(false)).toBe(true);
        window.console.log('c');
        expect(calls.length).toBe(2);
        expect(l.get().length).toBe(3);
    });

    test('native() with no argument turns it on; a joined logger switches the shared proxy', () => {
        const { calls } = freshWindow();
        logger.main(false);
        const joined = logger.main(false);
        expect(joined.native()).toBe(true);
        window.console.log('x');
        expect(calls).toEqual([['log', 'x']]);
    });

    test('native() on a console another script locked returns false and changes nothing', () => {
        const foreign = { log: () => {} };
        globalThis.window = {};
        Object.defineProperty(window, 'console', { value: foreign, writable: false, configurable: false });
        const l = logger.main(false);
        expect(l.native(true)).toBe(false);
        expect(window.console).toBe(foreign);
    });
});

describe('logger.worker: native() opt-out', () => {
    test('prints through the worker console when on, records either way', () => {
        const calls = [];
        const con = { log: (...a) => calls.push(['log', ...a]), warn: () => {}, error: () => {}, info: () => {}, debug: () => {} };
        const fakeSelf = { console: con };
        Object.defineProperty(globalThis, 'self', { value: fakeSelf, configurable: true, writable: true });
        const port = { postMessage: () => {} };
        const l = logger.worker(false, port);
        self.console.log('w1');
        expect(calls).toEqual([]);
        expect(l.native(true)).toBe(true);
        self.console.log('w2');
        expect(calls).toEqual([['log', 'w2']]);
        expect(l.get().length).toBe(2);
    });
});
