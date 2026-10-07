// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/timestamp.ts — the RFC 3339 `date-time` rule shared by
 * the CLI `--at` flag, the MCP `at` argument and the core `convertedAt`
 * field.
 *
 * Pure: no import, no side effect, and not published under `exports` — this
 * module is internal, reached only by a relative import from `./index.ts`,
 * `./mcp.ts` and `./core.ts`. It exports exactly one function.
 *
 * The rule is a strict RFC 3339 `date-time`:
 * `YYYY-MM-DDTHH:MM:SS[.fraction](Z|±HH:MM)`, with an uppercase `T` and,
 * when the offset is zero, an uppercase `Z` — never `t`/`z`. A date-only
 * value, a surrounding space, an embedded newline or any other shape is
 * rejected. Calendar values must be valid: month 01-12, day within the
 * month (leap years included), hour 00-23, minute and second 00-59 (no
 * leap second), offset hours 00-23 and offset minutes 00-59. A value that
 * passes is returned untouched by every caller — this module only judges
 * it, it never rewrites or normalises it.
 *
 * @module tool-convert/timestamp
 */

const RFC3339_DATE_TIME =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
    if (month === 2 && isLeapYear(year)) return 29;
    return DAYS_IN_MONTH[month - 1] as number;
}

function isValidCalendar(match: RegExpExecArray): boolean {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > daysInMonth(year, month)) return false;
    if (hour > 23 || minute > 59 || second > 59) return false;

    const offset = match[7] as string;
    if (offset === 'Z') return true;
    const offsetHour = Number(match[8]);
    const offsetMinute = Number(match[9]);
    return offsetHour <= 23 && offsetMinute <= 59;
}

/**
 * `null` when `value` is a strict RFC 3339 `date-time` string — otherwise
 * the rejection message, naming the offending value via `JSON.stringify`
 * (which keeps any control character out of stderr as an escaped literal,
 * never a raw byte).
 */
export function timestampError(value: unknown): string | null {
    if (typeof value === 'string') {
        const match = RFC3339_DATE_TIME.exec(value);
        if (match && isValidCalendar(match)) return null;
    }
    return `invalid timestamp ${JSON.stringify(value)}: expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z`;
}
