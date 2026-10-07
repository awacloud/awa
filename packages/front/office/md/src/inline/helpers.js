// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tiny inline-parser helpers — text node factory,
 * code-point coercion, reference label normalization, ASCII trim.
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/helpers
 */

import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';

export const mdInlineHelpers = {
    name: 'mdInlineHelpers',
    dependencies: ['mdNode', 'mdAstTypes'],
    deps: [mdNode, mdAstTypes],
    factory(nodeApi, astTypes) {
        const { Node } = nodeApi;
        const { T_TEXT } = astTypes;
        /** Build a text node carrying the given literal. */
        function makeText(s) {
            const n = new Node(T_TEXT);
            n.literal = s;
            return n;
        }

        /** Safe `String.fromCodePoint` with U+FFFD fallback. */
        function fromCodePoint(cp) {
            try { return String.fromCodePoint(cp); }
            catch { return '�'; }
        }

        /**
         * Normalize a reference label per CommonMark §4.7.
         */
        function normalizeReference(str) {
            return str
                .slice(1, str.length - 1)
                .trim()
                .replace(/[ \t\r\n]+/g, ' ')
                .toLowerCase()
                .toUpperCase();
        }

        /** True if the code unit is ASCII space, tab, LF or CR. */
        function isSpace(c) {
            return c === 0x20 || c === 9 || c === 0xa || c === 0xd;
        }

        /** Trim ASCII space / tab / LF / CR from both ends. */
        function trim(str) {
            let start = 0;
            for (; start < str.length; start++) {
                if (!isSpace(str.charCodeAt(start))) break;
            }
            let end = str.length - 1;
            for (; end >= start; end--) {
                if (!isSpace(str.charCodeAt(end))) break;
            }
            return str.slice(start, end + 1);
        }

        return { makeText, fromCodePoint, normalizeReference, trim, isSpace };
    }
};
