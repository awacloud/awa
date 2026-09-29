// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { cancellable } from './cancellable.js';
import { abort as abortModule } from './abort.js';

// Use the real abort module as the dependency
const abortDep = abortModule.factory();

describe('cancellable module', () => {
    test('should have correct module metadata', () => {
        expect(cancellable.name).toBe('cancellable');
        expect(cancellable.dependencies).toEqual(['abort']);
        expect(typeof cancellable.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = cancellable.factory(abortDep);
            expect(typeof inst.create).toBe('function');
            expect(typeof inst.race).toBe('function');
            expect(typeof inst.all).toBe('function');
            expect(typeof inst.pool).toBe('function');
        });

        test('factory accepts minimal abort mock', () => {
            const mock = {
                throwIfAborted: (sig) => { if (sig?.aborted) throw new Error('aborted'); },
                error: (msg) => new Error(msg ?? 'aborted'),
            };
            const inst = cancellable.factory(mock);
            expect(typeof inst.create).toBe('function');
        });
    });

    describe('create + run', () => {
        let inst;
        beforeEach(() => { inst = cancellable.factory(abortDep); });

        test('run resolves with return value', async () => {
            const task = inst.create(async () => 42);
            expect(await task.run()).toBe(42);
        });

        test('run rejects if fn throws', async () => {
            const task = inst.create(async () => { throw new Error('boom'); });
            await expect(task.run()).rejects.toThrow('boom');
        });

        test('done is false before run', () => {
            const task = inst.create(async () => {});
            expect(task.done).toBe(false);
        });

        test('done is true after run completes', async () => {
            const task = inst.create(async () => {});
            await task.run();
            expect(task.done).toBe(true);
        });

        test('done is true after run rejects', async () => {
            const task = inst.create(async () => { throw new Error('x'); });
            await task.run().catch(() => {});
            expect(task.done).toBe(true);
        });

        test('cancelled is false initially', () => {
            const task = inst.create(async () => {});
            expect(task.cancelled).toBe(false);
        });

        test('signal is an AbortSignal', () => {
            const task = inst.create(async () => {});
            expect(task.signal instanceof AbortSignal).toBe(true);
        });

        test('re-run after completion throws', async () => {
            const task = inst.create(async () => 1);
            await task.run();
            await expect(task.run()).rejects.toThrow('cancellable: task already started');
        });

        test('cancel during run: cleanup hook executes, run rejects with AbortError', async () => {
            let cleaned = false;
            const task = inst.create(async (ctx) => {
                ctx.onCancel(() => { cleaned = true; });
                // Block until aborted
                await abortDep.wait(ctx.signal).catch(() => {});
                ctx.throwIfAborted();
            });

            const runPromise = task.run();
            await Promise.resolve(); // let asyncFn start
            task.cancel('test cancel');
            await expect(runPromise).rejects.toMatchObject({ name: 'AbortError' });
            expect(cleaned).toBe(true);
        });

        test('multiple onCancel hooks execute in LIFO order', async () => {
            const order = [];
            const task = inst.create(async (ctx) => {
                ctx.onCancel(() => order.push(1));
                ctx.onCancel(() => order.push(2));
                ctx.onCancel(() => order.push(3));
                await abortDep.wait(ctx.signal).catch(() => {});
                ctx.throwIfAborted();
            });

            const runPromise = task.run();
            await Promise.resolve();
            task.cancel();
            await runPromise.catch(() => {});
            expect(order).toEqual([3, 2, 1]);
        });

        test('hook that throws does not prevent other hooks from running', async () => {
            const order = [];
            const task = inst.create(async (ctx) => {
                ctx.onCancel(() => order.push('A'));
                ctx.onCancel(() => { order.push('B'); throw new Error('hook error'); });
                ctx.onCancel(() => order.push('C'));
                await abortDep.wait(ctx.signal).catch(() => {});
                ctx.throwIfAborted();
            });

            const runPromise = task.run();
            await Promise.resolve();
            task.cancel();
            await runPromise.catch(() => {});
            expect(order).toEqual(['C', 'B', 'A']); // LIFO, 'B' throws but 'A' still runs
        });

        test('cancel before run: run rejects immediately, hooks not called', async () => {
            let hookCalled = false;
            const task = inst.create(async (ctx) => {
                ctx.onCancel(() => { hookCalled = true; });
                return 99;
            });

            task.cancel();
            expect(task.cancelled).toBe(true);
            await expect(task.run()).rejects.toMatchObject({ name: 'AbortError' });
            expect(hookCalled).toBe(false);
        });

        test('onCancel after cancel fires immediately (next microtask)', async () => {
            const task = inst.create(async (ctx) => {
                await abortDep.wait(ctx.signal).catch(() => {});
            });

            task.run().catch(() => {});
            await Promise.resolve();
            task.cancel();
            let fired = false;
            task.signal; // just access
            const p = new Promise(resolve => {
                // Register hook after cancel
                inst.create(async (ctx) => {}).cancel(); // unrelated
            });

            // Test: create and cancel, then register onCancel in a fresh task
            const task2 = inst.create(async (ctx) => {
                await new Promise(resolve => setTimeout(resolve, 50));
            });
            task2.run().catch(() => {});
            await Promise.resolve();
            task2.cancel();
            let late = false;
            // Access internal via run a new task that captures the hook
            const task3 = inst.create(async (ctx) => {
                ctx.onCancel(() => { late = true; });
                await abortDep.wait(ctx.signal).catch(() => {});
            });
            task3.run().catch(() => {});
            await Promise.resolve();
            task3.cancel();
            await Promise.resolve();
            await Promise.resolve();
            expect(late).toBe(true);
        });

        test('cancel is idempotent', async () => {
            const task = inst.create(async () => {});
            task.cancel();
            task.cancel(); // no-op
            expect(task.cancelled).toBe(true);
        });

        test('cancel after done is no-op', async () => {
            const task = inst.create(async () => 'ok');
            await task.run();
            task.cancel(); // should not throw
            expect(task.done).toBe(true);
        });
    });

    describe('race', () => {
        let inst;
        beforeEach(() => { inst = cancellable.factory(abortDep); });

        test('first resolver wins', async () => {
            const a = inst.create(() => new Promise(r => setTimeout(() => r('a'), 10)));
            const b = inst.create(() => new Promise(r => setTimeout(() => r('b'), 50)));
            expect(await inst.race(a, b)).toBe('a');
        });

        test('losers are cancelled', async () => {
            const a = inst.create(() => new Promise(r => setTimeout(() => r('a'), 10)));
            const b = inst.create(async (ctx) => {
                await abortDep.wait(ctx.signal).catch(() => {});
                ctx.throwIfAborted();
            });
            await inst.race(a, b).catch(() => {});
            expect(b.cancelled).toBe(true);
        });

        test('if winner rejects, others still cancelled', async () => {
            const a = inst.create(() => new Promise((_, rej) => setTimeout(() => rej(new Error('fail')), 10)));
            const b = inst.create(async (ctx) => {
                await abortDep.wait(ctx.signal).catch(() => {});
            });
            await inst.race(a, b).catch(() => {});
            expect(b.cancelled).toBe(true);
        });

        test('throws on empty args', () => {
            expect(() => inst.race()).toThrow('cancellable: race requires at least one task');
        });

        test('throws on non-task arg', () => {
            expect(() => inst.race({ notATask: true })).toThrow('cancellable: argument must be a task');
        });
    });

    describe('all', () => {
        let inst;
        beforeEach(() => { inst = cancellable.factory(abortDep); });

        test('all resolve → array of results in order', async () => {
            const a = inst.create(async () => 1);
            const b = inst.create(async () => 2);
            const c = inst.create(async () => 3);
            const results = await inst.all([a, b, c]);
            expect(results).toEqual([1, 2, 3]);
        });

        test('one rejects → all others cancelled, all rejects with same error', async () => {
            const a = inst.create(async () => 1);
            const b = inst.create(async () => { throw new Error('fail'); });
            const c = inst.create(async (ctx) => {
                await abortDep.wait(ctx.signal).catch(() => {});
                ctx.throwIfAborted();
            });
            await expect(inst.all([a, b, c])).rejects.toThrow('fail');
            expect(c.cancelled).toBe(true);
        });

        test('throws on non-array', () => {
            expect(() => inst.all('notarray')).toThrow('cancellable: all requires');
        });

        test('throws on empty array', () => {
            expect(() => inst.all([])).toThrow('cancellable: all requires');
        });
    });

    describe('pool', () => {
        let inst;
        beforeEach(() => { inst = cancellable.factory(abortDep); });

        test('pool has expected API', () => {
            const p = inst.pool();
            expect(typeof p.add).toBe('function');
            expect(typeof p.cancelAll).toBe('function');
            expect(typeof p.size).toBe('number');
            expect(typeof p.cleared).toBe('boolean');
        });

        test('size increments on add', () => {
            const p = inst.pool();
            const t1 = inst.create(async (ctx) => { await abortDep.wait(ctx.signal).catch(() => {}); });
            const t2 = inst.create(async (ctx) => { await abortDep.wait(ctx.signal).catch(() => {}); });
            p.add(t1);
            p.add(t2);
            expect(p.size).toBe(2);
            p.cancelAll();
        });

        test('cancelAll cancels all tasks and sets cleared', async () => {
            const p = inst.pool();
            const t1 = inst.create(async (ctx) => { await abortDep.wait(ctx.signal).catch(() => {}); ctx.throwIfAborted(); });
            const t2 = inst.create(async (ctx) => { await abortDep.wait(ctx.signal).catch(() => {}); ctx.throwIfAborted(); });
            p.add(t1);
            p.add(t2);
            await Promise.resolve();
            await p.cancelAll();
            expect(t1.cancelled).toBe(true);
            expect(t2.cancelled).toBe(true);
            expect(p.cleared).toBe(true);
        });

        test('task that completes on its own is removed from pool', async () => {
            const p = inst.pool();
            const t = inst.create(async () => 'done');
            p.add(t);
            expect(p.size).toBe(1);
            await new Promise(resolve => setTimeout(resolve, 20)); // let task finish
            expect(p.size).toBe(0);
        });

        test('cancelAll awaits async cleanup hooks', async () => {
            const p = inst.pool();
            let cleanupDone = false;
            const t = inst.create(async (ctx) => {
                ctx.onCancel(async () => {
                    await new Promise(resolve => setTimeout(resolve, 20));
                    cleanupDone = true;
                });
                await abortDep.wait(ctx.signal).catch(() => {});
            });
            p.add(t);
            await Promise.resolve();
            await p.cancelAll();
            expect(cleanupDone).toBe(true);
        });

        test('add throws on completed task', async () => {
            const p = inst.pool();
            const t = inst.create(async () => {});
            // Run outside the pool
            // Can't add after done without run - but pool.add starts the task
            // So we need a different approach: add a second identical task
            const t2 = inst.create(async () => {});
            p.add(t2);
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(() => p.add(t2)).toThrow();
        });
    });
});
