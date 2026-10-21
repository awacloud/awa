// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/loss-summary.test.ts — unit tests for the loss grouping
 * (`./loss-summary.ts`) behind the `lossSummary` field of every `toMd`,
 * `fromMd` and `convert` result.
 */

import { describe, expect, test } from 'bun:test';
import { summarizeLosses } from './loss-summary.ts';

describe('summarizeLosses', () => {
    test('an empty ledger summarises to an empty list', () => {
        expect(summarizeLosses([])).toEqual([]);
    });

    test('one entry per code + string detail, counted, in order of first occurrence', () => {
        const losses = [
            { code: 'block/dropped', detail: 'hr' },
            { code: 'block/degraded', detail: 'blockquote' },
            { code: 'block/dropped', detail: 'hr' },
            { code: 'block/dropped', detail: 'html_block' },
            { code: 'block/degraded', detail: 'blockquote' },
            { code: 'block/dropped', detail: 'hr' },
        ];
        expect(summarizeLosses(losses)).toEqual([
            { code: 'block/dropped', detail: 'hr', count: 3 },
            { code: 'block/degraded', detail: 'blockquote', count: 2 },
            { code: 'block/dropped', detail: 'html_block', count: 1 },
        ]);
    });

    test('an object detail is grouped by its JSON form; index and kind are not part of the key', () => {
        const detail = { style: 'mono', baseFont: 'Courier' };
        const losses = [
            { index: '0', kind: 'list', code: 'list/task-marker-dropped', detail: '[x]' },
            { code: 'layout/font-fallback', detail: { ...detail } },
            { index: '3', kind: 'list', code: 'list/task-marker-dropped', detail: '[x]' },
            { code: 'layout/font-fallback', detail: { ...detail } },
            { code: 'layout/font-fallback', detail: { style: 'bold', baseFont: 'Helvetica-Bold' } },
        ];
        const summary = summarizeLosses(losses);
        expect(summary).toEqual([
            { code: 'list/task-marker-dropped', detail: '[x]', count: 2 },
            { code: 'layout/font-fallback', detail, count: 2 },
            { code: 'layout/font-fallback', detail: { style: 'bold', baseFont: 'Helvetica-Bold' }, count: 1 },
        ]);
        for (const entry of summary) expect(Object.keys(entry).sort()).toEqual(['code', 'count', 'detail']);
    });

    test('a string detail never merges with an object detail of the same text', () => {
        const losses = [
            { code: 'x/y', detail: '{"a":1}' },
            { code: 'x/y', detail: { a: 1 } },
        ];
        expect(summarizeLosses(losses).map((e) => e.count)).toEqual([1, 1]);
    });

    test('the ledger is not mutated and the detail is the first occurrence', () => {
        const first = { reason: 'no-bytes' };
        const losses = [
            { code: 'layout/image-dropped', detail: first },
            { code: 'layout/image-dropped', detail: { reason: 'no-bytes' } },
        ];
        const before = JSON.stringify(losses);
        const [entry] = summarizeLosses(losses);
        expect(entry?.detail).toBe(first);
        expect(JSON.stringify(losses)).toBe(before);
    });

    test('the 48-loss ledger of the 2026-10-03 owner test summarises to six entries', () => {
        const losses = [
            ...Array.from({ length: 22 }, () => ({ code: 'block/dropped', detail: 'hr' })),
            ...Array.from({ length: 18 }, () => ({ code: 'block/degraded', detail: 'blockquote' })),
            { code: 'block/degraded', detail: 'listItem-child:blockquote' },
            ...Array.from({ length: 5 }, () => ({ code: 'list/task-marker-dropped', detail: '[ ]' })),
            { code: 'block/degraded', detail: 'codeBlock' },
            { code: 'block/degraded', detail: 'listItem-child:table' },
        ];
        expect(losses).toHaveLength(48);
        expect(summarizeLosses(losses)).toEqual([
            { code: 'block/dropped', detail: 'hr', count: 22 },
            { code: 'block/degraded', detail: 'blockquote', count: 18 },
            { code: 'block/degraded', detail: 'listItem-child:blockquote', count: 1 },
            { code: 'list/task-marker-dropped', detail: '[ ]', count: 5 },
            { code: 'block/degraded', detail: 'codeBlock', count: 1 },
            { code: 'block/degraded', detail: 'listItem-child:table', count: 1 },
        ]);
    });
});
