// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { scheduler } from './scheduler.js';

describe('scheduler module', () => {
    test('should have correct module metadata', () => {
        expect(scheduler.name).toBe('scheduler');
        expect(scheduler.dependencies).toEqual([]);
        expect(typeof scheduler.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = scheduler.factory();
            expect(typeof inst.cron).toBe('function');
            expect(typeof inst.interval).toBe('function');
            expect(typeof inst.job).toBe('function');
        });
    });

    describe('cron', () => {
        let inst;
        beforeEach(() => { inst = scheduler.factory(); });

        // Parsing - valid
        test('* * * * * parses without throw', () => {
            const c = inst.cron('* * * * *');
            expect(c.fields.minute.size).toBe(60);
            expect(c.fields.hour.size).toBe(24);
        });

        test('0 * * * * stores expression', () => {
            const c = inst.cron('0 * * * *');
            expect(c.expression).toBe('0 * * * *');
        });

        test('*/15 * * * * gives minute set {0,15,30,45}', () => {
            const c = inst.cron('*/15 * * * *');
            expect([...c.fields.minute].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
        });

        test('0,15,30,45 * * * * list', () => {
            const c = inst.cron('0,15,30,45 * * * *');
            expect([...c.fields.minute].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
        });

        test('0 9-17 * * 1-5 range on hour and weekday', () => {
            const c = inst.cron('0 9-17 * * 1-5');
            expect(c.fields.hour.has(9)).toBe(true);
            expect(c.fields.hour.has(17)).toBe(true);
            expect(c.fields.hour.has(18)).toBe(false);
            expect(c.fields.weekday.has(1)).toBe(true);
            expect(c.fields.weekday.has(5)).toBe(true);
            expect(c.fields.weekday.has(0)).toBe(false);
        });

        test('30 2 1 * * step-range', () => {
            const c = inst.cron('30 2 1 * *');
            expect(c.fields.minute.has(30)).toBe(true);
            expect(c.fields.minute.has(0)).toBe(false);
            expect(c.fields.day.has(1)).toBe(true);
        });

        test('1-30/5 minute field yields 1,6,11,16,21,26', () => {
            const c = inst.cron('1-30/5 * * * *');
            expect([...c.fields.minute].sort((a, b) => a - b)).toEqual([1, 6, 11, 16, 21, 26]);
        });

        // Parsing - invalid
        test('throws on 4 fields', () => {
            expect(() => inst.cron('* * * *')).toThrow('scheduler: invalid cron expression');
        });

        test('throws on 6 fields with seconds hint', () => {
            expect(() => inst.cron('0 * * * * *')).toThrow('seconds field not supported');
        });

        test('throws on value out of range', () => {
            expect(() => inst.cron('60 * * * *')).toThrow('scheduler: invalid cron expression');
            expect(() => inst.cron('* 24 * * *')).toThrow('scheduler: invalid cron expression');
        });

        test('throws on non-numeric token', () => {
            expect(() => inst.cron('a * * * *')).toThrow('scheduler: invalid cron expression');
        });

        test('throws on step zero', () => {
            expect(() => inst.cron('*/0 * * * *')).toThrow('scheduler: invalid cron expression');
        });

        test('throws on bad range order', () => {
            expect(() => inst.cron('10-5 * * * *')).toThrow('scheduler: invalid cron expression');
        });

        // matches()
        test('* * * * * matches any minute', () => {
            const c = inst.cron('* * * * *');
            const d = new Date(2024, 0, 1, 12, 30, 0); // Jan 1 2024 12:30
            expect(c.matches(d)).toBe(true);
        });

        test('0 * * * * matches only minute 0', () => {
            const c = inst.cron('0 * * * *');
            expect(c.matches(new Date(2024, 0, 1, 12, 0))).toBe(true);
            expect(c.matches(new Date(2024, 0, 1, 12, 1))).toBe(false);
        });

        test('0 9-17 * * 1-5 business hours matches', () => {
            const c = inst.cron('0 9-17 * * 1-5');
            // Monday Jan 1 2024 at 09:00
            const mon = new Date(2024, 0, 1, 9, 0);
            expect(mon.getDay()).toBe(1); // is Monday
            expect(c.matches(mon)).toBe(true);
            // Sunday
            const sun = new Date(2024, 0, 7, 9, 0);
            expect(sun.getDay()).toBe(0);
            expect(c.matches(sun)).toBe(false);
        });

        // OR semantics: day AND weekday both specified
        test('day OR weekday semantics when both specified', () => {
            // 0 0 1 * 3 = midnight on 1st of month OR Wednesday
            const c = inst.cron('0 0 1 * 3');
            // Wednesday Jan 3 2024 at 00:00
            const wed = new Date(2024, 0, 3, 0, 0);
            expect(wed.getDay()).toBe(3); // Wednesday
            expect(wed.getDate()).toBe(3); // 3rd, not 1st
            expect(c.matches(wed)).toBe(true); // matches via weekday=3

            // Thursday Jan 4 2024 (not 1st, not Wednesday) at 00:00
            const thu = new Date(2024, 0, 4, 0, 0);
            expect(c.matches(thu)).toBe(false);

            // Monday Jan 1 2024 at 00:00 (is 1st AND Monday, not Wednesday)
            const mon = new Date(2024, 0, 1, 0, 0);
            expect(c.matches(mon)).toBe(true); // matches via day=1
        });

        // next()
        test('next() from minute boundary returns next match', () => {
            const c = inst.cron('*/15 * * * *');
            const from = new Date(2024, 0, 1, 0, 0, 0); // 00:00:00
            const n = c.next(from);
            expect(n.getMinutes()).toBe(15);
            expect(n.getHours()).toBe(0);
            expect(n.getDate()).toBe(1);
        });

        test('next() * * * * * is exactly 1 minute after from (start of next minute)', () => {
            const c = inst.cron('* * * * *');
            const from = new Date(2024, 0, 1, 5, 30, 0);
            const n = c.next(from);
            expect(n.getMinutes()).toBe(31);
            expect(n.getHours()).toBe(5);
        });

        test('next() 0 9 * * 1-5 from Jan 1 2024 midnight → Jan 1 09:00 (Jan 1 is Monday)', () => {
            const c = inst.cron('0 9 * * 1-5');
            const from = new Date(2024, 0, 1, 0, 0, 0);
            expect(new Date(2024, 0, 1).getDay()).toBe(1); // Verify Monday
            const n = c.next(from);
            expect(n.getFullYear()).toBe(2024);
            expect(n.getMonth()).toBe(0);
            expect(n.getDate()).toBe(1);
            expect(n.getHours()).toBe(9);
            expect(n.getMinutes()).toBe(0);
        });

        test('next() skips April 31 - jumps to May 31', () => {
            const c = inst.cron('0 0 31 * *');
            const from = new Date(2024, 3, 30, 0, 0); // April 30 2024
            const n = c.next(from);
            expect(n.getMonth()).toBe(4); // May (0-indexed)
            expect(n.getDate()).toBe(31);
        });

        test('next() with all-impossible expression throws 5y horizon error', () => {
            // April 31 never exists
            const c = inst.cron('0 0 31 4 *');
            const from = new Date(2024, 0, 1);
            expect(() => c.next(from)).toThrow('scheduler: no firing in 5y horizon');
        });

        test('nextN returns N strictly increasing dates', () => {
            const c = inst.cron('*/10 * * * *');
            const from = new Date(2024, 0, 1, 0, 0, 0);
            const dates = c.nextN(5, from);
            expect(dates.length).toBe(5);
            for (let i = 1; i < dates.length; i++) {
                expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
            }
        });

        test('next() result matches() the expression', () => {
            const c = inst.cron('30 14 * * *');
            const n = c.next(new Date(2024, 0, 1, 0, 0));
            expect(c.matches(n)).toBe(true);
        });
    });

    describe('interval', () => {
        let inst;
        beforeEach(() => { inst = scheduler.factory(); });

        test('running is false initially', () => {
            const it = inst.interval(() => {}, 100);
            expect(it.running).toBe(false);
        });

        test('running is true after start()', async () => {
            const it = inst.interval(() => {}, 100);
            it.start();
            expect(it.running).toBe(true);
            it.stop();
        });

        test('running is false after stop()', () => {
            const it = inst.interval(() => {}, 100);
            it.start();
            it.stop();
            expect(it.running).toBe(false);
        });

        test('start() is idempotent', () => {
            let calls = 0;
            const it = inst.interval(() => calls++, 50);
            it.start();
            it.start(); // no-op
            expect(it.running).toBe(true);
            it.stop();
        });

        test('stop() on non-running is safe', () => {
            const it = inst.interval(() => {}, 100);
            expect(() => it.stop()).not.toThrow();
        });

        test('callback is called at least 3 times after 3 intervals', async () => {
            let count = 0;
            const it = inst.interval(() => count++, 10);
            it.start();
            await new Promise(resolve => setTimeout(resolve, 60));
            it.stop();
            expect(count).toBeGreaterThanOrEqual(3);
        });

        test('stop() prevents further calls', async () => {
            let count = 0;
            const it = inst.interval(() => count++, 10);
            it.start();
            await new Promise(resolve => setTimeout(resolve, 30));
            const snapshot = count;
            it.stop();
            await new Promise(resolve => setTimeout(resolve, 30));
            expect(count).toBe(snapshot);
        });

        test('restart after stop() fires again', async () => {
            let count = 0;
            const it = inst.interval(() => count++, 10);
            it.start();
            await new Promise(resolve => setTimeout(resolve, 30));
            it.stop();
            const before = count;
            it.start();
            await new Promise(resolve => setTimeout(resolve, 30));
            it.stop();
            expect(count).toBeGreaterThan(before);
        });

        test('throws on non-function callback', () => {
            expect(() => inst.interval(42, 100)).toThrow('scheduler: callback must be a function');
        });

        test('throws on invalid ms', () => {
            expect(() => inst.interval(() => {}, 0)).toThrow('scheduler: ms must be a positive number');
            expect(() => inst.interval(() => {}, -1)).toThrow();
            expect(() => inst.interval(() => {}, 'fast')).toThrow();
        });
    });

    describe('job', () => {
        let inst;
        beforeEach(() => { inst = scheduler.factory(); });

        test('job has expected API', () => {
            const j = inst.job('* * * * *', () => {});
            expect(typeof j.start).toBe('function');
            expect(typeof j.stop).toBe('function');
            expect(typeof j.running).toBe('boolean');
            expect(j.next === null || j.next instanceof Date).toBe(true);
            expect(j.expression).toBe('* * * * *');
        });

        test('running is false initially', () => {
            const j = inst.job('* * * * *', () => {});
            expect(j.running).toBe(false);
        });

        test('running is true after start()', () => {
            const j = inst.job('* * * * *', () => {});
            j.start();
            expect(j.running).toBe(true);
            j.stop();
        });

        test('next is a future Date after start()', () => {
            const j = inst.job('* * * * *', () => {});
            j.start();
            expect(j.next).toBeInstanceOf(Date);
            expect(j.next.getTime()).toBeGreaterThan(Date.now());
            j.stop();
        });

        test('next is null after stop()', () => {
            const j = inst.job('* * * * *', () => {});
            j.start();
            j.stop();
            expect(j.next).toBe(null);
        });

        test('running is false after stop()', () => {
            const j = inst.job('* * * * *', () => {});
            j.start();
            j.stop();
            expect(j.running).toBe(false);
        });

        test('start() is idempotent', () => {
            const j = inst.job('* * * * *', () => {});
            j.start();
            const n1 = j.next;
            j.start();
            expect(j.next).toBe(n1); // same Date reference
            j.stop();
        });

        test('expression getter returns the expression', () => {
            const j = inst.job('0 9 * * 1-5', () => {});
            expect(j.expression).toBe('0 9 * * 1-5');
        });

        test('throws on invalid expression', () => {
            expect(() => inst.job('not valid at all', () => {})).toThrow('scheduler: invalid cron expression');
        });

        test('throws on non-function callback', () => {
            expect(() => inst.job('* * * * *', 'notfn')).toThrow('scheduler: callback must be a function');
        });

        test('next is strictly before next-next', () => {
            const c = inst.cron('*/5 * * * *');
            const [first, second] = c.nextN(2, new Date());
            expect(first).toBeInstanceOf(Date);
            expect(second).toBeInstanceOf(Date);
            expect(first.getTime()).toBeLessThan(second.getTime());
        });
    });
});
