// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { animate } from './animate.js';

describe('animate module', () => {

    test('has correct module metadata', () => {
        expect(animate.name).toBe('animate');
        expect(animate.dependencies).toEqual(['easing']);
        expect(typeof animate.factory).toBe('function');
    });

    describe('factory', () => {
        let rafQueue;
        let mockEasing;
        let animateFn;

        beforeEach(() => {
            // Synchronous RAF mock: collect callbacks, run them manually per-test.
            rafQueue = [];
            globalThis.requestAnimationFrame = (cb) => {
                rafQueue.push(cb);
                return rafQueue.length;
            };

            // Linear easing: value travels from b to b+c linearly over d ms.
            mockEasing = {
                linear: (t, b, c, d) => b + c * (t / d)
            };

            animateFn = animate.factory(mockEasing);
        });

        test('returns a function', () => {
            expect(typeof animateFn).toBe('function');
        });

        test('schedules a requestAnimationFrame on start', () => {
            animateFn(100, 'linear', { init: 0, end: 100 }, () => {});
            expect(rafQueue.length).toBe(1);
        });

        test('first frame (elapsed=0) skips progress and queues next frame', () => {
            const calls = [];
            animateFn(100, 'linear', { init: 0, end: 100 }, (v) => calls.push(v));

            // The first RAF callback receives timestamp = start, so elapsed = 0 → skip.
            rafQueue.shift()(1000);

            expect(calls.length).toBe(0);
            expect(rafQueue.length).toBe(1); // next frame was scheduled
        });

        test('subsequent frame calls progress with the eased value', () => {
            const calls = [];
            animateFn(100, 'linear', { init: 0, end: 100 }, (v) => calls.push(v));

            rafQueue.shift()(1000); // start (elapsed=0, skip)
            rafQueue.shift()(1050); // elapsed=50ms → linear → 50

            expect(calls.length).toBe(1);
            expect(calls[0]).toBeCloseTo(50, 1);
        });

        test('last frame calls onComplete after calling progress', () => {
            const calls = [];
            let completed = false;
            animateFn(100, 'linear', { init: 0, end: 100 },
                (v) => calls.push(v),
                () => { completed = true; }
            );

            rafQueue.shift()(1000); // start
            rafQueue.shift()(1100); // elapsed=100=duration → final frame

            expect(calls.length).toBe(1);    // progress called on final frame
            expect(calls[0]).toBeCloseTo(100, 1);
            expect(completed).toBe(true);
        });

        test('no further frames are scheduled after animation ends', () => {
            animateFn(100, 'linear', { init: 0, end: 100 }, () => {}, null);

            rafQueue.shift()(1000);
            rafQueue.shift()(1100); // end

            expect(rafQueue.length).toBe(0);
        });

        test('stops immediately when running() returns false', () => {
            let progressCalled = false;
            animateFn(100, 'linear', { init: 0, end: 100 },
                () => { progressCalled = true; },
                null,
                () => false
            );

            rafQueue.shift()(1000); // running() → false → bail out

            expect(progressCalled).toBe(false);
            expect(rafQueue.length).toBe(0); // no next frame
        });

        test('default running guard allows animation to proceed', () => {
            const calls = [];
            animateFn(100, 'linear', { init: 0, end: 100 }, (v) => calls.push(v));

            rafQueue.shift()(0);
            rafQueue.shift()(50);

            expect(calls.length).toBe(1);
        });

        test('null onComplete does not throw at animation end', () => {
            expect(() => {
                animateFn(100, 'linear', { init: 0, end: 100 }, () => {}, null);
                rafQueue.shift()(1000);
                rafQueue.shift()(1100);
            }).not.toThrow();
        });

        test('animates from init to end using the easing function', () => {
            const calls = [];
            animateFn(200, 'linear', { init: 10, end: 110 }, (v) => calls.push(v));

            rafQueue.shift()(0);    // start
            rafQueue.shift()(100);  // elapsed=100ms, halfway

            // linear: 10 + (100) * (100/200) = 60
            expect(calls[0]).toBeCloseTo(60, 1);
        });

        test('progress callback receives running guard as second argument', () => {
            let receivedRunning = null;
            animateFn(100, 'linear', { init: 0, end: 100 }, (v, running) => {
                receivedRunning = running;
            });

            rafQueue.shift()(0);
            rafQueue.shift()(50);

            expect(typeof receivedRunning).toBe('function');
            expect(receivedRunning()).toBe(true); // default guard
        });

        test('factory isolation: each call returns an independent animate function', () => {
            const fn1 = animate.factory(mockEasing);
            const fn2 = animate.factory(mockEasing);
            expect(fn1).not.toBe(fn2);
        });

        // ── input validation (fail-fast) ──────────────────────────────────────────

        describe('input validation', () => {
            test('throws TypeError on non-numeric duration', () => {
                expect(() => animateFn('100', 'linear', { init: 0, end: 1 }, () => {})).toThrow(TypeError);
            });

            test('throws TypeError on zero or negative duration', () => {
                expect(() => animateFn(0, 'linear', { init: 0, end: 1 }, () => {})).toThrow(TypeError);
                expect(() => animateFn(-10, 'linear', { init: 0, end: 1 }, () => {})).toThrow(TypeError);
            });

            test('throws TypeError on non-finite duration', () => {
                expect(() => animateFn(Infinity, 'linear', { init: 0, end: 1 }, () => {})).toThrow(TypeError);
                expect(() => animateFn(NaN, 'linear', { init: 0, end: 1 }, () => {})).toThrow(TypeError);
            });

            test('throws TypeError when easingName not found on map', () => {
                expect(() => animateFn(100, 'unknown', { init: 0, end: 1 }, () => {})).toThrow(TypeError);
            });

            test('throws TypeError when easingName not a string', () => {
                expect(() => animateFn(100, null, { init: 0, end: 1 }, () => {})).toThrow(TypeError);
            });

            test('throws TypeError when prop is null or missing fields', () => {
                expect(() => animateFn(100, 'linear', null, () => {})).toThrow(TypeError);
                expect(() => animateFn(100, 'linear', {}, () => {})).toThrow(TypeError);
                expect(() => animateFn(100, 'linear', { init: 0 }, () => {})).toThrow(TypeError);
                expect(() => animateFn(100, 'linear', { init: 'a', end: 1 }, () => {})).toThrow(TypeError);
            });

            test('throws TypeError when progress is not a function', () => {
                expect(() => animateFn(100, 'linear', { init: 0, end: 1 }, null)).toThrow(TypeError);
                expect(() => animateFn(100, 'linear', { init: 0, end: 1 }, 'cb')).toThrow(TypeError);
            });

            test('throws TypeError when onComplete is not a function or null', () => {
                expect(() => animateFn(100, 'linear', { init: 0, end: 1 }, () => {}, 'done')).toThrow(TypeError);
            });

            test('accepts null onComplete', () => {
                expect(() => animateFn(100, 'linear', { init: 0, end: 1 }, () => {}, null)).not.toThrow();
            });

            test('throws TypeError when running is not a function', () => {
                expect(() => animateFn(100, 'linear', { init: 0, end: 1 }, () => {}, null, 'go')).toThrow(TypeError);
            });
        });
    });
});
