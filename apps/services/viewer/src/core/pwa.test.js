// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The PWA adapter against a fake service-worker container:
 * a waiting release is reported once and only to a controlled page; a check
 * says current, ready or offline; an accepted update takes over and
 * reloads, never before; the worker's release is asked through a channel;
 * the launch queue opens the first file.
 *
 * @module viewer/core/pwa.test
 */
import { describe, test, expect } from 'bun:test';
import { mountPwa, SW_MESSAGES } from './pwa.js';

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
 * A page: window, container, registration.
 * @param {{controlled?: boolean, waiting?: any, update?: () => Promise<void>, online?: boolean, supported?: boolean}} o
 */
function page({ controlled = true, waiting = null, update, online = true, supported = true } = {}) {
    const reg = target({ waiting, installing: null, active: worker('activated'), update: update || (async () => {}) });
    const container = target({ controller: controlled ? worker('activated') : null });
    const reloads = [];
    const win = /** @type {any} */ (target({
        navigator: { serviceWorker: container, onLine: online },
        location: { reload: () => reloads.push(1) }
    }));
    const serviceWorker = { isSupported: () => supported, register: async () => reg };
    return { reg, container, win, reloads, serviceWorker };
}

const base = (p, extra = {}) => mountPwa({
    serviceWorker: p.serviceWorker, swUrl: 'sw.js', installButton: null, offlineNote: null,
    onFile: () => {}, win: p.win, ...extra
});

describe('updates', () => {
    test('a release already waiting at load is reported once, to a controlled page', async () => {
        const p = page({ waiting: worker('installed') });
        let ready = 0;
        const pwa = await base(p, { onUpdateReady: () => { ready++; } });
        expect(pwa.state).toBe('registered');
        expect(ready).toBe(1);
        expect(pwa.updateReady()).toBe(true);
        expect(await pwa.checkForUpdates()).toBe('ready');
        expect(ready).toBe(1);
    });

    test('the first install of a page nobody controls is not an update', async () => {
        const p = page({ controlled: false, waiting: worker('installed') });
        let ready = 0;
        await base(p, { onUpdateReady: () => { ready++; } });
        expect(ready).toBe(0);
    });

    test('a release found while the page runs is reported when it has installed', async () => {
        const p = page();
        let ready = 0;
        await base(p, { onUpdateReady: () => { ready++; } });
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

    test('check: current, ready after an install, offline when the server is out of reach', async () => {
        let next = null;
        const p = page({
            update: async () => {
                if (next) { p.reg.installing = next; queueMicrotask(() => { p.reg.installing = null; p.reg.waiting = next; next.state = 'installed'; next.emit('statechange'); }); }
            }
        });
        const pwa = await base(p);
        expect(await pwa.checkForUpdates()).toBe('current');
        next = worker('installing');
        expect(await pwa.checkForUpdates()).toBe('ready');

        const off = page({ update: async () => { throw new TypeError('failed to fetch'); } });
        expect(await (await base(off)).checkForUpdates()).toBe('offline');
        const noNet = page({ online: false });
        expect(await (await base(noNet)).checkForUpdates()).toBe('offline');
    });

    test('nothing reloads until the user accepts; then the waiting release takes over and the page reloads', async () => {
        const waiting = worker('installed');
        const p = page({ waiting });
        const pwa = await base(p);
        p.container.emit('controllerchange');   // e.g. another tab accepted
        expect(p.reloads.length).toBe(0);
        expect(pwa.applyUpdate()).toBe(true);
        expect(waiting.posted).toEqual([{ type: SW_MESSAGES.skipWaiting }]);
        expect(p.reloads.length).toBe(0);
        p.container.emit('controllerchange');
        expect(p.reloads.length).toBe(1);
    });

    test('applying with nothing waiting does nothing', async () => {
        const p = page();
        const pwa = await base(p);
        expect(pwa.applyUpdate()).toBe(false);
    });

    test('the active worker says which release it serves', async () => {
        const p = page();
        p.container.controller = worker('activated', (m, ports) => {
            if (m.type === SW_MESSAGES.version) ports[0].postMessage({ version: 'abc123' });
        });
        const pwa = await base(p);
        expect(await pwa.version()).toBe('abc123');
    });

    test('without service workers: unsupported, and every call answers', async () => {
        const p = page({ supported: false });
        const pwa = await base(p);
        expect(pwa.state).toBe('unsupported');
        expect(await pwa.checkForUpdates()).toBe('unavailable');
        expect(pwa.applyUpdate()).toBe(false);
        expect(await pwa.version()).toBe(null);
    });
});

describe('launch queue', () => {
    test('the first launched file opens', async () => {
        const p = page();
        let consumer = null;
        p.win.launchQueue = { setConsumer: (fn) => { consumer = fn; } };
        const opened = [];
        await base(p, { onFile: (file) => opened.push(file.name) });
        await consumer({ files: [{ getFile: async () => new File(['x'], 'a.pdf') }] });
        expect(opened).toEqual(['a.pdf']);
    });
});
