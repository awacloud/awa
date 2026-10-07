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
                const m = this.match(reHtmlTag);
                if (m === null) return false;
                const node = new Node(T_HTML_INLINE);
                node.literal = m;
                block.appendChild(node);
                return true;
            };
        }

        return { installAutolink };
    }
};
