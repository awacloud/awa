// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { queue } from './queue.js';

describe('queue module', () => {
    test('should have correct module metadata', () => {
        expect(queue.name).toBe('queue');
        expect(queue.version).toBe('1.0.0');
        expect(queue.type).toBe('fw.io.utils');
        expect(queue.dependencies).toEqual([]);
        expect(typeof queue.factory).toBe('function');
    });

    describe('factory', () => {
        let Queue;

        beforeEach(() => {
            Queue = queue.factory();
        });

        test('should create Queue class', () => {
            const q = new Queue();
            expect(q).toBeDefined();
            expect(typeof q.push).toBe('function');
            expect(typeof q.concat).toBe('function');
            expect(typeof q.end).toBe('function');
            expect(typeof q.stop).toBe('function');
        });

        test('should process jobs in order with concurrency=1', async () => {
            const q = new Queue();
            const seen = [];
            const done = new Promise(resolve => {
                q.onEnd = resolve;
            });

            q.onData = (job, end) => {
                seen.push(job);
                end();
            };

            q.concat([1, 2, 3]);
            q.end();

            const err = await done;
            expect(err).toBeUndefined();
            expect(seen).toEqual([1, 2, 3]);
        });

        test('should enforce concurrency limit', async () => {
            const q = new Queue(2);
            let running = 0;
            let maxRunning = 0;
            const done = new Promise(resolve => {
                q.onEnd = resolve;
            });

            q.onData = (job, end) => {
                running++;
                if (running > maxRunning) maxRunning = running;
                setTimeout(() => {
                    running--;
                    end();
                }, 5);
            };

            q.concat([1, 2, 3, 4, 5, 6]);
            q.end();

            const err = await done;
            expect(err).toBeUndefined();
            expect(maxRunning).toBeLessThanOrEqual(2);
        });

        test('should close with error from job', async () => {
            const q = new Queue();
            const seen = [];
            const done = new Promise(resolve => {
                q.onEnd = resolve;
            });

            q.onData = (job, end) => {
                seen.push(job);
                end('bad');
            };

            q.concat([1, 2, 3]);
            q.end();

            const err = await done;
            expect(err).toBe('bad');
            expect(seen.length).toBe(1);
        });

        test('should throw when pushing after end', () => {
            const q = new Queue();
            q.onData = (job, end) => end();
            q.onEnd = () => {};
            q.end();
            expect(() => q.push(1)).toThrow('Queue.push() was called after Queue.end()');
        });

        test('should stop with error', async () => {
            const q = new Queue();
            const done = new Promise(resolve => {
                q.onEnd = resolve;
            });

            q.onData = (job, end) => {
                setTimeout(() => end(), 5);
            };

            q.push(1);
            q.stop('fail');

            const err = await done;
            expect(err).toBe('fail');
        });
    });
});
