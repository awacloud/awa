// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// A second fw entry in one realm: its logger joins the console proxy the
// first one installed (both record) instead of redefining the locked
// `console`, which threw "readonly property" at import. A console locked by
// another script is left alone. Same for two worker loggers on one `self`.

import { describe, test, expect, afterAll } from 'bun:test';
import { logger } from './logger.js';

// The tests install their own `window`; the realm's is put back afterwards.
const _savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterAll(() => {
    if (_savedWindow) Object.defineProperty(globalThis, 'window', _savedWindow);
    else delete globalThis.window;
});

/** A fresh window-shaped global with a console, as logger.main reads it. */
function freshWindow() {
    const calls = [];
    const con = { log: (...a) => calls.push(['log', ...a]), warn: (...a) => calls.push(['warn', ...a]), error: () => {}, info: () => {}, debug: () => {} };
    globalThis.window = { console: con };
    return { calls };
}

describe('logger.main: a second entry joins the console', () => {
    test('two loggers in one realm: no throw, both record the same calls', () => {
        freshWindow();
        const a = logger.main(false);
        let b = null;
        expect(() => { b = logger.main(false); }).not.toThrow();
        window.console.log('one', 2);
        window.console.warn('three');
        const lv = (l) => l.get().map((e) => [e.lvl, e.data]);
        expect(lv(a)).toEqual([['log', ['one', 2]], ['warn', ['three']]]);
        expect(lv(b)).toEqual(lv(a));
        const desc = Object.getOwnPropertyDescriptor(window, 'console');
        expect(desc.configurable).toBe(false);
        expect(desc.writable).toBe(false);
    });

    test('a third entry joins too; the first logger\'s dev decides the printing', () => {
        const { calls } = freshWindow();
        const a = logger.main(true);
        const b = logger.main(false);
        const c = logger.main(false);
        window.console.log('x');
        expect(a.get().length).toBe(1);
        expect(b.get().length).toBe(1);
        expect(c.get().length).toBe(1);
        expect(calls.filter((x) => x[0] === 'log').length).toBe(1);   // printed once, by the dev proxy
    });

    test('a console another script locked is left as it is, without a throw', () => {
        const foreign = { log: () => {} };
        globalThis.window = {};
        Object.defineProperty(window, 'console', { value: foreign, writable: false, configurable: false });
        let l = null;
        expect(() => { l = logger.main(false); }).not.toThrow();
        expect(window.console).toBe(foreign);
        expect(typeof l.get).toBe('function');
    });
});

describe('logger.worker: a second logger on one self joins', () => {
    test('two worker loggers: no throw, both record', () => {
        const selfStub = { console: { log() {}, warn() {}, error() {}, info() {} } };
        const port = { postMessage() {} };
        const run = new Function('self', 'port', 'dev', `return (${logger.worker.toString()})(dev, port);`);
        const a = run(selfStub, port, false);
        let b = null;
        expect(() => { b = run(selfStub, port, false); }).not.toThrow();
        selfStub.console.log('w');
        expect(a.get().map((e) => e.lvl)).toEqual(['log']);
        expect(b.get().map((e) => e.lvl)).toEqual(['log']);
    });
});
