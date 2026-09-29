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
    });
});
