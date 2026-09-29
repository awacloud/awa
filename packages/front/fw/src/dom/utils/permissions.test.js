// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { permissions as permissionsModule } from './permissions.js';

const permissions = permissionsModule.factory();

function makePermissionsApi(responses = {}) {
    return {
        async query({ name }) {
            if (name in responses) {
                const state = responses[name];
                const status = { state, onchange: null };
                return status;
            }
            throw new TypeError(`Permission "${name}" not supported`);
        },
    };
}

describe('permissions', () => {
    let savedNav;
    beforeEach(() => { savedNav = globalThis.navigator; });
    afterEach(() => { Object.defineProperty(globalThis, 'navigator', { value: savedNav, configurable: true, writable: true }); });

    describe('metadata', () => {
        test('worker-safe is false', () => expect(permissionsModule.worker).toBe(false));
        test('no dependencies', () => expect(permissionsModule.dependencies).toEqual([]));
    });

    describe('isSupported', () => {
        test('false when permissions absent', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(permissions.isSupported()).toBe(false);
        });
        test('true when permissions present', () => {
            Object.defineProperty(globalThis, 'navigator', { value: { permissions: makePermissionsApi() }, configurable: true, writable: true });
            expect(permissions.isSupported()).toBe(true);
        });
    });

    describe('query', () => {
        test('returns granted for known name', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: { permissions: makePermissionsApi({ geolocation: 'granted' }) }, configurable: true, writable: true });
            const state = await permissions.query('geolocation');
            expect(state).toBe('granted');
        });

        test('returns denied for denied name', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: { permissions: makePermissionsApi({ camera: 'denied' }) }, configurable: true, writable: true });
            const state = await permissions.query('camera');
            expect(state).toBe('denied');
        });

        test('returns prompt for prompt name', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: { permissions: makePermissionsApi({ notifications: 'prompt' }) }, configurable: true, writable: true });
            const state = await permissions.query('notifications');
            expect(state).toBe('prompt');
        });

        test('throws with unsupported name', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: { permissions: makePermissionsApi({ geolocation: 'granted' }) }, configurable: true, writable: true });
            await expect(permissions.query('inexistant')).rejects.toThrow('permissions: unsupported name "inexistant"');
        });

        test('throws when API unsupported', async () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            await expect(permissions.query('geolocation')).rejects.toThrow('permissions: unsupported');
        });
    });

    describe('watch', () => {
        test('callback triggered on onchange', async () => {
            let statusRef;
            const mockApi = {
                async query({ name }) {
                    statusRef = { state: 'prompt', onchange: null };
                    return statusRef;
                },
            };
            Object.defineProperty(globalThis, 'navigator', { value: { permissions: mockApi }, configurable: true, writable: true });
            const received = [];
            const stop = permissions.watch('geolocation', s => received.push(s));
            await Promise.resolve();
            await Promise.resolve();
            statusRef.state = 'granted';
            statusRef.onchange(); // simulate permission change
            expect(received).toHaveLength(1);
            expect(received[0]).toBe('granted');
            stop();
        });

        test('stop() removes onchange listener', async () => {
            let statusRef;
            const mockApi = {
                async query() {
                    statusRef = { state: 'prompt', onchange: null };
                    return statusRef;
                },
            };
            Object.defineProperty(globalThis, 'navigator', { value: { permissions: mockApi }, configurable: true, writable: true });
            const stop = permissions.watch('geolocation', () => {});
            await Promise.resolve();
            await Promise.resolve();
            stop();
            expect(statusRef.onchange).toBeNull();
        });

        test('throws when unsupported', () => {
            Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
            expect(() => permissions.watch('geolocation', () => {})).toThrow('permissions: unsupported');
        });

        test('async query error is routed to onError, not unhandled rejection', async () => {
            const mockApi = {
                async query({ name }) {
                    throw new TypeError(`Permission "${name}" not supported`);
                },
            };
            Object.defineProperty(globalThis, 'navigator', { value: { permissions: mockApi }, configurable: true, writable: true });

            const errors = [];
            const stop = permissions.watch('inexistant', () => {}, err => errors.push(err));
            // let the rejected query microtask flush
            await Promise.resolve();
            await Promise.resolve();
            expect(errors).toHaveLength(1);
            expect(errors[0]).toBeInstanceOf(Error);
            expect(errors[0].message).toBe('permissions: unsupported name "inexistant"');
            stop();
        });
    });
});
