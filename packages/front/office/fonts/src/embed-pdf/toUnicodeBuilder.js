// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview embed-pdf — Build a ToUnicode CMap from a glyph map.
 *
 * Thin wrapper over `cmap/toUnicode.js#buildToUnicode` that accepts the
 * shape returned by {@link ../embed-pdf/subsetForPdf}.
 *
 * Strict factory-only.
 *
 * @module fonts/embed-pdf/toUnicodeBuilder
 */

import { cmapToUnicode } from '../cmap/toUnicode.js';

export const embedToUnicodeBuilder = {
    name: 'embedToUnicodeBuilder',
    dependencies: ['cmapToUnicode'],
    deps: [cmapToUnicode],
    factory(cmapToUnicode) {
        const { buildToUnicode } = cmapToUnicode;
        /**
         * @param {Map<number, string>} gidToUnicode
         * @param {object} [opts]
         * @returns {string} PDF ToUnicode CMap stream content
         */
        function embedBuildToUnicode(gidToUnicode, opts) {
            return buildToUnicode(gidToUnicode, opts);
        }
        return { embedBuildToUnicode };
    }
};
