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
        const { T_TEXT, T_MATH_INLINE, T_MATH_BLOCK } = astTypes;
        /** Build a text node carrying the given literal. */
        function makeText(s) {
            const n = new Node(T_TEXT);
            n.literal = s;
            return n;
        }

        /** Build a `math_inline` (or, `display`, `math_block`) node. */
        function makeMath(s, display) {
            const n = new Node(display ? T_MATH_BLOCK : T_MATH_INLINE);
            n.literal = s;
            return n;
        }

        /**
         * End (index after the closing run) of a `$…$` / `$$…$$` math span
         * opening at `p` in `s`, or `-1` — the rules of `mdMath.splitMath`,
         * on one line: `$$` closes at the next `$$`; a single `$` at the
         * next `$` not escaped by a backslash, with at least one character
         * between.
         */
        function mathSpanEnd(s, p) {
            if (s.charCodeAt(p + 1) === 0x24) {
                const end = s.indexOf('$$', p + 2);
                const nl = s.indexOf('\n', p + 2);
                return end >= 0 && (nl < 0 || end < nl) ? end + 2 : -1;
            }
            for (let j = p + 1; j < s.length; j++) {
                const c = s.charCodeAt(j);
                if (c === 0x0A) return -1;
                if (c === 0x5C) { j++; continue; }
                if (c === 0x24) return j > p + 1 ? j + 1 : -1;
            }
            return -1;
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

        return { makeText, makeMath, mathSpanEnd, fromCodePoint, normalizeReference, trim, isSpace };
    }
};
