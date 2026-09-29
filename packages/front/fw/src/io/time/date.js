// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Helpers around native `Date` + `Intl.DateTimeFormat` + `Intl.RelativeTimeFormat`.
 * Strict ISO 8601 parsing, locale-aware formatting with timezone support, and
 * calendar arithmetic.
 */

/**
 * @typedef {'years'|'months'|'weeks'|'days'|'hours'|'minutes'|'seconds'|'ms'} DateArithUnit
 */

/**
 * @typedef {'years'|'months'|'days'|'hours'|'minutes'|'seconds'} DateBoundaryUnit
 */

/**
 * Public shape returned by `date.factory()`.
 * @typedef {object} DateAPI
 * @property {(d: Date, options?: Intl.DateTimeFormatOptions & { locale?: string }) => string} format Format a date with `Intl.DateTimeFormat`.
 * @property {(from: Date, to?: Date, options?: Intl.RelativeTimeFormatOptions & { locale?: string }) => string} formatRelative Format the difference between two dates as a relative string.
 * @property {(str: string, fmt?: string) => (Date|null)} parse Parse a date string using a simple token format.
 * @property {(str: string) => (Date|null)} parseISO Parse a strict ISO 8601 string with mandatory timezone.
 * @property {(a: Date, b: Date, unit: DateArithUnit) => number} diff Integer difference `a - b` in `unit`.
 * @property {(d: Date, n: number, unit: DateArithUnit) => Date} add Return a new date offset by `n` units.
 * @property {(d: Date, n: number, unit: DateArithUnit) => Date} sub Return a new date offset by `-n` units.
 * @property {(d: Date, unit: DateBoundaryUnit) => Date} startOf Round down to the start of `unit`.
 * @property {(d: Date, unit: DateBoundaryUnit) => Date} endOf Round up to the end of `unit`.
 * @property {(d: Date, timeZone: string) => number} getOffset Timezone offset in minutes between UTC and `timeZone`.
 * @property {() => string[]} zones List of supported IANA timezone identifiers.
 * @property {(d: unknown) => boolean} isValid True if `d` is a valid `Date` instance.
 */

