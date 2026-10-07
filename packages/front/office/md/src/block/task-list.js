// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GFM task list items — post-block-phase detection pass.
 *
 * After block parsing, every list item whose first child paragraph
 * begins with `[ ]`, `[x]` or `[X]` followed by whitespace gets its
 * `checked` slot set and the marker stripped from the paragraph
 * content.
 *
 * Exposed as the `mdBlockTaskList` factory descriptor. Module-level
 * named exports are materialised once for direct importers.
 *
 * @module md/block/task-list
 */

import { mdAstTypes } from '../ast/types.js';

export const mdBlockTaskList = {
    name: 'mdBlockTaskList',
    dependencies: ['mdAstTypes'],
    deps: [mdAstTypes],
    factory(astTypes) {
        const { T_ITEM, T_PARAGRAPH } = astTypes;

        /** Walk the document and tag task-list items in-place. */
        function detectTaskLists(doc) {
            const walker = doc.walker();
            let event;
            const items = [];
            while ((event = walker.next())) {
                if (event.entering && event.node.type === T_ITEM) items.push(event.node);
            }
            for (const item of items) {
                const firstChild = item.firstChild;
                if (!firstChild || firstChild.type !== T_PARAGRAPH) continue;
                const sc = firstChild.stringContent;
                if (!sc) continue;
                const m = sc.match(/^\[([ xX])\][ \t]+/);
                if (!m) continue;
                item.checked = m[1] !== ' ';
                firstChild.stringContent = sc.slice(m[0].length);
            }
        }

        return { detectTaskLists };
    }
};
