// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { serviceWorker } from './serviceWorker.js';

// Mock navigator.serviceWorker
class MockServiceWorkerContainer {
    constructor() {
        this._registrations = [];
        this._listeners = new Map();
        this.controller = null;
        this.ready = Promise.resolve({ scope: '/' });
    }
    async register(scriptUrl, opts = {}) {
        const reg = new MockRegistration(scriptUrl, opts.scope ?? '/');
        this._registrations.push(reg);
        return reg;
    }
    async getRegistrations() { return [...this._registrations]; }
    addEventListener(type, fn) {
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
        const arr = this._listeners.get(type);
        if (arr) arr.splice(arr.indexOf(fn), 1);
    }
    _fireMessage(data) {
        const fns = this._listeners.get('message') ?? [];
        fns.forEach(fn => fn({ data }));
    }
}

class MockServiceWorker {
    constructor() { this._messages = []; }
    postMessage(data) { this._messages.push(data); }
}

class MockRegistration {
    constructor(scriptUrl, scope) {
        this.scriptUrl = scriptUrl;
        this.scope = scope;
        this.installing = null;
        this.waiting = null;
        this._listeners = new Map();
    }
    async unregister() { return true; }
    async update() { this._updated = true; }
    addEventListener(type, fn) {
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
        const arr = this._listeners.get(type);
        if (arr) arr.splice(arr.indexOf(fn), 1);
    }
    _fireUpdateFound() {
        this.installing = new MockServiceWorker();
        (this._listeners.get('updatefound') ?? []).forEach(fn => fn());
    }
}

let originalNavigator;
beforeEach(() => {
    originalNavigator = globalThis.navigator;
    const mockSW = new MockServiceWorkerContainer();
    Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: mockSW }, configurable: true, writable: true });
});
afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
});

describe('serviceWorker module', () => {
    test('should have correct module metadata', () => {
        expect(serviceWorker.name).toBe('serviceWorker');
        expect(serviceWorker.version).toBe('1.0.0');
        expect(serviceWorker.type).toBe('fw.dom.sw');
        expect(serviceWorker.dependencies).toEqual([]);
        expect(typeof serviceWorker.factory).toBe('function');
    });

    describe('factory', () => {
        let inst;
        beforeEach(() => { inst = serviceWorker.factory(); });

        test('returns object with expected API', () => {
            expect(typeof inst.register).toBe('function');
            expect(typeof inst.unregister).toBe('function');
            expect(typeof inst.ready).toBe('function');
            expect(typeof inst.update).toBe('function');
            expect(typeof inst.onUpdate).toBe('function');
            expect(typeof inst.postMessage).toBe('function');
            expect(typeof inst.onMessage).toBe('function');
            expect(typeof inst.isSupported).toBe('function');
        });

        test('isSupported returns true when navigator.serviceWorker present', () => {
            expect(inst.isSupported()).toBe(true);
        });

        test('isSupported returns false when not present', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(inst.isSupported()).toBe(false);
        });

        test('register resolves with registration', async () => {
            const reg = await inst.register('/sw.js', { scope: '/' });
            expect(reg).toBeInstanceOf(MockRegistration);
            expect(reg.scope).toBe('/');
        });

        test('unregister returns true when registration found', async () => {
            await inst.register('/sw.js', { scope: '/' });
            const result = await inst.unregister('/');
            expect(result).toBe(true);
        });

        test('unregister returns false when no registration', async () => {
            const result = await inst.unregister('/');
            expect(result).toBe(false);
        });

        test('ready resolves with registration', async () => {
            const reg = await inst.ready();
            expect(reg).toHaveProperty('scope');
        });

        test('onMessage callback fires when SW sends message', () => {
            const messages = [];
            const unsub = inst.onMessage((data) => messages.push(data));
            navigator.serviceWorker._fireMessage('hello from SW');
            expect(messages).toEqual(['hello from SW']);
            unsub();
        });

        test('onMessage unsubscribe stops delivery', () => {
            const messages = [];
            const unsub = inst.onMessage((data) => messages.push(data));
            unsub();
            navigator.serviceWorker._fireMessage('after unsub');
            expect(messages).toEqual([]);
        });

        test('postMessage sends to controller', () => {
            const controller = new MockServiceWorker();
            navigator.serviceWorker.controller = controller;
            inst.postMessage({ cmd: 'sync' });
            expect(controller._messages).toEqual([{ cmd: 'sync' }]);
        });

        test('postMessage throws when no controller', () => {
            navigator.serviceWorker.controller = null;
            expect(() => inst.postMessage('data')).toThrow('serviceWorker: no active controller');
        });

        test('controller getter returns null when no controller', () => {
            expect(inst.controller).toBeNull();
        });

        test('controller getter returns the active controller when set', () => {
            const ctrl = new MockServiceWorker();
            navigator.serviceWorker.controller = ctrl;
            expect(inst.controller).toBe(ctrl);
        });

        test('update triggers reg.update for matching scope', async () => {
            await inst.register('/sw.js', { scope: '/' });
            await inst.update('/');
            const regs = await navigator.serviceWorker.getRegistrations();
            expect(regs[0]._updated).toBe(true);
        });

        test('update without scope triggers update on every registration', async () => {
            await inst.register('/a.js', { scope: '/a' });
            await inst.register('/b.js', { scope: '/b' });
            await inst.update();
            const regs = await navigator.serviceWorker.getRegistrations();
            expect(regs[0]._updated).toBe(true);
            expect(regs[1]._updated).toBe(true);
        });

        test('onUpdate fires callback on updatefound and cleanup detaches', async () => {
            const reg = await inst.register('/sw.js', { scope: '/' });
            const seen = [];
            const dispose = inst.onUpdate((r) => seen.push(r));
            // Wait a tick for the async attach to bind listeners
            await new Promise((r) => setTimeout(r, 0));

            reg._fireUpdateFound();
            expect(seen).toEqual([reg]);

            dispose();
            // Wait for the async disposer to actually remove
            await new Promise((r) => setTimeout(r, 0));

            reg._fireUpdateFound();
            // Still only one call - cleanup removed the listener
            expect(seen.length).toBe(1);
        });
    });
});
