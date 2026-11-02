// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { swUpdate } from './swUpdate.js';

// ---------------------------------------------------------------------------
// Stubs — a page (window, container, registration) and a fake serviceWorker
// ---------------------------------------------------------------------------

/** A minimal EventTarget-like object. */
function target(extra = {}) {
    const listeners = {};
    return Object.assign({
        listeners,
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
        emit(type) { for (const fn of [...(listeners[type] || [])]) fn({}); }
    }, extra);
}

/** A worker in a state, recording what the page posts to it. */
function worker(state, onMessage = () => {}) {
    const posted = [];
    return target({ state, posted, postMessage(m, ports) { posted.push(m); onMessage(m, ports); } });
}

/**
 * A page: window, container, registration, and a fake `serviceWorker` module.
 * @param {{controlled?: boolean, waiting?: any, update?: () => Promise<void>, online?: boolean, supported?: boolean, registerFails?: boolean}} o
 */
function page({ controlled = true, waiting = null, update, online = true, supported = true, registerFails = false } = {}) {
    const reg = target({ waiting, installing: null, active: worker('activated'), update: update || (async () => {}) });
    const container = target({ controller: controlled ? worker('activated') : null });
    const reloads = [];
    const registered = [];
    const win = /** @type {any} */ (target({
        navigator: { serviceWorker: container, onLine: online },
        location: { reload: () => reloads.push(1) }
    }));
    const serviceWorker = {
        isSupported: () => supported,
        register: async (url, options) => {
            registered.push([url, options]);
            if (registerFails) throw new Error('SecurityError');
            return reg;
        }
    };
    return { reg, container, win, reloads, registered, serviceWorker };
}

