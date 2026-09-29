// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/preview-allowlist.mjs
/**
 * @fileoverview Per-playground console/pageerror allowlist for the preview gate.
 *
 * Three invariants, all frozen by FINDINGS §3:
 *
 * 1. **A reason-less entry is invalid BY CONSTRUCTION.** `validateAllowlist()`
 *    runs at LOAD TIME (bottom of this file) and again from `preview.mjs` before
 *    any browser work, which maps a bad table to exit code 2.
 * 2. **`playground` is required and exact — an entry is NEVER global.** A pattern
 *    muting noise in `astro-dev` must not silently mute the same text in `next`.
 * 3. **Suppression is a REPORTING-side transform.** The matched message STAYS in
 *    `consoleErrors` / `pageErrors`, flagged `allowlisted: true`; it only stops
 *    contributing to the status. Deleting it at capture time would make the
 *    allowlist unauditable and break the honest-capture invariant.
 *
 * Anti-rot: an entry that matched nothing during a FULL run is dead — a negative
 * containment assertion rots silently once the literal it guards is renamed away
 * — so it is reported and, on a full run, fails the run.
 *
 * `pattern` matching is **plain substring containment** (`String.prototype
 * .includes`), deliberately NOT a regular expression: a literal such as
 * `[vite] connecting` would be read as a character class and silently match
 * nothing, which is exactly the silent-rot failure this mechanism exists to
 * prevent.
 */

/**
 * @typedef {Object} AllowlistEntry
 * @property {string} playground  Exact leg name (`result.name`), never a glob.
 * @property {string} pattern     Substring matched against `text` (console) or `message` (pageerror).
 * @property {string} reason      Why this noise is tolerated. Mandatory, non-empty.
 */

/**
 * The allowlist in force. **Empty is the default and the current state.**
 * Serialized verbatim into every report, so an artifact always states what was
 * muted.
 *
 * @type {AllowlistEntry[]}
 */
export const ALLOWLIST = [];

/**
 * Reject a malformed table loudly instead of by convention.
 *
 * @param {AllowlistEntry[]} list
 * @returns {AllowlistEntry[]} the same list, when valid
 * @throws {TypeError} on a non-array, a non-object entry, a missing/empty
 *   `playground`, a non-string/empty `pattern`, or a missing/empty `reason`
 */
export function validateAllowlist(list) {
    if (!Array.isArray(list)) {
        throw new TypeError('[preview] ALLOWLIST must be an array');
    }
    list.forEach((entry, index) => {
        const at = `[preview] allowlist entry #${index}`;
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new TypeError(`${at}: must be an object {playground, pattern, reason}`);
        }
        if (typeof entry.playground !== 'string' || entry.playground.trim() === '') {
            throw new TypeError(`${at}: \`playground\` is required and exact — an allowlist entry is never global`);
        }
        if (typeof entry.pattern !== 'string' || entry.pattern === '') {
            throw new TypeError(`${at}: \`pattern\` must be a non-empty string`);
        }
        if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
            throw new TypeError(`${at}: \`reason\` is required and must be non-empty — a reason-less entry is invalid by construction`);
        }
    });
    return list;
}

/**
 * @param {AllowlistEntry} entry
 * @param {{text?: string, message?: string}} msg
 * @returns {boolean}
 */
function matches(entry, msg) {
    const haystack = typeof msg?.text === 'string' ? msg.text : typeof msg?.message === 'string' ? msg.message : null;
    return haystack !== null && haystack.includes(entry.pattern);
}

/**
 * Apply the allowlist to a run's results, as a reporting-side transform.
 *
 * Mutates in place: matched messages gain `allowlisted: true` (they are NEVER
 * removed), and a leg whose every captured error is allowlisted is downgraded
 * `FAIL` → `PASS`.
 *
 * @param {AllowlistEntry[]} list
 * @param {{name: string, status: string, consoleErrors?: object[], pageErrors?: object[]}[]} results
 * @param {{fullRun?: boolean}} [opts] `fullRun` = no leg filter was given.
 * @returns {{matchCounts: number[], suppressed: number, downgraded: string[],
 *            dead: AllowlistEntry[], deadFailsRun: boolean}}
 */
export function applyAllowlist(list, results, { fullRun = false } = {}) {
    const entries = list ?? [];
    const matchCounts = entries.map(() => 0);
    const downgraded = [];
    let suppressed = 0;

    for (const result of results ?? []) {
        const captured = [...(result.consoleErrors ?? []), ...(result.pageErrors ?? [])];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.playground !== result.name) continue;
            for (const msg of captured) {
                if (!matches(entry, msg)) continue;
                if (msg.allowlisted !== true) suppressed++;
                msg.allowlisted = true;
                matchCounts[i]++;
            }
        }
        const live = captured.filter((msg) => msg.allowlisted !== true);
        if (result.status === 'FAIL' && live.length === 0 && captured.length > 0) {
            result.status = 'PASS';
            downgraded.push(result.name);
        }
    }

    const dead = entries.filter((_entry, i) => matchCounts[i] === 0);
    return { matchCounts, suppressed, downgraded, dead, deadFailsRun: fullRun && dead.length > 0 };
}

// Load-time enforcement — invariant 1. A malformed table must never reach a run.
validateAllowlist(ALLOWLIST);
