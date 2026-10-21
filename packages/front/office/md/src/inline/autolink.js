// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CommonMark autolinks — `<scheme:rest>` and `<user@host>`.
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/autolink
 */

import { mdInlineHelpers } from './helpers.js';
import { mdInlineRegex } from './regex.js';
import { mdCommon } from '../common.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';

export const mdInlineAutolink = {
    name: 'mdInlineAutolink',
    dependencies: ['mdInlineHelpers', 'mdInlineRegex', 'mdCommon', 'mdNode', 'mdAstTypes'],
    deps: [mdInlineHelpers, mdInlineRegex, mdCommon, mdNode, mdAstTypes],
    factory(helpers, regex, common, nodeApi, astTypes) {
        const { makeText } = helpers;
        const { reEmailAutolink, reAutolink } = regex;
        const { normalizeURI, reHtmlTag } = common;
        const { Node } = nodeApi;
        const { T_LINK, T_HTML_INLINE } = astTypes;

        function installAutolink(ip) {
            ip.parseAutolink = function(block) {
                let m, dest, node;
                if ((m = this.match(reEmailAutolink))) {
                    dest = m.slice(1, m.length - 1);
                    node = new Node(T_LINK);
                    node.destination = normalizeURI('mailto:' + dest);
                    node.title = '';
                    node.appendChild(makeText(dest));
                    block.appendChild(node);
                    return true;
                } else if ((m = this.match(reAutolink))) {
                    dest = m.slice(1, m.length - 1);
                    node = new Node(T_LINK);
                    node.destination = normalizeURI(dest);
                    node.title = '';
                    node.appendChild(makeText(dest));
                    block.appendChild(node);
                    return true;
                }
                return false;
            };

            ip.parseHtmlTag = function(block) {
                // A comment, processing instruction, CDATA section or
                // declaration needs its end sequence further on; without one
                // no alternative of `reHtmlTag` can match, so skip the regex,
                // whose lazy scan would run to the end of the subject.
                const end = requiredEnd(this.subject, this.pos);
                if (end !== null && !this.hasAhead(end[0], end[1])) return false;
                const m = this.match(reHtmlTag);
                if (m === null) return false;
                const node = new Node(T_HTML_INLINE);
                node.literal = m;
                block.appendChild(node);
                return true;
            };

            /**
             * Whether `token` occurs at or after `from` in the subject. The
             * last search per token is kept (reset with each subject), so
             * the repeated queries of one subject cost one scan in all.
             */
            ip.hasAhead = function(token, from) {
                if (this._htmlEnds === null || this._htmlEnds === undefined) this._htmlEnds = {};
                let c = this._htmlEnds[token];
                if (c === undefined || from < c.from || (c.at !== -1 && c.at < from)) {
                    c = { from, at: this.subject.indexOf(token, from) };
                    this._htmlEnds[token] = c;
                }
                return c.at !== -1;
            };
        }

        /**
         * The end sequence an inline HTML construct opening at `pos` needs,
         * and the first index it may start at; `null` for an open or
         * closing tag (no far scan).
         */
        function requiredEnd(subject, pos) {
            if (subject.startsWith('<!--', pos)) return ['-->', pos + 2];
            if (subject.startsWith('<?', pos)) return ['?>', pos + 2];
            if (subject.startsWith('<![CDATA[', pos)) return [']]>', pos + 9];
            if (subject.charCodeAt(pos + 1) === 33 /* ! */ && /[A-Za-z]/.test(subject.charAt(pos + 2))) return ['>', pos + 3];
            return null;
        }

        return { installAutolink };
    }
};