export const date = {
    name: 'date',
    version: '1.0.0',
    type: 'fw.io.time',
    dependencies: [],

    /** @returns {DateAPI} */
    factory() {
        /**
         * Returns true if `d` is a valid `Date` instance (not `NaN`).
         * @param {unknown} d
         * @returns {boolean}
         */
        function isValid(d) {
            return d instanceof Date && !isNaN(d.getTime());
        }

        /**
         * Format a date with `Intl.DateTimeFormat`.
         * @param {Date} d
         * @param {Intl.DateTimeFormatOptions & {locale?: string}} [options]
         * @returns {string}
         */
        function format(d, options = {}) {
            const { locale = 'en-US', ...intlOptions } = options;
            return new Intl.DateTimeFormat(locale, intlOptions).format(d);
        }

        // Relative units and thresholds (in ms)
        const _rtfUnits = [
            { unit: 'year',   ms: 365.25 * 24 * 3600 * 1000 },
            { unit: 'month',  ms: 30.44  * 24 * 3600 * 1000 },
            { unit: 'week',   ms:  7     * 24 * 3600 * 1000 },
            { unit: 'day',    ms:       24 * 3600 * 1000 },
            { unit: 'hour',   ms:           3600 * 1000 },
            { unit: 'minute', ms:             60 * 1000 },
            { unit: 'second', ms:                  1000 },
        ];

        /**
         * Format the difference between two dates as a locale-aware relative
         * string (e.g. "in 3 days", "2 hours ago").
         * @param {Date} from - The reference date.
         * @param {Date} [to] - The date being compared (defaults to now).
         * @param {Intl.RelativeTimeFormatOptions & {locale?: string}} [options]
         * @returns {string}
         */
        function formatRelative(from, to, options = {}) {
            if (to === undefined || to === null) to = new Date();
            const { locale = 'en-US', ...intlOptions } = options;
            const diff = from.getTime() - to.getTime();
            const absDiff = Math.abs(diff);
            const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', ...intlOptions });
            for (const { unit, ms } of _rtfUnits) {
                if (absDiff >= ms || unit === 'second') {
                    const value = Math.round(diff / ms);
                    // @ts-ignore - RelativeTimeFormatUnit is strict; valid unit strings used here
                    return rtf.format(value, unit);
                }
            }
            // Defensive fallback (should be unreachable since the loop ends on 'second').
            return rtf.format(0, 'second');
        }

        // Strict ISO 8601: requires timezone designator (Z or ±HH:MM or ±HHMM)
        const _isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

        /**
         * Parse a strict ISO 8601 string with a mandatory timezone designator.
         * @param {string} str
         * @returns {Date|null} The parsed date, or `null` on failure.
         */
        function parseISO(str) {
            if (typeof str !== 'string' || !_isoRegex.test(str)) return null;
            const d = new Date(str);
            return isValid(d) ? d : null;
        }

        /**
         * Parse a date string using a simple token format
         * (`YYYY MM DD HH mm ss SSS`). With no format, falls back to the
         * native `Date` constructor.
         * @param {string} str
         * @param {string} [fmt]
         * @returns {Date|null}
         */
        function parse(str, fmt) {
            if (!fmt) {
                // Fallback to Date constructor
                const d = new Date(str);
                return isValid(d) ? d : null;
            }
            const tokens = { YYYY: null, MM: null, DD: null, HH: null, mm: null, ss: null, SSS: null };
            let pattern = fmt;
            let regexStr = pattern
                .replace(/YYYY/g, '(\\d{4})')
                .replace(/MM/g,   '(\\d{2})')
                .replace(/DD/g,   '(\\d{2})')
                .replace(/HH/g,   '(\\d{2})')
                .replace(/mm/g,   '(\\d{2})')
                .replace(/ss/g,   '(\\d{2})')
                .replace(/SSS/g,  '(\\d{3})');

            // Build capture-group order from the format string.
            const order = [];
            const fmtScan = fmt;
            const tokenOrder = ['YYYY', 'MM', 'DD', 'HH', 'mm', 'ss', 'SSS'];
            const positions = tokenOrder
                .map(t => ({ t, idx: fmtScan.indexOf(t) }))
                .filter(x => x.idx !== -1)
                .sort((a, b) => a.idx - b.idx);
            for (const { t } of positions) order.push(t);

            const match = new RegExp('^' + regexStr + '$').exec(str);
            if (!match) return null;

            for (let i = 0; i < order.length; i++) {
                tokens[order[i]] = parseInt(match[i + 1], 10);
            }

            const yr  = tokens.YYYY ?? 0;
            const mo  = (tokens.MM  ?? 1) - 1;
            const dy  = tokens.DD   ?? 1;
            const hr  = tokens.HH   ?? 0;
            const mn  = tokens.mm   ?? 0;
            const sc  = tokens.ss   ?? 0;
            const ms  = tokens.SSS  ?? 0;

            const d = new Date(yr, mo, dy, hr, mn, sc, ms);
            return isValid(d) ? d : null;
        }

        // Arithmetic helpers
        /**
         * Clone `d` and set its year/month/day, clamping the day to the last
         * valid day of the target month.
         * @param {Date} d
         * @param {number} year
         * @param {number} month
         * @param {number} day
         * @returns {Date}
         */
        function _cloneDateWith(d, year, month, day) {
            const result = new Date(d.getTime());
            // Clamp the day to the last day of the target month.
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            result.setFullYear(year, month, Math.min(day, daysInMonth));
            return result;
        }

        /**
         * Return a new date offset by `n` units from `d`.
         * @param {Date} d
         * @param {number} n
         * @param {'years'|'months'|'weeks'|'days'|'hours'|'minutes'|'seconds'|'ms'} unit
         * @returns {Date}
         */
        function add(d, n, unit) {
            switch (unit) {
                case 'years':   return _cloneDateWith(d, d.getFullYear() + n, d.getMonth(), d.getDate());
                case 'months':  return _cloneDateWith(d, d.getFullYear(), d.getMonth() + n, d.getDate());
                case 'weeks':   { const r = new Date(d.getTime()); r.setDate(d.getDate() + n * 7); return r; }
                case 'days':    { const r = new Date(d.getTime()); r.setDate(d.getDate() + n); return r; }
                case 'hours':   { const r = new Date(d.getTime()); r.setTime(d.getTime() + n * 3600000); return r; }
                case 'minutes': { const r = new Date(d.getTime()); r.setTime(d.getTime() + n * 60000); return r; }
                case 'seconds': { const r = new Date(d.getTime()); r.setTime(d.getTime() + n * 1000); return r; }
                case 'ms':      { const r = new Date(d.getTime()); r.setTime(d.getTime() + n); return r; }
                default: throw new Error(`date.add: unknown unit "${unit}"`);
            }
        }

        /**
         * Return a new date offset by `-n` units from `d`.
         * @param {Date} d
         * @param {number} n
         * @param {'years'|'months'|'weeks'|'days'|'hours'|'minutes'|'seconds'|'ms'} unit
         * @returns {Date}
         */
        function sub(d, n, unit) {
            return add(d, -n, unit);
        }

        /**
         * Return the integer difference `a - b` expressed in `unit`.
         * @param {Date} a
         * @param {Date} b
         * @param {'years'|'months'|'weeks'|'days'|'hours'|'minutes'|'seconds'|'ms'} unit
         * @returns {number}
         */
        function diff(a, b, unit) {
            const ms = a.getTime() - b.getTime();
            switch (unit) {
                case 'years':   return Math.trunc((a.getFullYear() - b.getFullYear()) + (a.getMonth() - b.getMonth()) / 12);
                case 'months': {
                    const yearDiff = a.getFullYear() - b.getFullYear();
                    const monthDiff = a.getMonth() - b.getMonth();
                    const total = yearDiff * 12 + monthDiff;
                    // Adjust if the day of month has not been reached yet.
                    const sign = total >= 0 ? 1 : -1;
                    const dayA = a.getDate(), dayB = b.getDate();
                    if (sign > 0 && dayA < dayB) return total - 1;
                    if (sign < 0 && dayA > dayB) return total + 1;
                    return total;
                }
                case 'weeks':   return Math.trunc(ms / (7 * 86400000));
                case 'days':    return Math.trunc(ms / 86400000);
                case 'hours':   return Math.trunc(ms / 3600000);
                case 'minutes': return Math.trunc(ms / 60000);
                case 'seconds': return Math.trunc(ms / 1000);
                case 'ms':      return ms;
                default: throw new Error(`date.diff: unknown unit "${unit}"`);
            }
        }

        /**
         * Return a new date rounded down to the start of `unit`.
         * @param {Date} d
         * @param {'years'|'months'|'days'|'hours'|'minutes'|'seconds'} unit
         * @returns {Date}
         */
        function startOf(d, unit) {
            const r = new Date(d.getTime());
            switch (unit) {
                case 'years':
                    r.setMonth(0, 1);
                    r.setHours(0, 0, 0, 0);
                    break;
                case 'months':
                    r.setDate(1);
                    r.setHours(0, 0, 0, 0);
                    break;
                case 'days':
                    r.setHours(0, 0, 0, 0);
                    break;
                case 'hours':
                    r.setMinutes(0, 0, 0);
                    break;
                case 'minutes':
                    r.setSeconds(0, 0);
                    break;
                case 'seconds':
                    r.setMilliseconds(0);
                    break;
            }
            return r;
        }

        /**
         * Return a new date rounded up to the end of `unit`.
         * @param {Date} d
         * @param {'years'|'months'|'days'|'hours'|'minutes'|'seconds'} unit
         * @returns {Date}
         */
        function endOf(d, unit) {
            const r = new Date(d.getTime());
            switch (unit) {
                case 'years':
                    r.setMonth(11, 31);
                    r.setHours(23, 59, 59, 999);
                    break;
                case 'months': {
                    const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
                    r.setDate(lastDay);
                    r.setHours(23, 59, 59, 999);
                    break;
                }
                case 'days':
                    r.setHours(23, 59, 59, 999);
                    break;
                case 'hours':
                    r.setMinutes(59, 59, 999);
                    break;
                case 'minutes':
                    r.setSeconds(59, 999);
                    break;
                case 'seconds':
                    r.setMilliseconds(999);
                    break;
            }
            return r;
        }

        /**
         * Return the timezone offset in minutes between UTC and `timeZone`
         * at the given instant `d`.
         * @param {Date} d
         * @param {string} timeZone - An IANA timezone identifier.
         * @returns {number}
         */
        function getOffset(d, timeZone) {
            // Compare the UTC-formatted parts with the timezone-formatted parts.
            const opts = { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
                           hour: '2-digit', minute: '2-digit', second: '2-digit' };
            // @ts-ignore - Intl.DateTimeFormat overload matching limitation; valid options passed
            const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d);
            const get = (type) => parseInt(parts.find(p => p.type === type).value, 10);
            const tzDate = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')));
            return Math.round((tzDate.getTime() - d.getTime()) / 60000);
        }

        /**
         * Return the list of supported IANA timezone identifiers, falling
         * back to a small built-in list when `Intl.supportedValuesOf` is
         * unavailable.
         * @returns {string[]}
         */
        function zones() {
            try {
                return Intl.supportedValuesOf('timeZone');
            } catch {
                return ['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York',
                        'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                        'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'];
            }
        }

        return { format, formatRelative, parse, parseISO, diff, add, sub, startOf, endOf, getOffset, zones, isValid };
    },
};
