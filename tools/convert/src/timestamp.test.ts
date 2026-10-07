// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/timestamp.test.ts — unit tests for the RFC 3339
 * `date-time` rule (`./timestamp.ts`) shared by the CLI `--at` flag, the
 * MCP `at` argument and the core `convertedAt` field.
 */

import { describe, expect, test } from 'bun:test';
import { timestampError } from './timestamp.ts';

describe('timestampError — accepted', () => {
    const accepted = [
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00+02:00',
        '2024-02-29T00:00:00Z',
        '2026-01-01T23:59:59.123456789Z',
    ];

    for (const value of accepted) {
        test(`accepts ${value}`, () => {
            expect(timestampError(value)).toBeNull();
        });
    }
});

describe('timestampError — rejected', () => {
    const rejected: Array<[label: string, value: unknown]> = [
        ['not-a-date', 'not-a-date'],
        ['empty string', ''],
        ['date-only', '2026-01-01'],
        ['month 13', '2026-13-01T00:00:00Z'],
        ['Feb 30', '2026-02-30T00:00:00Z'],
        ['Feb 29 in a non-leap year', '2025-02-29T00:00:00Z'],
        ['hour 24', '2026-01-01T24:00:00Z'],
        ['leap second', '2026-01-01T00:00:60Z'],
        ['lowercase t/z', '2026-01-01t00:00:00z'],
        ['trailing newline', '2026-01-01T00:00:00Z\n'],
        ['a number, not a string', 42],
        ['undefined', undefined],
    ];

    for (const [label, value] of rejected) {
        test(`rejects ${label}`, () => {
            const err = timestampError(value);
            expect(err).not.toBeNull();
            expect(err).toBe(
                `invalid timestamp ${JSON.stringify(value)}: expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z`,
            );
        });
    }
});

describe('timestampError — verbatim, never normalised', () => {
    test('an accepted value is not rewritten (the function only judges it)', () => {
        // timestampError returns null | string (the error), never the input —
        // this test documents the contract for callers: they must keep using
        // their OWN original value on success, never a "normalised" one from
        // this module (there is none).
        expect(timestampError('2026-01-01T00:00:00+02:00')).toBeNull();
    });
});
