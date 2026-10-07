// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview ODF markup-compatibility helpers.
 *
 * ODF's compatibility story is much lighter than OOXML's `mc:` namespace:
 * versions are advertised via the `office:version` attribute on root
 * elements, and unknown elements/attributes are simply ignored by
 * conformant consumers.
 *
 * This module exposes:
 *
 * - `versionOf(rootEl)` — read the `office:version` attribute.
 * - `meetsVersion(rootEl, target)` — boolean comparison against a
 *   target version (e.g. `'1.4'`).
 * - `process(rootEl)` — currently a no-op (returns the element
 *   unchanged). Reserved for future stripping / promotion logic; kept
 *   parallel to ooxml's `markupCompatibility.process`.
 *
 * @module odf/mc/markupCompatibility
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const odfMc = {
    name: 'odfMc',
    dependencies: ['xml'],
    deps: [xml],

    factory(_xml) {

        /** @param {object} rootEl */
        function versionOf(rootEl) {
            if (!rootEl || !rootEl.attrs) return null;
            const v = rootEl.attrs['office:version'];
            return v != null ? String(v) : null;
        }

        /**
         * Compare `office:version` against a target. Handles dotted
         * versions component-wise (e.g. `'1.4'` ≥ `'1.3'`). Missing
         * version returns `false`.
         *
         * @param {object} rootEl
         * @param {string} target
         * @returns {boolean}
         */
        function meetsVersion(rootEl, target) {
            const v = versionOf(rootEl);
            if (!v) return false;
            const a = v.split('.').map(n => parseInt(n, 10) || 0);
            const b = String(target).split('.').map(n => parseInt(n, 10) || 0);
            const len = Math.max(a.length, b.length);
            for (let i = 0; i < len; i++) {
                const ai = a[i] || 0;
                const bi = b[i] || 0;
                if (ai > bi) return true;
                if (ai < bi) return false;
            }
            return true;
        }

        /**
         * Markup-compatibility pre-processing — currently a no-op.
         *
         * @param {object} rootEl
         * @returns {object} same root element
         */
        function process(rootEl) {
            return rootEl;
        }

        return { versionOf, meetsVersion, process };
    }
};
