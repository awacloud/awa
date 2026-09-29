// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { describe, test, expect, beforeEach } from 'bun:test';
import { push } from './push.js';
import { b64 } from '../../io/codec/b64.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Instancie b64 et un stub serviceWorker minimal */
function makeInst(swOverride = {}) {
    const b64Inst = b64.factory();

    const defaultSW = {
        async ready() {
            return swOverride.registration ?? null;
        },
    };

    return push.factory(defaultSW, b64Inst);
}

/** Construit un stub PushSubscription */
function makeSub(endpoint = 'https://push.example.com/sub/1') {
    return {
        endpoint,
        expirationTime: null,
        toJSON() {
            return {
                endpoint: this.endpoint,
                expirationTime: this.expirationTime,
                keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
            };
        },
        unsubscribe: async () => true,
    };
}

/** Construit un stub PushManager */
function makePushManager(existingSub = null, permState = 'granted') {
    return {
        async subscribe(opts) {
            // Returns a sub with the registered opts for verification
            const sub = makeSub();
            sub._opts = opts;
            return sub;
        },
        async getSubscription() {
            return existingSub;
        },
        async permissionState() {
            return permState;
        },
    };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('push module', () => {
    test('correct module metadata', () => {
        expect(push.name).toBe('push');
        expect(push.version).toBe('1.0.0');
        expect(push.type).toBe('fw.dom.sw');
        expect(push.dependencies).toEqual(['serviceWorker', 'b64']);
        expect(typeof push.factory).toBe('function');
    });

    describe('factory', () => {
        test('creates instance with expected API', () => {
            const inst = makeInst();
            expect(typeof inst.subscribe).toBe('function');
            expect(typeof inst.unsubscribe).toBe('function');
            expect(typeof inst.current).toBe('function');
            expect(typeof inst.permission).toBe('function');
            expect(typeof inst.support).toBe('function');
        });
    });

    describe('support', () => {
        test('returns {available: false} when PushManager absent', () => {
            // happy-dom does not implement PushManager
            const inst = makeInst();
            const s = inst.support();
            expect(s.available).toBe(false);
            expect(typeof s.sw).toBe('boolean');
        });

        test('returns sw: true when navigator.serviceWorker is present', () => {
            const original = globalThis.navigator;
            Object.defineProperty(globalThis, 'navigator', {
                value: { serviceWorker: {} },
                configurable: true,
                writable: true,
            });
            try {
                const inst = makeInst();
                const s = inst.support();
                expect(s.sw).toBe(true);
            } finally {
                Object.defineProperty(globalThis, 'navigator', {
                    value: original,
                    configurable: true,
                    writable: true,
                });
            }
        });

        test('returns available: true when PushManager is on globalThis', () => {
            const had = 'PushManager' in globalThis;
            const original = globalThis.PushManager;
            globalThis.PushManager = function PushManager() {};
            try {
                const inst = makeInst();
                const s = inst.support();
                expect(s.available).toBe(true);
            } finally {
                if (had) globalThis.PushManager = original;
                else delete globalThis.PushManager;
            }
        });

        test('returns sw: false when navigator.serviceWorker is absent', () => {
            const original = globalThis.navigator;
            Object.defineProperty(globalThis, 'navigator', {
                value: {},
                configurable: true,
                writable: true,
            });
            try {
                const inst = makeInst();
                const s = inst.support();
                expect(s.sw).toBe(false);
            } finally {
                Object.defineProperty(globalThis, 'navigator', {
                    value: original,
                    configurable: true,
                    writable: true,
                });
            }
        });
    });

    describe('subscribe', () => {
        test('passes userVisibleOnly: true by default', async () => {
            const pm = makePushManager();
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            // Uint8Array key
            const key = new Uint8Array(65).fill(42);
            const result = await inst.subscribe({ applicationServerKey: key });

            expect(result.endpoint).toBe('https://push.example.com/sub/1');
        });

        test('passes custom userVisibleOnly: false', async () => {
            let capturedOpts;
            const pm = {
                async subscribe(opts) {
                    capturedOpts = opts;
                    return makeSub();
                },
                async getSubscription() { return null; },
                async permissionState() { return 'granted'; },
            };
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const key = new Uint8Array(65).fill(1);
            await inst.subscribe({ applicationServerKey: key, userVisibleOnly: false });

            expect(capturedOpts.userVisibleOnly).toBe(false);
        });

        test('converts base64url string key to Uint8Array (65-byte P-256)', async () => {
            let capturedOpts;
            const pm = {
                async subscribe(opts) {
                    capturedOpts = opts;
                    return makeSub();
                },
                async getSubscription() { return null; },
                async permissionState() { return 'granted'; },
            };
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            // 65 octets pour passer la validation P-256 uncompressed
            const bytes = new Uint8Array(65);
            for (let i = 0; i < 65; i++) bytes[i] = i;
            const b64Inst = b64.factory();
            const b64std = b64Inst.fromBytes(bytes);
            const base64url = b64std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            await inst.subscribe({ applicationServerKey: base64url });

            expect(capturedOpts.applicationServerKey).toBeInstanceOf(Uint8Array);
            expect(capturedOpts.applicationServerKey.length).toBe(65);
            expect(capturedOpts.applicationServerKey[0]).toBe(0);
            expect(capturedOpts.applicationServerKey[64]).toBe(64);
        });

        test('converts base64url with url-safe chars (- and _)', async () => {
            let capturedKey;
            const pm = {
                async subscribe(opts) {
                    capturedKey = opts.applicationServerKey;
                    return makeSub();
                },
                async getSubscription() { return null; },
                async permissionState() { return 'granted'; },
            };
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            // 65 octets dont certains > 0x3e pour produire '+' et '/' dans base64
            const bytes = new Uint8Array(65);
            for (let i = 0; i < 65; i++) bytes[i] = 0xf0 + (i % 16);
            const b64Inst = b64.factory();
            const b64std = b64Inst.fromBytes(bytes);
            const b64url = b64std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            await inst.subscribe({ applicationServerKey: b64url });

            expect(capturedKey).toBeInstanceOf(Uint8Array);
            expect(capturedKey.length).toBe(65);
        });

        test('throws on invalid key type', async () => {
            const pm = makePushManager();
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            await expect(inst.subscribe({ applicationServerKey: 12345 })).rejects.toThrow('applicationServerKey');
        });

        test('throws on base64url that decodes to wrong length', async () => {
            const pm = makePushManager();
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            // "QUJD" → 3 bytes, not 65
            await expect(inst.subscribe({ applicationServerKey: 'QUJD' })).rejects.toThrow('65 bytes');
        });
    });

    describe('serialization', () => {
        test('serializes PushSubscription to JSON-friendly object', async () => {
            const sub = makeSub('https://fcm.googleapis.com/fcm/send/token123');
            const pm = {
                async subscribe() { return sub; },
                async getSubscription() { return sub; },
                async permissionState() { return 'granted'; },
            };
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const key = new Uint8Array(65);
            const result = await inst.subscribe({ applicationServerKey: key });

            expect(result.endpoint).toBe('https://fcm.googleapis.com/fcm/send/token123');
            expect(result.expirationTime).toBeNull();
            expect(result.keys.p256dh).toBe('p256dh-value');
            expect(result.keys.auth).toBe('auth-value');
            expect(result.raw).toBe(sub);
        });

        test('current() returns null when no subscription', async () => {
            const pm = makePushManager(null);
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const result = await inst.current();
            expect(result).toBeNull();
        });

        test('current() returns serialized subscription when active', async () => {
            const sub = makeSub('https://push.example.com/active');
            const pm = makePushManager(sub);
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const result = await inst.current();
            expect(result.endpoint).toBe('https://push.example.com/active');
            expect(result.keys.p256dh).toBe('p256dh-value');
        });
    });

    describe('unsubscribe', () => {
        test('returns false when no active subscription', async () => {
            const pm = makePushManager(null);
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const result = await inst.unsubscribe();
            expect(result).toBe(false);
        });

        test('returns true after unsubscribing', async () => {
            const sub = makeSub();
            const pm = makePushManager(sub);
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const result = await inst.unsubscribe();
            expect(result).toBe(true);
        });
    });

    describe('permission', () => {
        test('returns granted state', async () => {
            const pm = makePushManager(null, 'granted');
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const state = await inst.permission();
            expect(state).toBe('granted');
        });

        test('returns denied state', async () => {
            const pm = makePushManager(null, 'denied');
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const state = await inst.permission();
            expect(state).toBe('denied');
        });

        test('returns prompt state', async () => {
            const pm = makePushManager(null, 'prompt');
            const reg = { pushManager: pm };
            const inst = makeInst({ registration: reg });

            const state = await inst.permission();
            expect(state).toBe('prompt');
        });
    });
});
