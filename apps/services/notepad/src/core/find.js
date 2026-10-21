// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Find and replace over plain text: literal search (the
 * query is escaped with fw `str.escapeRegExp`, never read as a pattern),
 * optional case match, forward or backward, wrapping around the ends like
 * a notepad does.
 *
 * No DOM.
 *
 * @module notepad/core/find
 */

/**
 * @typedef {object} FindOptions
 * @property {boolean} [matchCase=false]
 * @property {boolean} [backwards=false]
 * @property {boolean} [wrap=true] Continue from the other end when nothing is found.
 */

/**
 * The search functions, on fw's `str` instance.
 * @param {{escapeRegExp: (s: string) => string}} str
 */
export function createFinder(str) {
    /** @param {string} query @param {boolean} matchCase */
    const pattern = (query, matchCase) => new RegExp(str.escapeRegExp(query), matchCase ? 'g' : 'gi');

    /**
     * Every match of `query`, in order.
     * @param {string} text
     * @param {string} query
     * @param {{matchCase?: boolean}} [opts]
     * @returns {{start: number, end: number}[]}
     */
    function findAll(text, query, { matchCase = false } = {}) {
        if (!query) return [];
        return [...text.matchAll(pattern(query, matchCase))].map((m) => {
            const start = /** @type {number} */ (m.index);
            return { start, end: start + m[0].length };
        });
    }

    /**
     * The next match from a caret: forward, the first starting at or after
     * `from`; backwards, the last ending at or before it.
     * @param {string} text
     * @param {string} query
     * @param {number} from
     * @param {FindOptions} [opts]
     * @returns {{start: number, end: number}|null}
     */
    function findNext(text, query, from, { matchCase = false, backwards = false, wrap = true } = {}) {
        const all = findAll(text, query, { matchCase });
        if (all.length === 0) return null;
        if (backwards) {
            for (let i = all.length - 1; i >= 0; i--) if (all[i].end <= from) return all[i];
            return wrap ? all[all.length - 1] : null;
        }
        for (const m of all) if (m.start >= from) return m;
        return wrap ? all[0] : null;
    }

    /**
     * Replace every match of `query` (the replacement is literal: `$&` stays `$&`).
     * @param {string} text
     * @param {string} query
     * @param {string} replacement
     * @param {{matchCase?: boolean}} [opts]
     * @returns {{text: string, count: number}}
     */
    function replaceAll(text, query, replacement, { matchCase = false } = {}) {
        if (!query) return { text, count: 0 };
        let count = 0;
        const out = text.replace(pattern(query, matchCase), () => { count++; return replacement; });
        return { text: out, count };
    }

    /**
     * Whether the selected range is exactly a match of `query`.
     * @param {string} text
     * @param {number} start
     * @param {number} end
     * @param {string} query
     * @param {{matchCase?: boolean}} [opts]
     */
    function isMatch(text, start, end, query, { matchCase = false } = {}) {
        if (!query || end <= start) return false;
        const selected = text.slice(start, end);
        return findAll(selected, query, { matchCase }).some((m) => m.start === 0 && m.end === selected.length);
    }

    return { findAll, findNext, replaceAll, isMatch };
}
