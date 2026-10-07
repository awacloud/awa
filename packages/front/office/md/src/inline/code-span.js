// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Inline code span parser — `` ` `` runs.
 *
 * Installs `parseBackticks(block)` on the parser cursor `ip`.
 *
 * Strict factory-only. The factory body captures none of the top-level
 * descriptor imports (they feed the generated `deps:` field).
 *
 * @module md/inline/code-span
 */

import { mdInlineHelpers } from './helpers.js';
import { mdInlineRegex } from './regex.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';

export const mdInlineCodeSpan = {
    name: 'mdInlineCodeSpan',
    dependencies: ['mdInlineHelpers', 'mdInlineRegex', 'mdNode', 'mdAstTypes'],
    deps: [mdInlineHelpers, mdInlineRegex, mdNode, mdAstTypes],
    factory(helpers, regex, nodeApi, astTypes) {
        const { makeText } = helpers;
        const { reTicks, reTicksHere } = regex;
        const { Node } = nodeApi;
        const { T_CODE } = astTypes;

        function installCodeSpan(ip) {
            ip.parseBackticks = function(block) {
                const ticks = this.match(reTicksHere);
                if (ticks === null) return false;
                const afterOpenTicks = this.pos;
                let matched;
                while ((matched = this.match(reTicks)) !== null) {
                    if (matched === ticks) {
                        const node = new Node(T_CODE);
                        let contents = this.subject
                            .slice(afterOpenTicks, this.pos - ticks.length)
                            .replace(/\n/gm, ' ');
                        if (contents.length > 0 &&
                            contents.match(/[^ ]/) !== null &&
                            contents[0] === ' ' &&
                            contents[contents.length - 1] === ' ') {
                            node.literal = contents.slice(1, contents.length - 1);
                        } else {
                            node.literal = contents;
                        }
                        block.appendChild(node);
                        return true;
                    }
                }
                this.pos = afterOpenTicks;
                block.appendChild(makeText(ticks));
                return true;
            };
        }

        return { installCodeSpan };
    }
};
