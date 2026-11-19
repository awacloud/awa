// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { processRPC } from './rpc.js';

describe('processRPC module', () => {
    test('should have correct module metadata', () => {
        expect(processRPC.name).toBe('processRPC');
        expect(processRPC.dependencies).toEqual([]);
        expect(typeof processRPC.factory).toBe('function');
    });

    describe('factory', () => {
        let api;

        beforeEach(() => {
            api = processRPC.factory();
        });

        test('should expose expected helpers', () => {
            expect(typeof api.create).toBe('function');
            expect(typeof api.open).toBe('function');
        });

        test('should create port and open proxy', async () => {
            const target = {
                ping: () => 'pong',
                value: 42,
                nested: {
                    add: (a, b) => a + b,
                },
            };

            const { port } = api.create(target);
            const proxy = await api.open(port[0]);

            await expect(proxy.ping()).resolves.toBe('pong');
            await expect(proxy.value).resolves.toBe(42);
            await expect(proxy.nested.add(2, 3)).resolves.toBe(5);
        });

        test('should reject when endpoint is missing', async () => {
            const { port } = api.create({ ok: 1 });
            const proxy = await api.open(port[0]);

            expect(() => proxy.missing).toThrow('RPC endpoint not found: missing');
        });

        test('should allow JS-internal probes', async () => {
            const { port } = api.create({ ok: 1 });
            const proxy = await api.open(port[0]);

            expect(proxy.then).toBeUndefined();
            expect(proxy.toJSON).toBeUndefined();
        });

        test('should propagate errors from target', async () => {
            const target = {
                boom: () => {
                    throw new Error('fail');
                },
            };

            const { port } = api.create(target);
            const proxy = await api.open(port[0]);

            await expect(proxy.boom()).rejects.toThrow('fail');
        });

        test('should timeout when no response arrives', async () => {
            const target = {
                never: () => new Promise(() => {}),
            };

            const { port } = api.create(target);
            const proxy = await api.open(port[0], { timeout: 10 });

            await expect(proxy.never()).rejects.toThrow('RPC timeout: never');
        });

        test('timeout: Infinity is the longest timer, not an immediate failure', async () => {
            const target = { slow: () => new Promise(r => setTimeout(() => r('done'), 40)) };
            const { port } = api.create(target);
            const proxy = await api.open(port[0], { timeout: Infinity });
            await expect(proxy.slow()).resolves.toBe('done');
        });

        test('a timeout above the timer range is clamped, not wrapped', async () => {
            const target = { slow: () => new Promise(r => setTimeout(() => r('ok'), 40)) };
            const { port } = api.create(target);
            const proxy = await api.open(port[0], { timeout: 2 ** 40 });
            await expect(proxy.slow()).resolves.toBe('ok');
        });

        test('the handshake times out when no descriptor arrives', async () => {
            const channel = new MessageChannel();
            await expect(api.open(channel.port1, { timeout: 20 }))
                .rejects.toThrow('RPC open timeout: descriptor not received');
            channel.port1.close();
            channel.port2.close();
        });

        test('forbidden keys are neither exposed nor reachable', async () => {
            const target = { ok: () => 1 };
            const { port } = api.create(target);
            const proxy = await api.open(port[0]);
            expect(proxy.__proto__).toBeUndefined();
            expect(proxy.constructor).toBeUndefined();
            expect(proxy.prototype).toBeUndefined();
        });

        test('a nested namespace is called by its path', async () => {
            const target = { math: { deep: { twice: (x) => x * 2 } } };
            const { port } = api.create(target);
            const proxy = await api.open(port[0]);
            await expect(proxy.math.deep.twice(21)).resolves.toBe(42);
        });

        test('close() ends the exposure: a later call does not resolve', async () => {
            const target = { ping: () => 'pong' };
            const { port, close } = api.create(target);
            const proxy = await api.open(port[0], { timeout: 50 });
            await expect(proxy.ping()).resolves.toBe('pong');
            close();
            await expect(proxy.ping()).rejects.toThrow('RPC timeout: ping');
        });
    });
});
