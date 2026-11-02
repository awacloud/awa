// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { installPrompt } from './installPrompt.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

/** A minimal EventTarget-like object; `emit` dispatches a given event object. */
function target(extra = {}) {
    const listeners = {};
    return Object.assign({
        listeners,
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
        emit(type, event = {}) { for (const fn of [...(listeners[type] || [])]) fn(event); return event; }
    }, extra);
}

/** A `beforeinstallprompt` event: `preventDefault` spy, a resolving `prompt`, an optional `userChoice`. */
function offerEvent({ outcome = 'accepted', withChoice = true, promptRejects = false, choiceRejects = false } = {}) {
    const e = {
        defaultPrevented: false,
        prompted: 0,
        preventDefault() { e.defaultPrevented = true; },
        async prompt() {
            e.prompted++;
            if (promptRejects) throw new Error('not allowed');
        }
    };
    if (withChoice) {
        e.userChoice = choiceRejects ? Promise.reject(new Error('gone')) : Promise.resolve({ outcome });
        if (choiceRejects) e.userChoice.catch(() => {});
    }
    return e;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('installPrompt module', () => {
    test('should have correct module metadata', () => {
        expect(installPrompt.name).toBe('installPrompt');
        expect(installPrompt.dependencies).toEqual([]);
        expect(installPrompt.type).toBe('fw.dom.sw');
        expect(installPrompt.version).toBe('1.0.0');
        expect(typeof installPrompt.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = installPrompt.factory();
            expect(Object.keys(inst)).toEqual(['install', 'launchQueue']);
            expect(typeof inst.install).toBe('function');
            expect(typeof inst.launchQueue).toBe('function');
        });
    });

    describe('install', () => {
        let ip;
        beforeEach(() => { ip = installPrompt.factory(); });

        test('throws when win is not an EventTarget', () => {
            expect(() => ip.install({ win: /** @type {any} */ ({}) })).toThrow(
                new TypeError('installPrompt.install: win must be an EventTarget'));
            expect(() => ip.install({ win: null })).toThrow(TypeError);
        });

        test('defaults win to globalThis when it is an EventTarget', () => {
            const offer = ip.install();
            expect(offer.available()).toBe(false);
            offer.dispose();
        });

        test('an offer is deferred, reported once and becomes available', () => {
            const win = target();
            let available = 0;
            const offer = ip.install({ win, onAvailable: () => { available++; } });
            expect(offer.available()).toBe(false);
            const e = win.emit('beforeinstallprompt', offerEvent());
            expect(e.defaultPrevented).toBe(true);
            expect(available).toBe(1);
            expect(offer.available()).toBe(true);
        });

        test('prompt() → accepted, then unavailable (the offer is used once)', async () => {
            const win = target();
            const offer = ip.install({ win });
            const e = win.emit('beforeinstallprompt', offerEvent({ outcome: 'accepted' }));
            expect(await offer.prompt()).toBe('accepted');
            expect(e.prompted).toBe(1);
            expect(offer.available()).toBe(false);
            expect(await offer.prompt()).toBe('unavailable');
        });

        test('prompt() with nothing deferred is unavailable', async () => {
            const offer = ip.install({ win: target() });
            expect(await offer.prompt()).toBe('unavailable');
        });

        test('a dismissed outcome', async () => {
            const win = target();
            const offer = ip.install({ win });
            win.emit('beforeinstallprompt', offerEvent({ outcome: 'dismissed' }));
            expect(await offer.prompt()).toBe('dismissed');
        });

        test('a missing userChoice resolves dismissed', async () => {
            const win = target();
            const offer = ip.install({ win });
            const e = win.emit('beforeinstallprompt', offerEvent({ withChoice: false }));
            expect(await offer.prompt()).toBe('dismissed');
            expect(e.prompted).toBe(1);
        });

        test('a rejecting prompt() resolves dismissed, never rejects', async () => {
            const win = target();
            const offer = ip.install({ win });
            win.emit('beforeinstallprompt', offerEvent({ promptRejects: true }));
            expect(await offer.prompt()).toBe('dismissed');
        });

        test('a rejecting userChoice resolves dismissed', async () => {
            const win = target();
            const offer = ip.install({ win });
            win.emit('beforeinstallprompt', offerEvent({ choiceRejects: true }));
            expect(await offer.prompt()).toBe('dismissed');
        });

        test('appinstalled drops the offer and reports it', () => {
            const win = target();
            let installed = 0;
            const offer = ip.install({ win, onInstalled: () => { installed++; } });
            win.emit('beforeinstallprompt', offerEvent());
            expect(offer.available()).toBe(true);
            win.emit('appinstalled');
            expect(installed).toBe(1);
            expect(offer.available()).toBe(false);
        });

        test('callbacks are optional', () => {
            const win = target();
            const offer = ip.install({ win });
            win.emit('beforeinstallprompt', offerEvent());
            win.emit('appinstalled');
            expect(offer.available()).toBe(false);
        });

        test('dispose() removes both listeners and drops the offer', async () => {
            const win = target();
            let available = 0;
            let installed = 0;
            const offer = ip.install({ win, onAvailable: () => { available++; }, onInstalled: () => { installed++; } });
            win.emit('beforeinstallprompt', offerEvent());
            offer.dispose();
            expect(offer.available()).toBe(false);
            expect(win.listeners.beforeinstallprompt).toEqual([]);
            expect(win.listeners.appinstalled).toEqual([]);
            const later = win.emit('beforeinstallprompt', offerEvent());
            win.emit('appinstalled');
            expect(later.defaultPrevented).toBe(false);
            expect(available).toBe(1);
            expect(installed).toBe(0);
            expect(await offer.prompt()).toBe('unavailable');
        });
    });

    describe('launchQueue', () => {
        let ip;
        beforeEach(() => { ip = installPrompt.factory(); });

        /** A window whose launch queue records every consumer it is given. */
        function launchWin() {
            const consumers = [];
            return { consumers, win: { launchQueue: { setConsumer(fn) { consumers.push(fn); } } } };
        }

        test('throws without onFiles', () => {
            expect(() => ip.launchQueue({ win: {} })).toThrow(
                new TypeError('installPrompt.launchQueue: onFiles must be a function'));
            expect(() => ip.launchQueue()).toThrow(TypeError);
        });

        test('unsupported on a bare window: nothing is touched', () => {
            const win = {};
            const lq = ip.launchQueue({ win, onFiles: () => {} });
            expect(lq.supported).toBe(false);
            expect(Object.keys(win)).toEqual([]);
            lq.dispose();
            expect(Object.keys(win)).toEqual([]);
        });

        test('unsupported when launchQueue has no setConsumer', () => {
            const lq = ip.launchQueue({ win: { launchQueue: {} }, onFiles: () => {} });
            expect(lq.supported).toBe(false);
        });

        test('defaults win to globalThis', () => {
            const lq = ip.launchQueue({ onFiles: () => {} });
            expect(lq.supported).toBe(!!globalThis.launchQueue);
        });

        test('launched handles are handed over as handles', () => {
            const { consumers, win } = launchWin();
            const calls = [];
            const lq = ip.launchQueue({ win, onFiles: (handles) => calls.push(handles) });
            expect(lq.supported).toBe(true);
            expect(consumers.length).toBe(1);
            const h1 = { name: 'a.txt', getFile: async () => 'a' };
            const h2 = { name: 'b.txt', getFile: async () => 'b' };
            consumers[0]({ files: [h1, h2] });
            expect(calls.length).toBe(1);
            expect(calls[0].length).toBe(2);
            expect(calls[0][0] === h1 && calls[0][1] === h2).toBe(true);
        });

        test('an empty or missing file list calls nothing', () => {
            const { consumers, win } = launchWin();
            let called = 0;
            ip.launchQueue({ win, onFiles: () => { called++; } });
            consumers[0]({ files: [] });
            consumers[0]({});
            consumers[0](undefined);
            expect(called).toBe(0);
        });

        test('dispose() replaces the consumer with a no-op', () => {
            const { consumers, win } = launchWin();
            let called = 0;
            const lq = ip.launchQueue({ win, onFiles: () => { called++; } });
            lq.dispose();
            expect(consumers.length).toBe(2);
            consumers[1]({ files: [{ name: 'x' }] });
            expect(called).toBe(0);
            consumers[0]({ files: [{ name: 'x' }] });
            expect(called).toBe(1);
        });
    });
});