const make = (p, extra = {}) => swUpdate.factory(p.serviceWorker).create({ swUrl: 'sw.js', win: p.win, ...extra });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('swUpdate module', () => {
    test('should have correct module metadata', () => {
        expect(swUpdate.name).toBe('swUpdate');
        expect(swUpdate.dependencies).toEqual(['serviceWorker']);
        expect(swUpdate.deps.map((d) => d.name)).toEqual(['serviceWorker']);
        expect(swUpdate.type).toBe('fw.dom.sw');
        expect(swUpdate.version).toBe('1.0.0');
        expect(typeof swUpdate.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = swUpdate.factory(page().serviceWorker);
            expect(Object.keys(inst)).toEqual(['create', 'DEFAULT_MESSAGES']);
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('DEFAULT_MESSAGES', () => {
        test('is the frozen wire protocol', () => {
            const { DEFAULT_MESSAGES } = swUpdate.factory(page().serviceWorker);
            expect(DEFAULT_MESSAGES).toEqual({ skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' });
            expect(Object.isFrozen(DEFAULT_MESSAGES)).toBe(true);
        });
    });

    describe('create', () => {
        test('throws synchronously on a bad swUrl', () => {
            const su = swUpdate.factory(page().serviceWorker);
            const err = new TypeError('swUpdate.create: swUrl must be a non-empty string');
            expect(() => su.create({ swUrl: '' })).toThrow(err);
            expect(() => su.create({ swUrl: /** @type {any} */ (42) })).toThrow(err);
            expect(() => su.create(/** @type {any} */ (undefined))).toThrow(err);
        });

        test('registerOptions default and are forwarded', async () => {
            const p = page();
            await make(p);
            expect(p.registered).toEqual([['sw.js', { type: 'module', updateViaCache: 'none' }]]);
            const q = page();
            await make(q, { registerOptions: { scope: './app/' } });
            expect(q.registered).toEqual([['sw.js', { scope: './app/' }]]);
        });

        test('failed when register rejects; every call answers', async () => {
            const p = page({ registerFails: true });
            const ctl = await make(p);
            expect(ctl.state).toBe('failed');
            expect(ctl.updateReady()).toBe(false);
            expect(await ctl.checkForUpdates()).toBe('unavailable');
            expect(ctl.applyUpdate()).toBe(false);
            expect(await ctl.version()).toBe(null);
            expect(ctl.controlled()).toBe(false);
            ctl.dispose();
        });

        test('without service workers: unsupported, and every call answers', async () => {
            const p = page({ supported: false });
            const ctl = await make(p);
            expect(ctl.state).toBe('unsupported');
            expect(p.registered).toEqual([]);
            expect(ctl.updateReady()).toBe(false);
            expect(await ctl.checkForUpdates()).toBe('unavailable');
            expect(ctl.applyUpdate()).toBe(false);
            expect(await ctl.version()).toBe(null);
            expect(ctl.controlled()).toBe(false);
            ctl.dispose();
        });

        test('defaults win to globalThis (unsupported path)', async () => {
            const ctl = await swUpdate.factory(page({ supported: false }).serviceWorker).create({ swUrl: 'sw.js' });
            expect(ctl.state).toBe('unsupported');
        });
    });

    describe('onUpdateReady', () => {
        test('a release already waiting at load is reported once, to a controlled page', async () => {
            const p = page({ waiting: worker('installed') });
            let ready = 0;
            const ctl = await make(p, { onUpdateReady: () => { ready++; } });
            expect(ctl.state).toBe('registered');
            expect(ready).toBe(1);
            expect(ctl.updateReady()).toBe(true);
            expect(await ctl.checkForUpdates()).toBe('ready');
            expect(ready).toBe(1);
        });

        test('the first install of a page nobody controls is not an update', async () => {
            const p = page({ controlled: false, waiting: worker('installed') });
            let ready = 0;
            const ctl = await make(p, { onUpdateReady: () => { ready++; } });
            expect(ready).toBe(0);
            expect(ctl.updateReady()).toBe(false);
        });

        test('a release found while the page runs is reported when it has installed', async () => {
            const p = page();
            let ready = 0;
            await make(p, { onUpdateReady: () => { ready++; } });
            const next = worker('installing');
            p.reg.installing = next;
            p.reg.emit('updatefound');
            expect(ready).toBe(0);
            p.reg.installing = null;
            p.reg.waiting = next;
            next.state = 'installed';
            next.emit('statechange');
            expect(ready).toBe(1);
        });

        test('a worker already installing at creation is watched', async () => {
            const p = page();
            const next = worker('installing');
            p.reg.installing = next;
            let ready = 0;
            await make(p, { onUpdateReady: () => { ready++; } });
            next.state = 'activating';
            next.emit('statechange');
            expect(ready).toBe(0);
            p.reg.waiting = next;
            next.state = 'installed';
            next.emit('statechange');
            expect(ready).toBe(1);
        });

        test('an updatefound with nothing installing is ignored', async () => {
            const p = page();
            const ctl = await make(p);
            p.reg.emit('updatefound');
            expect(ctl.updateReady()).toBe(false);
        });
    });

    describe('onControlled', () => {
        test('fires at creation when controlled, and on every controllerchange', async () => {
            const p = page();
            let controlled = 0;
            await make(p, { onControlled: () => { controlled++; } });
            expect(controlled).toBe(1);
            p.container.emit('controllerchange');
            p.container.emit('controllerchange');
            expect(controlled).toBe(3);
        });

        test('does not fire at creation on an uncontrolled page', async () => {
            const p = page({ controlled: false });
            let controlled = 0;
            await make(p, { onControlled: () => { controlled++; } });
            expect(controlled).toBe(0);
            p.container.controller = worker('activated');
            p.container.emit('controllerchange');
            expect(controlled).toBe(1);
        });
    });

    describe('controlled', () => {
        test('follows the container controller', async () => {
            const p = page({ controlled: false });
            const ctl = await make(p);
            expect(ctl.controlled()).toBe(false);
            p.container.controller = worker('activated');
            expect(ctl.controlled()).toBe(true);
        });
    });

    describe('checkForUpdates', () => {
        test('current, ready after an install, offline when the server is out of reach', async () => {
            let next = null;
            const p = page({
                update: async () => {
                    if (next) {
                        p.reg.installing = next;
                        queueMicrotask(() => { p.reg.installing = null; p.reg.waiting = next; next.state = 'installed'; next.emit('statechange'); });
                    }
                }
            });
            let ready = 0;
            const ctl = await make(p, { onUpdateReady: () => { ready++; } });
            expect(await ctl.checkForUpdates()).toBe('current');
            next = worker('installing');
            expect(await ctl.checkForUpdates()).toBe('ready');
            expect(ready).toBe(1);

            const off = page({ update: async () => { throw new TypeError('failed to fetch'); } });
            expect(await (await make(off)).checkForUpdates()).toBe('offline');
            const noNet = page({ online: false });
            expect(await (await make(noNet)).checkForUpdates()).toBe('offline');
        });

        test('a found release that stays installing gives up after installWait', async () => {
            const p = page({ update: async () => { p.reg.installing = worker('installing'); } });
            const ctl = await make(p, { installWait: 5 });
            expect(await ctl.checkForUpdates()).toBe('current');
        });

        test('a found release that is no longer installing is not waited for', async () => {
            const p = page({ update: async () => { p.reg.installing = worker('redundant'); } });
            const ctl = await make(p, { installWait: 100000 });
            expect(await ctl.checkForUpdates()).toBe('current');
        });
    });

    describe('applyUpdate', () => {
        test('nothing reloads until the user accepts; then the waiting release takes over and the page reloads', async () => {
            const waiting = worker('installed');
            const p = page({ waiting });
            const ctl = await make(p);
            p.container.emit('controllerchange');   // e.g. another tab accepted
            expect(p.reloads.length).toBe(0);
            expect(ctl.applyUpdate()).toBe(true);
            expect(waiting.posted).toEqual([{ type: 'awa-sw-skip-waiting' }]);
            expect(p.reloads.length).toBe(0);
            p.container.emit('controllerchange');
            expect(p.reloads.length).toBe(1);
        });

        test('applying with nothing waiting does nothing', async () => {
            const p = page();
            const ctl = await make(p);
            expect(ctl.applyUpdate()).toBe(false);
        });

        test('custom messages are posted', async () => {
            const waiting = worker('installed');
            const p = page({ waiting });
            const ctl = await make(p, { messages: { skipWaiting: 'go', version: 'which' } });
            expect(ctl.applyUpdate()).toBe(true);
            expect(waiting.posted).toEqual([{ type: 'go' }]);
        });
    });

    describe('version', () => {
        test('the active worker says which release it serves', async () => {
            const p = page();
            p.container.controller = worker('activated', (m, ports) => {
                if (m.type === 'awa-sw-version') ports[0].postMessage({ version: 'abc123' });
            });
            const ctl = await make(p);
            expect(await ctl.version()).toBe('abc123');
        });

        test('falls back to the active registration on an uncontrolled page; custom messages', async () => {
            const p = page({ controlled: false });
            p.reg.active = worker('activated', (m, ports) => {
                if (m.type === 'which') ports[0].postMessage({ version: 'r2' });
            });
            const ctl = await make(p, { messages: { skipWaiting: 'go', version: 'which' } });
            expect(await ctl.version()).toBe('r2');
            expect(p.reg.active.posted).toEqual([{ type: 'which' }]);
        });

        test('a non-string answer is null', async () => {
            const p = page();
            p.container.controller = worker('activated', (m, ports) => { ports[0].postMessage({ version: 7 }); });
            const ctl = await make(p);
            expect(await ctl.version()).toBe(null);
        });

        test('null after versionWait when the worker does not answer', async () => {
            const p = page();
            const ctl = await make(p, { versionWait: 5 });
            expect(await ctl.version()).toBe(null);
        });

        test('null without any worker', async () => {
            const p = page({ controlled: false });
            p.reg.active = null;
            const ctl = await make(p);
            expect(await ctl.version()).toBe(null);
        });

        test('null without MessageChannel', async () => {
            const p = page();
            const saved = globalThis.MessageChannel;
            try {
                // @ts-ignore - simulate an environment without MessageChannel
                delete globalThis.MessageChannel;
                const ctl = await make(p);
                expect(await ctl.version()).toBe(null);
            } finally {
                globalThis.MessageChannel = saved;
            }
        });
    });

    describe('dispose', () => {
        test('detaches every listener it added', async () => {
            const p = page();
            const installing = worker('installing');
            p.reg.installing = installing;
            let ready = 0;
            let controlled = 0;
            const ctl = await make(p, { onUpdateReady: () => { ready++; }, onControlled: () => { controlled++; } });
            expect(controlled).toBe(1);
            ctl.dispose();
            expect(p.reg.listeners.updatefound).toEqual([]);
            expect(p.container.listeners.controllerchange).toEqual([]);
            expect(installing.listeners.statechange).toEqual([]);

            // an updatefound after dispose reports nothing
            const next = worker('installing');
            p.reg.installing = next;
            p.reg.emit('updatefound');
            p.reg.waiting = next;
            next.state = 'installed';
            next.emit('statechange');
            expect(ready).toBe(0);
            p.container.emit('controllerchange');
            expect(controlled).toBe(1);
        });
    });
});
