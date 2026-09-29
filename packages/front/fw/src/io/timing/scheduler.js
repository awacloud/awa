// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Cron parser (5-field) + interval + job scheduler. No timezone awareness,
 * no seconds field, no Quartz extensions, no catch-up on missed firings.
 */

/**
 * Parsed cron expression fields. Each field is the set of integer values
 * (in its allowed range) that satisfy the field's expression.
 *
 * @typedef {Object} CronFields
 * @property {Set<number>} minute  Minutes 0-59 that match.
 * @property {Set<number>} hour    Hours 0-23 that match.
 * @property {Set<number>} day     Days of month 1-31 that match.
 * @property {Set<number>} month   Months 1-12 that match.
 * @property {Set<number>} weekday Days of week 0-6 (Sunday=0) that match.
 */

/**
 * Public API of a parsed cron expression.
 *
 * @typedef {Object} CronInstance
 * @property {string} expression                            Original expression string.
 * @property {(from?: Date) => Date} next                   Next firing strictly after `from` (default: now).
 * @property {(n: number, from?: Date) => Date[]} nextN     Next `n` firings starting after `from`.
 * @property {(d: Date) => boolean} matches                 Whether the given date matches the expression.
 * @property {CronFields} fields                            Parsed field sets.
 */

/**
 * Public API of an interval timer.
 *
 * @typedef {Object} IntervalInstance
 * @property {() => void} start    Start firing the callback every `ms`. Idempotent.
 * @property {() => void} stop     Stop the interval. Safe to call when not running.
 * @property {boolean} running     Whether the interval is currently active.
 */

/**
 * Public API of a cron-scheduled job.
 *
 * @typedef {Object} JobInstance
 * @property {() => void} start    Start scheduling the next firing. Idempotent.
 * @property {() => void} stop     Stop the job and clear any pending timer.
 * @property {boolean} running     Whether the job is currently scheduled to fire.
 * @property {Date|null} next      Date of the next scheduled firing, or null if stopped.
 * @property {string} expression   Original cron expression.
 */

/**
 * Public API returned by `scheduler.factory()`.
 *
 * @typedef {Object} SchedulerAPI
 * @property {(expression: string) => CronInstance} cron       Parse a 5-field cron expression into a matcher/next-firing helper.
 * @property {(callback: () => void, ms: number) => IntervalInstance} interval Create a fixed-interval timer.
 * @property {(expression: string, callback: () => void) => JobInstance} job   Create a cron-scheduled job.
 */
