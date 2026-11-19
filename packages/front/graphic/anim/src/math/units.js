// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `graphic.units` — CSS unit split/format fw module descriptor.
 *
 * **Worker-safe**: pure string + arithmetic; no `window`/`document` references.
 * Shape mirrors the engine's first vertical slice.
 *
 * @module graphic.units
 */

/**
 * `graphic.units` module descriptor.
 *
 * Resolved value: `{ split(input: string|number): UnitValue, format(value: number, unit: string): string }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [], factory(): { split(input: string|number): { value: number, unit: string }, format(value: number, unit: string): string } }}
 */
export const unitsModule = {
    name: 'graphic.units',
    type: 'lib.graphic.math',
    version: '0.1.0',
    dependencies: [],
    deps: [],

    /**
     * Returns the CSS unit split/format helpers.
     *
     * @returns {{ split(input: string|number): { value: number, unit: string }, format(value: number, unit: string): string }}
     *
     * @example
     * const units = unitsModule.factory();
     * units.split('50px');        // { value: 50, unit: 'px' }
     * units.format(50, 'px');     // '50px'
     */
    factory() {
        /**
         * Numeric value paired with a CSS unit string.
         * @typedef {{ value: number, unit: string }} UnitValue
         */

        return {
            /**
             * Split a CSS value string into its numeric part and unit suffix.
             * A bare number returns `{ value, unit: '' }`.
             *
             * @param {string|number} input  e.g. `"50px"`, `".5em"`, `"1e3px"`, `"100%"`, or `50`.
             * @returns {UnitValue}
             * @throws {Error} When `input` cannot be parsed (e.g. `"abc"`).
             */
            split(input) {
                if (typeof input === 'number') return { value: input, unit: '' };
                if (typeof input !== 'string') throw new Error('units.split: expected string|number');
                const m = input.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i);
                if (!m) throw new Error(`units.split: cannot parse "${input}"`);
                return { value: parseFloat(m[1]), unit: m[2] || '' };
            },

            /**
             * Format a numeric value and unit suffix back to a string.
             * Rounds to 1e-6 precision to avoid floating-point noise.
             *
             * @param {number} value  Numeric value.
             * @param {string} unit   Unit suffix (e.g. `'px'`); pass `''` for bare numbers.
             * @returns {string}
             */
            format(value, unit) {
                const v = Math.round(value * 1e6) / 1e6;
                return `${v}${unit || ''}`;
            },
        };
    },
};
