// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { workerPool } from './workerPool.js';

const pool = workerPool.factory();

// ─── Minimal Worker stub ───────────────────────────────────────────────────────
// Simulates a Worker that replies on the next tick with the received data (echo).
function makeWorkerStub(opts = {}) {
    const { delay = 0, failOnce = false } = opts;
    let _failNext = failOnce;
    let _terminated = false;
    const stub = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        _terminated: false,
        postMessage(data) {
            if (_terminated) return;
            if (_failNext) {
                _failNext = false;
                setTimeout(() => {
                    if (!_terminated && typeof stub.onerror === 'function') {
                        stub.onerror(new Error('worker crash'));
                    }
                }, delay);
                return;
            }
            setTimeout(() => {
                if (!_terminated && typeof stub.onmessage === 'function') {
                    stub.onmessage({ data });
                }
            }, delay);
        },
        terminate() {
            _terminated = true;
            stub._terminated = true;
        }
    };
    return stub;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('workerPool module', () => {

    test('should have correct module metadata', () => {
        expect(workerPool.name).toBe('workerPool');
        expect(workerPool.version).toBe('1.0.0');
        expect(workerPool.type).toBe('fw.process');
        expect(workerPool.dependencies).toEqual([]);
        expect(typeof workerPool.factory).toBe('function');
    });

    describe('factory', () => {
        test('should return create function', () => {
            expect(typeof pool.create).toBe('function');
        });

        test('create returns expected API', () => {
            const p = pool.create({ factory: () => makeWorkerStub() });
            expect(typeof p.run).toBe('function');
            expect(typeof p.size).toBe('function');
            expect(typeof p.idle).toBe('function');
            expect(typeof p.pending).toBe('function');
            expect(typeof p.resize).toBe('function');
            expect(typeof p.terminate).toBe('function');
            p.terminate();
        });

        test('throws if factory not provided', () => {
            expect(() => pool.create({})).toThrow('workerPool: opts.factory must be a function');
            expect(() => pool.create()).toThrow('workerPool: opts.factory must be a function');
        });
    });

    describe('run - pool 2 workers, 3 jobs', () => {
        test('2 jobs start immediately, 3rd is queued and all resolve', async () => {
            let created = 0;
            const p = pool.create({
                factory: () => { created++; return makeWorkerStub({ delay: 20 }); },
                size: 2
            });

            expect(p.size()).toBe(2);
            expect(p.idle()).toBe(2);

            const r1 = p.run('job1');
            const r2 = p.run('job2');

            // After dispatching the first 2 jobs, no worker is idle
            expect(p.idle()).toBe(0);

            const r3 = p.run('job3');
            expect(p.pending()).toBe(1);

            const [v1, v2, v3] = await Promise.all([r1, r2, r3]);
            expect(v1).toBe('job1');
            expect(v2).toBe('job2');
            expect(v3).toBe('job3');
            expect(p.pending()).toBe(0);
            p.terminate();
        });
    });

    describe('respawn on crash', () => {
        test('worker crash rejects job and respawns (idle restored)', async () => {
            let spawned = 0;
            const p = pool.create({
                factory: () => {
                    spawned++;
                    // First worker crashes; subsequent ones echo normally
                    return makeWorkerStub({ delay: 10, failOnce: spawned === 1 });
                },
                size: 1,
                respawnOnCrash: true
            });

            // The first job will crash
            await expect(p.run('willCrash')).rejects.toThrow();

            // Wait a tick for the respawn
            await new Promise(r => setTimeout(r, 30));

            expect(spawned).toBeGreaterThanOrEqual(2); // respawn created
            expect(p.size()).toBe(1);
            expect(p.idle()).toBe(1);

            // A subsequent job must work
            const v = await p.run('afterCrash');
            expect(v).toBe('afterCrash');
            p.terminate();
        });
    });

    describe('signal.abort() before run', () => {
        test('rejects immediately with AbortError', async () => {
            const p = pool.create({ factory: () => makeWorkerStub(), size: 1 });
            const ctrl = new AbortController();
            ctrl.abort();

            const err = await p.run('job', { signal: ctrl.signal }).catch(e => e);
            expect(err.name).toBe('AbortError');
            p.terminate();
        });
    });

    describe('signal.abort() during run', () => {
        test('worker terminated + respawn + job rejected', async () => {
            let spawned = 0;
            const p = pool.create({
                factory: () => { spawned++; return makeWorkerStub({ delay: 200 }); },
                size: 1,
                respawnOnCrash: true
            });

            const ctrl = new AbortController();
            const jobPromise = p.run('slowJob', { signal: ctrl.signal });

            // Abort during execution
            setTimeout(() => ctrl.abort(), 20);

            const err = await jobPromise.catch(e => e);
            expect(err.name).toBe('AbortError');

            // Wait for respawn
            await new Promise(r => setTimeout(r, 50));
            expect(p.idle()).toBe(1);
            p.terminate();
        });
    });

    describe('resize', () => {
        test('resize(1) shrinks to 1 worker', async () => {
            const p = pool.create({ factory: () => makeWorkerStub(), size: 4 });
            expect(p.size()).toBe(4);
            p.resize(1);
            expect(p.size()).toBe(1);
            p.terminate();
        });

        test('resize(6) grows the pool', () => {
            const p = pool.create({ factory: () => makeWorkerStub(), size: 2 });
            p.resize(6);
            expect(p.size()).toBe(6);
            p.terminate();
        });

        test('throws on invalid size', () => {
            const p = pool.create({ factory: () => makeWorkerStub(), size: 2 });
            expect(() => p.resize(0)).toThrow();
            expect(() => p.resize(-1)).toThrow();
            expect(() => p.resize(1.5)).toThrow();
            p.terminate();
        });
    });

    describe('terminate', () => {
        test('rejects queued jobs', async () => {
            const p = pool.create({ factory: () => makeWorkerStub({ delay: 500 }), size: 1 });

            // Fill the single worker
            const r1 = p.run('busy');
            // Queue more jobs
            const r2 = p.run('queued1');
            const r3 = p.run('queued2');

            expect(p.pending()).toBe(2);

            p.terminate();

            const [e2, e3] = await Promise.all([
                r2.catch(e => e),
                r3.catch(e => e),
            ]);

            expect(e2.message).toContain('terminated');
            expect(e3.message).toContain('terminated');

            // r1 may resolve or reject depending on timing - ignore it
            await r1.catch(() => {});
        });

        test('run after terminate rejects', async () => {
            const p = pool.create({ factory: () => makeWorkerStub(), size: 1 });
            p.terminate();
            const err = await p.run('job').catch(e => e);
            expect(err.message).toContain('terminated');
        });
    });

    describe('maxQueue', () => {
        test('throws when queue is full', async () => {
            const p = pool.create({
                factory: () => makeWorkerStub({ delay: 500 }),
                size: 1,
                maxQueue: 1
            });
            // Fill the worker
            const r1 = p.run('busy').catch(() => {});
            // Fill the queue
            const r2 = p.run('q1').catch(() => {});
            // Exceed maxQueue
            const err = await p.run('overflow').catch(e => e);
            expect(err.message).toContain('maxQueue');
            p.terminate();
            await Promise.all([r1, r2]);
        });
    });

});
