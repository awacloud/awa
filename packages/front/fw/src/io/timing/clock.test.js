// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { clock } from './clock.js';

describe('clock module', () => {
    test('module metadata', () => {
        expect(clock.name).toBe('clock');
        expect(clock.version).toBe('1.0.0');
        expect(clock.type).toBe('fw.io.timing');
        expect(clock.dependencies).toEqual([]);
    });

    test('now() returns a current millisecond timestamp', () => {
        const c = clock.factory();
        const before = Date.now();
        const t = c.now();
        const after = Date.now();
        expect(t).toBeGreaterThanOrEqual(before);
        expect(t).toBeLessThanOrEqual(after);
    });

    test('monotonic() never returns a smaller value than previous', () => {
        const c = clock.factory();
        let prev = c.monotonic();
        for (let i = 0; i < 100; i++) {
            const t = c.monotonic();
            expect(t).toBeGreaterThanOrEqual(prev);
            prev = t;
        }
    });

    test('since(t0) returns non-negative elapsed', async () => {
        const c = clock.factory();
        const t0 = c.monotonic();
        await new Promise(r => setTimeout(r, 5));
        const dt = c.since(t0);
        expect(dt).toBeGreaterThanOrEqual(0);
    });

    test('iso() returns an ISO-8601 string', () => {
        const c = clock.factory();
        expect(c.iso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('format() humanises durations', () => {
        const c = clock.factory();
        expect(c.format(0.5)).toBe('0.500 ms');
        expect(c.format(12.3)).toBe('12.3 ms');
        expect(c.format(1234)).toBe('1.234 s');
        expect(c.format(75_000)).toBe('1.25 min');
        expect(c.format(7_200_000)).toBe('2.00 h');
    });

    test('factory isolation : independent _lastMono per instance', () => {
        const a = clock.factory();
        const b = clock.factory();
        a.monotonic();
        b.monotonic();
        // Internal _lastMono is not shared : not directly observable, but
        // factory call returns distinct instances.
        expect(a).not.toBe(b);
    });
});