export const scheduler = {
    name: 'scheduler',
    dependencies: [],

    /** @returns {SchedulerAPI} */
    factory() {
        const FIELD_RANGES = {
            minute:  { min: 0,  max: 59 },
            hour:    { min: 0,  max: 23 },
            day:     { min: 1,  max: 31 },
            month:   { min: 1,  max: 12 },
            weekday: { min: 0,  max: 6  },
        };

        /**
         * Parse a single cron field expression into the set of values it matches.
         * Supports `*`, literals, `a-b` ranges, `a,b,c` lists, and `expr/step` steps.
         *
         * @param {string} raw   The raw field token (e.g. `"*\/15"`, `"0-30"`, `"1,5,9"`).
         * @param {keyof typeof FIELD_RANGES} field  Which cron field this token belongs to.
         * @returns {Set<number>} The set of integer values within the field's range that match.
         * @throws {Error} If the token is malformed or out of range.
         */
        function _parseField(raw, field) {
            const { min, max } = FIELD_RANGES[field];
            const result = new Set();

            for (const part of raw.split(',')) {
                const stepMatch = part.match(/^(.+)\/(\d+)$/);
                let step = 1;
                let rangePart = part;

                if (stepMatch) {
                    step = parseInt(stepMatch[2], 10);
                    if (step <= 0)
                        throw new Error(`scheduler: invalid cron expression - field ${field}: step must be > 0`);
                    rangePart = stepMatch[1];
                }

                let rMin, rMax;
                if (rangePart === '*') {
                    rMin = min; rMax = max;
                } else if (/^\d+-\d+$/.test(rangePart)) {
                    [rMin, rMax] = rangePart.split('-').map(Number);
                } else if (/^\d+$/.test(rangePart)) {
                    rMin = rMax = parseInt(rangePart, 10);
                } else {
                    throw new Error(`scheduler: invalid cron expression - field ${field}: invalid token '${rangePart}'`);
                }

                if (!Number.isInteger(rMin) || !Number.isInteger(rMax) ||
                    rMin < min || rMax > max || rMin > rMax)
                    throw new Error(`scheduler: invalid cron expression - field ${field}: value out of range ${min}-${max}`);

                for (let v = rMin; v <= rMax; v += step) result.add(v);
            }

            return result;
        }

        /**
         * Parse a 5-field cron expression (`minute hour day month weekday`) and
         * return helpers for matching dates and computing future firings.
         *
         * Day-of-month and day-of-week are OR-ed when both are non-wildcard
         * (standard Vixie cron semantics).
         *
         * @param {string} expression  Five whitespace-separated cron fields.
         * @returns {CronInstance}
         * @throws {Error} If the expression is malformed or out of range.
         */
        function cron(expression) {
            const parts = expression.trim().split(/\s+/);
            if (parts.length !== 5) {
                const msg = parts.length > 5
                    ? 'scheduler: invalid cron expression - seconds field not supported (expected 5 fields)'
                    : 'scheduler: invalid cron expression - expected 5 fields';
                throw new Error(msg);
            }

            const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw] = parts;
            const parsed = {
                minute:  _parseField(minuteRaw,  'minute'),
                hour:    _parseField(hourRaw,    'hour'),
                day:     _parseField(dayRaw,     'day'),
                month:   _parseField(monthRaw,   'month'),
                weekday: _parseField(weekdayRaw, 'weekday'),
            };

            const dayIsWild     = dayRaw === '*';
            const weekdayIsWild = weekdayRaw === '*';

            /**
             * Whether the date's day-of-month / day-of-week satisfies the expression,
             * honoring the OR semantics when both fields are non-wildcard.
             *
             * @param {Date} d
             * @returns {boolean}
             */
            function _dayMatches(d) {
                const dom = d.getDate();
                const dow = d.getDay();
                if (!dayIsWild && !weekdayIsWild) return parsed.day.has(dom) || parsed.weekday.has(dow);
                if (!dayIsWild)     return parsed.day.has(dom);
                if (!weekdayIsWild) return parsed.weekday.has(dow);
                return true;
            }

            /**
             * Whether the given date matches the cron expression at minute resolution.
             *
             * @param {Date} d
             * @returns {boolean}
             */
            function matches(d) {
                return parsed.month.has(d.getMonth() + 1)
                    && _dayMatches(d)
                    && parsed.hour.has(d.getHours())
                    && parsed.minute.has(d.getMinutes());
            }

            /**
             * Compute the next firing date strictly after `from`.
             * Searches within a 5-year horizon and throws if no match is found
             * (e.g. impossible expression like `0 0 31 4 *`).
             *
             * @param {Date} [from]  Reference date; defaults to current time.
             * @returns {Date}
             * @throws {Error} If no firing exists within 5 years.
             */
            function next(from) {
                const base = from ? new Date(from) : new Date();
                // Advance to the start of the next minute (strictly after base)
                base.setSeconds(0, 0);
                base.setMinutes(base.getMinutes() + 1);

                const horizonMs = base.getTime() + 5 * 365.25 * 24 * 60 * 60 * 1000;
                const c = new Date(base);

                while (c.getTime() <= horizonMs) {
                    if (!parsed.month.has(c.getMonth() + 1)) {
                        // Jump to start of next month
                        c.setMonth(c.getMonth() + 1, 1);
                        c.setHours(0, 0, 0, 0);
                        continue;
                    }
                    if (!_dayMatches(c)) {
                        c.setDate(c.getDate() + 1);
                        c.setHours(0, 0, 0, 0);
                        continue;
                    }
                    if (!parsed.hour.has(c.getHours())) {
                        c.setHours(c.getHours() + 1, 0, 0, 0);
                        continue;
                    }
                    if (!parsed.minute.has(c.getMinutes())) {
                        c.setMinutes(c.getMinutes() + 1, 0, 0);
                        continue;
                    }
                    return new Date(c);
                }

                throw new Error('scheduler: no firing in 5y horizon');
            }

            /**
             * Compute the next `n` firings starting strictly after `from`.
             *
             * @param {number} n     Number of firings to compute.
             * @param {Date} [from]  Reference date; defaults to current time.
             * @returns {Date[]}     Strictly increasing list of firing dates.
             */
            function nextN(n, from) {
                const results = [];
                let cursor = from;
                for (let i = 0; i < n; i++) {
                    const d = next(cursor);
                    results.push(d);
                    cursor = d;
                }
                return results;
            }

            return {
                expression,
                next,
                nextN,
                matches,
                fields: { minute: parsed.minute, hour: parsed.hour, day: parsed.day, month: parsed.month, weekday: parsed.weekday },
            };
        }

        /**
         * Create a fixed-interval timer that calls `callback` every `ms` milliseconds.
         * Callback exceptions are caught and logged to `console.error`.
         *
         * @param {() => void} callback  Function to invoke on each tick.
         * @param {number} ms            Interval in milliseconds (must be a finite positive number).
         * @returns {IntervalInstance}
         * @throws {Error} If `callback` is not a function or `ms` is not a positive finite number.
         */
        function interval(callback, ms) {
            if (typeof callback !== 'function') throw new Error('scheduler: callback must be a function');
            if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0)
                throw new Error('scheduler: ms must be a positive number');

            let _timer = null;

            function start() {
                if (_timer !== null) return;
                _timer = setInterval(() => {
                    try { callback(); } catch (e) { console.error(e); }
                }, ms);
            }

            function stop() {
                if (_timer === null) return;
                clearInterval(_timer);
                _timer = null;
            }

            return {
                start,
                stop,
                get running() { return _timer !== null; },
            };
        }

        /**
         * Create a cron-scheduled job: invoke `callback` at every firing of the
         * expression. Callback exceptions are caught and logged to `console.error`.
         *
         * Cancellation uses an explicit `_stopped` flag (rather than relying on the
         * timer handle being null) so that a `stop()` call that races with a fired
         * timer callback is honored: the pending callback will see the flag and skip
         * the next reschedule even if the timer handle has already been cleared.
         *
         * @param {string} expression       5-field cron expression.
         * @param {() => void} callback     Function to invoke on each firing.
         * @returns {JobInstance}
         * @throws {Error} If `callback` is not a function or the expression is invalid.
         */
        function job(expression, callback) {
            if (typeof callback !== 'function') throw new Error('scheduler: callback must be a function');
            const _cron = cron(expression);

            let _timer = null;
            let _next = null;
            let _stopped = true;

            function _schedule() {
                if (_stopped) return;
                _next = _cron.next();
                const delay = Math.max(0, _next.getTime() - Date.now());
                _timer = setTimeout(() => {
                    _timer = null;
                    if (_stopped) return;
                    try { callback(); } catch (e) { console.error(e); }
                    if (_stopped) return;
                    _schedule();
                }, delay);
            }

            function start() {
                if (!_stopped) return;
                _stopped = false;
                _schedule();
            }

            function stop() {
                _stopped = true;
                if (_timer !== null) {
                    clearTimeout(_timer);
                    _timer = null;
                }
                _next = null;
            }

            return {
                start,
                stop,
                get running() { return !_stopped; },
                get next()    { return _next; },
                get expression() { return expression; },
            };
        }

        return { cron, interval, job };
    },
};
