// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { date } from './date.js';

describe('date module', () => {
    test('should have correct module metadata', () => {
        expect(date.name).toBe('date');
        expect(date.dependencies).toEqual([]);
        expect(typeof date.factory).toBe('function');
    });

    describe('factory', () => {
        test('should return object with expected API', () => {
            const d = date.factory();
            expect(typeof d.format).toBe('function');
            expect(typeof d.formatRelative).toBe('function');
            expect(typeof d.parse).toBe('function');
            expect(typeof d.parseISO).toBe('function');
            expect(typeof d.diff).toBe('function');
            expect(typeof d.add).toBe('function');
            expect(typeof d.sub).toBe('function');
            expect(typeof d.startOf).toBe('function');
            expect(typeof d.endOf).toBe('function');
            expect(typeof d.getOffset).toBe('function');
            expect(typeof d.zones).toBe('function');
            expect(typeof d.isValid).toBe('function');
        });
    });

    describe('isValid', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('returns true for valid Date', () => {
            expect(dt.isValid(new Date())).toBe(true);
            expect(dt.isValid(new Date('2024-01-15'))).toBe(true);
        });

        test('returns false for invalid Date', () => {
            expect(dt.isValid(new Date('not-a-date'))).toBe(false);
            expect(dt.isValid(null)).toBe(false);
            expect(dt.isValid('2024-01-15')).toBe(false);
        });
    });

    describe('format', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('formats with Intl options', () => {
            const d = new Date('2024-06-15T12:00:00Z');
            const result = dt.format(d, { locale: 'en-US', timeZone: 'UTC', dateStyle: 'long' });
            expect(result).toContain('15');
            expect(result).toContain('2024');
        });

        test('formats with fr-FR locale', () => {
            const d = new Date('2024-01-15T10:00:00Z');
            const result = dt.format(d, {
                locale: 'fr-FR',
                timeZone: 'UTC',
                day: 'numeric', month: 'long', year: 'numeric'
            });
            // Should contain French month name or at least the date parts
            expect(result).toMatch(/15/);
            expect(result).toMatch(/2024/);
        });
    });

    describe('formatRelative', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('formats -300000ms as "5 minutes ago" (en-US)', () => {
            const now = new Date();
            const past = new Date(now.getTime() - 300000);
            const result = dt.formatRelative(past, now, { locale: 'en-US' });
            expect(result).toMatch(/5 minutes ago|5 min/i);
        });

        test('formats past as "il y a 5 minutes" (fr-FR)', () => {
            const now = new Date();
            const past = new Date(now.getTime() - 300000);
            const result = dt.formatRelative(past, now, { locale: 'fr-FR' });
            expect(result).toMatch(/5 minutes/i);
        });

        test('uses current time when to is not provided', () => {
            const past = new Date(Date.now() - 3600000);
            const result = dt.formatRelative(past, undefined, { locale: 'en-US' });
            expect(result).toMatch(/hour|hr/i);
        });
    });

    describe('parseISO', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('parses valid ISO 8601 with Z timezone', () => {
            const d = dt.parseISO('2024-01-15T10:30:00Z');
            expect(dt.isValid(d)).toBe(true);
            expect(d.getUTCFullYear()).toBe(2024);
            expect(d.getUTCMonth()).toBe(0);
            expect(d.getUTCDate()).toBe(15);
        });

        test('parses valid ISO 8601 with ±HH:MM timezone', () => {
            const d = dt.parseISO('2024-06-15T10:30:00+02:00');
            expect(dt.isValid(d)).toBe(true);
        });

        test('parses ISO 8601 with milliseconds', () => {
            const d = dt.parseISO('2024-01-15T10:30:00.123Z');
            expect(dt.isValid(d)).toBe(true);
            expect(d.getUTCMilliseconds()).toBe(123);
        });

        test('returns null for non-string', () => {
            expect(dt.parseISO(null)).toBeNull();
            expect(dt.parseISO(123)).toBeNull();
        });

        test('returns null for invalid string', () => {
            expect(dt.parseISO('not-a-date')).toBeNull();
            expect(dt.parseISO('')).toBeNull();
        });

        test('returns null for date without timezone (strict)', () => {
            expect(dt.parseISO('2024-01-15')).toBeNull();
            expect(dt.parseISO('2024-01-15T10:30:00')).toBeNull();
        });
    });

    describe('parse', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('parses DD/MM/YYYY format', () => {
            const d = dt.parse('15/01/2024', 'DD/MM/YYYY');
            expect(dt.isValid(d)).toBe(true);
            expect(d.getFullYear()).toBe(2024);
            expect(d.getMonth()).toBe(0);
            expect(d.getDate()).toBe(15);
        });

        test('parses YYYY-MM-DD format', () => {
            const d = dt.parse('2024-06-15', 'YYYY-MM-DD');
            expect(dt.isValid(d)).toBe(true);
            expect(d.getFullYear()).toBe(2024);
            expect(d.getMonth()).toBe(5);
            expect(d.getDate()).toBe(15);
        });

        test('parses YYYY-MM-DD HH:mm:ss format', () => {
            const d = dt.parse('2024-01-15 10:30:45', 'YYYY-MM-DD HH:mm:ss');
            expect(dt.isValid(d)).toBe(true);
            expect(d.getHours()).toBe(10);
            expect(d.getMinutes()).toBe(30);
            expect(d.getSeconds()).toBe(45);
        });

        test('returns null for non-matching format', () => {
            expect(dt.parse('not-a-date', 'YYYY-MM-DD')).toBeNull();
        });
    });

    describe('add', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('add years', () => {
            const d = new Date(2024, 0, 15);
            const r = dt.add(d, 2, 'years');
            expect(r.getFullYear()).toBe(2026);
            expect(r.getMonth()).toBe(0);
            expect(r.getDate()).toBe(15);
        });

        test('add months - clamp Jan 31 + 1 month → Feb 29 (2024 leap)', () => {
            const d = new Date(2024, 0, 31);
            const r = dt.add(d, 1, 'months');
            expect(r.getFullYear()).toBe(2024);
            expect(r.getMonth()).toBe(1);
            expect(r.getDate()).toBe(29);
        });

        test('add years - clamp Feb 29 + 1 year → Feb 28 (2025 non-leap)', () => {
            const d = new Date(2024, 1, 29);
            const r = dt.add(d, 1, 'years');
            expect(r.getFullYear()).toBe(2025);
            expect(r.getMonth()).toBe(1);
            expect(r.getDate()).toBe(28);
        });

        test('add days', () => {
            const d = new Date(2024, 0, 30);
            const r = dt.add(d, 3, 'days');
            expect(r.getDate()).toBe(2);
            expect(r.getMonth()).toBe(1);
        });

        test('add hours', () => {
            const d = new Date(2024, 0, 15, 10, 0, 0);
            const r = dt.add(d, 3, 'hours');
            expect(r.getHours()).toBe(13);
        });

        test('add minutes', () => {
            const d = new Date(2024, 0, 15, 10, 45, 0);
            const r = dt.add(d, 20, 'minutes');
            expect(r.getHours()).toBe(11);
            expect(r.getMinutes()).toBe(5);
        });

        test('add does not mutate input', () => {
            const d = new Date(2024, 0, 15);
            const original = d.getTime();
            dt.add(d, 1, 'days');
            expect(d.getTime()).toBe(original);
        });

        test('throws on unknown unit', () => {
            expect(() => dt.add(new Date(), 1, 'centuries')).toThrow();
        });
    });

    describe('sub', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('sub days', () => {
            const d = new Date(2024, 1, 1);
            const r = dt.sub(d, 3, 'days');
            expect(r.getDate()).toBe(29);
            expect(r.getMonth()).toBe(0);
        });
    });

    describe('diff', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('diff in days', () => {
            const a = new Date(2024, 0, 20);
            const b = new Date(2024, 0, 15);
            expect(dt.diff(a, b, 'days')).toBe(5);
        });

        test('diff in hours', () => {
            const a = new Date(2024, 0, 15, 13, 0, 0);
            const b = new Date(2024, 0, 15, 10, 0, 0);
            expect(dt.diff(a, b, 'hours')).toBe(3);
        });

        test('diff negative when a < b', () => {
            const a = new Date(2024, 0, 10);
            const b = new Date(2024, 0, 15);
            expect(dt.diff(a, b, 'days')).toBe(-5);
        });

        test('diff in ms', () => {
            const a = new Date(1000);
            const b = new Date(0);
            expect(dt.diff(a, b, 'ms')).toBe(1000);
        });

        test('round-trip: add then diff', () => {
            const base = new Date(2024, 2, 10);
            const added = dt.add(base, 45, 'days');
            expect(dt.diff(added, base, 'days')).toBe(45);
        });
    });

    describe('startOf', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('startOf day', () => {
            const d = new Date(2024, 5, 15, 14, 30, 45, 123);
            const r = dt.startOf(d, 'days');
            expect(r.getHours()).toBe(0);
            expect(r.getMinutes()).toBe(0);
            expect(r.getSeconds()).toBe(0);
            expect(r.getMilliseconds()).toBe(0);
        });

        test('startOf month', () => {
            const d = new Date(2024, 5, 20);
            const r = dt.startOf(d, 'months');
            expect(r.getDate()).toBe(1);
            expect(r.getHours()).toBe(0);
        });

        test('startOf year', () => {
            const d = new Date(2024, 6, 15);
            const r = dt.startOf(d, 'years');
            expect(r.getMonth()).toBe(0);
            expect(r.getDate()).toBe(1);
        });
    });

    describe('endOf', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('endOf day', () => {
            const d = new Date(2024, 5, 15, 0, 0, 0);
            const r = dt.endOf(d, 'days');
            expect(r.getHours()).toBe(23);
            expect(r.getMinutes()).toBe(59);
            expect(r.getSeconds()).toBe(59);
            expect(r.getMilliseconds()).toBe(999);
        });

        test('endOf month - correct last day', () => {
            const d = new Date(2024, 1, 10); // February 2024 (leap)
            const r = dt.endOf(d, 'months');
            expect(r.getDate()).toBe(29);
            expect(r.getHours()).toBe(23);
            expect(r.getMilliseconds()).toBe(999);
        });

        test('endOf year', () => {
            const d = new Date(2024, 6, 15);
            const r = dt.endOf(d, 'years');
            expect(r.getMonth()).toBe(11);
            expect(r.getDate()).toBe(31);
        });
    });

    describe('getOffset', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('UTC offset is 0', () => {
            const d = new Date('2024-01-15T12:00:00Z');
            expect(dt.getOffset(d, 'UTC')).toBe(0);
        });

        test('America/New_York offset is -300 or -240', () => {
            const d = new Date('2024-01-15T12:00:00Z');
            const offset = dt.getOffset(d, 'America/New_York');
            expect([-300, -240]).toContain(offset);
        });
    });

    describe('zones', () => {
        let dt;
        beforeEach(() => { dt = date.factory(); });

        test('returns array containing UTC and common zones', () => {
            const zs = dt.zones();
            expect(Array.isArray(zs)).toBe(true);
            expect(zs).toContain('UTC');
            expect(zs).toContain('Europe/Paris');
        });
    });
});
