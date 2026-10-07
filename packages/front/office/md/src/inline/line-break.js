// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Inline line breaks — hard / soft + plain text fallback.
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/line-break
 */

import { mdInlineHelpers } from './helpers.js';
import { mdInlineRegex } from './regex.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';

export const mdInlineLineBreak = {
    name: 'mdInlineLineBreak',
    dependencies: ['mdInlineHelpers', 'mdInlineRegex', 'mdNode', 'mdAstTypes'],
    deps: [mdInlineHelpers, mdInlineRegex, mdNode, mdAstTypes],
    factory(helpers, regex, nodeApi, astTypes) {
        const { makeText } = helpers;
        const { reFinalSpace, reInitialSpace, reMain } = regex;
        const { Node } = nodeApi;
        const { T_TEXT, T_SOFTBREAK, T_LINEBREAK } = astTypes;

        function installLineBreak(ip) {
            ip.parseNewline = function(block) {
                this.pos += 1;
                const lastc = block.lastChild;
                if (lastc && lastc.type === T_TEXT &&
                    lastc.literal[lastc.literal.length - 1] === ' ') {
                    const hardbreak = lastc.literal[lastc.literal.length - 2] === ' ';
                    lastc.literal = lastc.literal.replace(reFinalSpace, '');
                    block.appendChild(new Node(hardbreak ? T_LINEBREAK : T_SOFTBREAK));
                } else {
                    block.appendChild(new Node(T_SOFTBREAK));
                }
                this.match(reInitialSpace);
                return true;
            };

            ip.parseString = function(block) {
                const m = this.match(reMain);
                if (m === null) return false;
                block.appendChild(makeText(m));
                return true;
            };
        }

        return { installLineBreak };
    }
};
