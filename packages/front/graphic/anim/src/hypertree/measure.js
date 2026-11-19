// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `hypertree.measure` — the module-local label word-wrap helper for
 * `graphic.hypertree` (the legacy `calculateSize` role). The legacy helper
 * measured pixel widths by appending a hidden `<div>` and reading `offsetWidth`;
 * that is DOM-coupled and non-deterministic across fonts. This kernel instead
 * does a deterministic **character-budget** word-wrap: it breaks a label into
 * lines no longer than `maxLabel` characters at word boundaries, hard-breaking a
 * single over-long word. Pixel-accurate DOM measurement is a documented
 * follow-up (see the doc page).
 *
 * Pure, **Worker-safe** (DOM-free), capture-free (all state in-factory). Injected
 * into `graphic.hypertree` via DI; NOT a member of the public `graphicModules`
 * registry.
 *
 * @module hypertree.measure
 */

/**
 * `hypertree.measure` module descriptor. No dependencies, no DOM.
 *
 * Resolved value: `{ wrapLabel }`.
 *
 * @type {{ name: string, type: string, version: string, dependencies: string[], deps: [], factory: () => { wrapLabel: (text: (string|number|null|undefined), maxLabel: number) => string[] } }}
 */
export const hypertreeMeasureModule = {
    name: 'hypertree.measure',
    type: 'lib.graphic.hypertree',
    version: '0.1.0',
    dependencies: [],
    deps: [],

    factory() {
        /**
         * Word-wrap `text` into lines no longer than `maxLabel` characters.
         *
         * - An empty / whitespace-only / nullish label yields `[]`.
         * - `maxLabel <= 0` yields a single line with the whole (trimmed-of-runs)
         *   label — no wrapping.
         * - Words are kept whole where possible; a single word longer than
         *   `maxLabel` is hard-broken into `maxLabel`-sized chunks.
         *
         * @param {string|number|null|undefined} text
         * @param {number} maxLabel Character budget per line.
         * @returns {string[]} The wrapped lines (possibly empty).
         */
        function wrapLabel(text, maxLabel) {
            const s = (text === undefined || text === null) ? '' : String(text);
            const words = s.split(/\s+/).filter((w) => w.length > 0);
            if (words.length === 0) return [];

            const max = (maxLabel > 0) ? Math.floor(maxLabel) : 0;
            if (max <= 0) return [words.join(' ')];

            const lines = [];
            let cur = '';
            for (const word of words) {
                if (cur === '') {
                    cur = word;
                } else if ((cur.length + 1 + word.length) <= max) {
                    cur += ` ${word}`;
                } else {
                    lines.push(cur);
                    cur = word;
                }
                // Hard-break a single word (or accumulated line) longer than max.
                while (cur.length > max) {
                    lines.push(cur.slice(0, max));
                    cur = cur.slice(max);
                }
            }
            if (cur !== '') lines.push(cur);
            return lines;
        }

        return { wrapLabel };
    },
};
