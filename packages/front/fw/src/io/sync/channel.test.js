// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { channel } from './channel.js';

describe('channel module', () => {
    test('should have correct module metadata', () => {
        expect(channel.name).toBe('channel');
        expect(channel.dependencies).toEqual([]);
        expect(typeof channel.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = channel.factory();
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create', () => {
        let inst;
        beforeEach(() => { inst = channel.factory(); });

        test('throws on negative capacity', () => {
            expect(() => inst.create({ capacity: -1 })).toThrow('channel: capacity must be a non-negative integer');
        });

        test('returns object with expected API', () => {
            const ch = inst.create({ capacity: 3 });
            expect(typeof ch.send).toBe('function');
            expect(typeof ch.recv).toBe('function');
            expect(typeof ch.trySend).toBe('function');
            expect(typeof ch.tryRecv).toBe('function');
            expect(typeof ch.close).toBe('function');
            expect(typeof ch.closed).toBe('boolean');
            expect(typeof ch.capacity).toBe('number');
            expect(typeof ch.size).toBe('number');
        });

        test('initial state: not closed, size 0', () => {
            const ch = inst.create({ capacity: 5 });
            expect(ch.closed).toBe(false);
            expect(ch.size).toBe(0);
            expect(ch.capacity).toBe(5);
        });

        // Buffered tests
        describe('buffered (capacity > 0)', () => {
            test('send 3 items into capacity 5: size=3, all resolve', async () => {
                const ch = inst.create({ capacity: 5 });
                await ch.send(1);
                await ch.send(2);
                await ch.send(3);
                expect(ch.size).toBe(3);
            });

            test('recv returns oldest item', async () => {
                const ch = inst.create({ capacity: 3 });
                await ch.send('a');
                await ch.send('b');
                const r = await ch.recv();
                expect(r).toEqual({ value: 'a', done: false });
            });

            test('4th send blocks when capacity 3', async () => {
                const ch = inst.create({ capacity: 3 });
                await ch.send(1); await ch.send(2); await ch.send(3);
                let resolved = false;
                const p = ch.send(4).then(() => { resolved = true; });
                await Promise.resolve();
                expect(resolved).toBe(false);
                await ch.recv();
                await p;
                expect(resolved).toBe(true);
            });

            test('recv on empty blocks until send', async () => {
                const ch = inst.create({ capacity: 3 });
                let got;
                const p = ch.recv().then(r => { got = r; });
                await Promise.resolve();
                expect(got).toBeUndefined();
                await ch.send('hello');
                await p;
                expect(got).toEqual({ value: 'hello', done: false });
            });

            test('size getter updates correctly', async () => {
                const ch = inst.create({ capacity: 5 });
                await ch.send('x');
                await ch.send('y');
                expect(ch.size).toBe(2);
                await ch.recv();
                expect(ch.size).toBe(1);
            });
        });

        // Unbuffered tests
        describe('unbuffered (capacity 0)', () => {
            test('send blocks until recv arrives', async () => {
                const ch = inst.create({ capacity: 0 });
                let sent = false;
                const p = ch.send('x').then(() => { sent = true; });
                await Promise.resolve();
                expect(sent).toBe(false);
                const r = await ch.recv();
                await p;
                expect(sent).toBe(true);
                expect(r).toEqual({ value: 'x', done: false });
            });

            test('recv blocks until send arrives', async () => {
                const ch = inst.create({ capacity: 0 });
                let received;
                const p = ch.recv().then(r => { received = r; });
                await Promise.resolve();
                expect(received).toBeUndefined();
                await ch.send('hello');
                await p;
                expect(received).toEqual({ value: 'hello', done: false });
            });
        });

        // Close tests
        describe('close', () => {
            test('close on empty + recv waiters → all get done:true', async () => {
                const ch = inst.create({ capacity: 3 });
                const results = [];
                const p1 = ch.recv().then(r => results.push(r));
                const p2 = ch.recv().then(r => results.push(r));
                ch.close();
                await Promise.all([p1, p2]);
                expect(results).toEqual([
                    { value: undefined, done: true },
                    { value: undefined, done: true }
                ]);
            });

            test('close with buffer: drain items then done', async () => {
                const ch = inst.create({ capacity: 3 });
                await ch.send(1); await ch.send(2);
                ch.close();
                const r1 = await ch.recv();
                const r2 = await ch.recv();
                const r3 = await ch.recv();
                expect(r1).toEqual({ value: 1, done: false });
                expect(r2).toEqual({ value: 2, done: false });
                expect(r3).toEqual({ value: undefined, done: true });
            });

            test('send on closed throws', async () => {
                const ch = inst.create({ capacity: 3 });
                ch.close();
                await expect(ch.send('x')).rejects.toThrow('channel: send on closed');
            });

            test('close with pending sends: all senders rejected', async () => {
                const ch = inst.create({ capacity: 1 });
                await ch.send('full');
                const p = ch.send('extra');
                ch.close();
                await expect(p).rejects.toThrow('channel: closed during send');
            });

            test('close is idempotent', () => {
                const ch = inst.create({ capacity: 1 });
                ch.close();
                expect(() => ch.close()).not.toThrow();
                expect(ch.closed).toBe(true);
            });
        });

        // trySend / tryRecv
        describe('trySend and tryRecv', () => {
            test('trySend returns true when space available', () => {
                const ch = inst.create({ capacity: 2 });
                expect(ch.trySend('a')).toBe(true);
                expect(ch.size).toBe(1);
            });

            test('trySend returns false when buffer full', async () => {
                const ch = inst.create({ capacity: 1 });
                await ch.send('x');
                expect(ch.trySend('y')).toBe(false);
            });

            test('trySend on closed throws', () => {
                const ch = inst.create({ capacity: 1 });
                ch.close();
                expect(() => ch.trySend('x')).toThrow('channel: send on closed');
            });

            test('tryRecv returns value when available', async () => {
                const ch = inst.create({ capacity: 2 });
                await ch.send('hello');
                expect(ch.tryRecv()).toEqual({ value: 'hello', done: false });
            });

            test('tryRecv returns { value: undefined, done: false, empty: true } when empty and open', () => {
                const ch = inst.create({ capacity: 2 });
                expect(ch.tryRecv()).toEqual({ value: undefined, done: false, empty: true });
            });

            test('tryRecv returns { done: true } when closed and empty', () => {
                const ch = inst.create({ capacity: 2 });
                ch.close();
                expect(ch.tryRecv()).toEqual({ value: undefined, done: true });
            });
        });

        // Integration
        test('producer/consumer pattern', async () => {
            const ch = inst.create({ capacity: 5 });
            const produced = [1, 2, 3, 4, 5];
            const consumed = [];

            const producer = (async () => {
                for (const v of produced) await ch.send(v);
                ch.close();
            })();

            const consumer = (async () => {
                let r;
                while (!(r = await ch.recv()).done) {
                    consumed.push(r.value);
                }
            })();

            await Promise.all([producer, consumer]);
            expect(consumed).toEqual(produced);
        });
    });
});
