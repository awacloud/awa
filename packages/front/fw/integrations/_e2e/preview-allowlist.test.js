// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/preview-allowlist.test.js
/**
 * Allowlist validator + reporting-side suppression.
 *
 * Browser-less: imports the allowlist module only, never playwright.
 */

import { describe, expect, it } from 'bun:test';

import { ALLOWLIST, applyAllowlist, validateAllowlist } from './preview-allowlist.mjs';

/** @returns {{playground: string, pattern: string, reason: string}} */
const wellFormed = () => ({ playground: 'astro-dev', pattern: '[vite] connecting', reason: 'HMR client chatter, upstream' });

describe('preview gate — validateAllowlist', () => {
    it('the shipped ALLOWLIST is empty (the default state) and validates', () => {
        expect(ALLOWLIST).toEqual([]);
        expect(validateAllowlist(ALLOWLIST)).toBe(ALLOWLIST);
    });

    it('accepts a well-formed entry', () => {
        const list = [wellFormed()];
        expect(validateAllowlist(list)).toBe(list);
    });

    it('throws on a missing reason', () => {
        const entry = wellFormed();
        delete entry.reason;
        expect(() => validateAllowlist([entry])).toThrow(/reason/);
    });

    it('throws on an empty (whitespace-only) reason', () => {
        expect(() => validateAllowlist([{ ...wellFormed(), reason: '   ' }])).toThrow(/reason/);
    });

    it('throws on a missing playground — an entry is never global', () => {
        const entry = wellFormed();
        delete entry.playground;
        expect(() => validateAllowlist([entry])).toThrow(/playground/);
    });

    it('throws on a non-string or empty pattern', () => {
        expect(() => validateAllowlist([{ ...wellFormed(), pattern: 42 }])).toThrow(/pattern/);
        expect(() => validateAllowlist([{ ...wellFormed(), pattern: '' }])).toThrow(/pattern/);
    });

    it('throws on a non-array and on a non-object entry', () => {
        expect(() => validateAllowlist(null)).toThrow(/array/);
        expect(() => validateAllowlist(['just a string'])).toThrow(/object/);
    });
});

describe('preview gate — applyAllowlist', () => {
    /** @returns {object[]} one FAIL leg carrying one console error and one pageerror */
    const results = () => [
        {
            name: 'astro-dev',
            status: 'FAIL',
            consoleErrors: [{ type: 'error', text: 'noisy: deprecated API X', location: {} }],
            pageErrors: [],
        },
        {
            name: 'next',
            status: 'FAIL',
            consoleErrors: [],
            pageErrors: [{ message: 'noisy: deprecated API X', stack: 'Error: …' }],
        },
    ];

    it('keeps the matched message in the array, flagged — never deletes it', () => {
        const list = [{ playground: 'astro-dev', pattern: 'deprecated API X', reason: 'upstream, tracked' }];
        const legs = results();
        const report = applyAllowlist(list, legs, { fullRun: true });

        expect(legs[0].consoleErrors.length).toBe(1);
        expect(legs[0].consoleErrors[0].allowlisted).toBe(true);
        expect(report.suppressed).toBe(1);
        expect(report.matchCounts).toEqual([1]);
    });

    it('stops the matched message contributing to status (FAIL → PASS)', () => {
        const list = [{ playground: 'astro-dev', pattern: 'deprecated API X', reason: 'upstream, tracked' }];
        const legs = results();
        const report = applyAllowlist(list, legs, { fullRun: true });

        expect(legs[0].status).toBe('PASS');
        expect(report.downgraded).toEqual(['astro-dev']);
    });

    it('is exact per playground — the same text stays fatal elsewhere', () => {
        const list = [{ playground: 'astro-dev', pattern: 'deprecated API X', reason: 'upstream, tracked' }];
        const legs = results();
        applyAllowlist(list, legs, { fullRun: true });

        expect(legs[1].status).toBe('FAIL');
        expect(legs[1].pageErrors[0].allowlisted).toBeUndefined();
    });

    it('reports a dead entry, and fails the run only when it is a FULL run', () => {
        const dead = { playground: 'astro-dev', pattern: 'never emitted anywhere', reason: 'stale guard' };
        const full = applyAllowlist([dead], results(), { fullRun: true });
        expect(full.dead).toEqual([dead]);
        expect(full.deadFailsRun).toBe(true);

        const filtered = applyAllowlist([dead], results(), { fullRun: false });
        expect(filtered.dead).toEqual([dead]);
        expect(filtered.deadFailsRun).toBe(false);
    });

    it('an empty allowlist changes nothing', () => {
        const legs = results();
        const report = applyAllowlist([], legs, { fullRun: true });
        expect(legs.map((l) => l.status)).toEqual(['FAIL', 'FAIL']);
        expect(report).toEqual({ matchCounts: [], suppressed: 0, downgraded: [], dead: [], deadFailsRun: false });
    });
});
