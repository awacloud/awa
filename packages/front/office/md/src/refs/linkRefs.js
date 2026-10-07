// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Link reference definition map (CommonMark §4.7) —
 * `refsLinkRefs` module factory.
 *
 * Filled by the block parser when it encounters a definition of the
 * form `[label]: /url "title"` (CommonMark §4.7), consumed by the
 * inline parser when resolving `[label][ref]` / `[label]` shortcut
 * forms (§6.5).
 *
 * The map keys are **normalized** : Unicode case-fold + collapsed
 * whitespace (one ASCII space). Lookups must apply the same
 * normalization.
 *
 * Strict factory-only : the module exposes a single `{ name,
 * dependencies, factory }` descriptor — no top-level helper exports.
 *
 * @module md/refs/linkRefs
 */

export const refsLinkRefs = {
    name: 'refsLinkRefs',
    dependencies: [],
    factory() {
        /**
         * Normalize a link label per CommonMark §4.7.
         * @param {string} label
         * @returns {string}
         */
        function normalizeLabel(label) {
            return label
                .trim()
                .replace(/[ \t\r\n]+/g, ' ')
                // Unicode case-fold per commonmark.js#168 :
                // toLowerCase then toUpperCase covers Turkish dotted I etc.
                .toLowerCase()
                .toUpperCase();
        }

        /** Create an empty link reference map. */
        function createLinkRefMap() {
            return Object.create(null);
        }

        /**
         * Insert a definition. First write wins (CommonMark §4.7).
         * @param {Object} map
         * @param {string} label
         * @param {string} destination
         * @param {string|null} title
         * @returns {boolean} — true if inserted, false if duplicate.
         */
        function addLinkRef(map, label, destination, title) {
            const k = normalizeLabel(label);
            if (k === '' || map[k] !== undefined) return false;
            map[k] = { destination, title: title || null };
            return true;
        }

        /** Look up a definition. */
        function lookupLinkRef(map, label) {
            return map[normalizeLabel(label)] || null;
        }

        /** Convenience alias used by some consumers. */
        function normalize(label) { return normalizeLabel(label); }

        return { normalize, normalizeLabel, createLinkRefMap, addLinkRef, lookupLinkRef };
    }
};
