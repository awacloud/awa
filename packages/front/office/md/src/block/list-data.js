// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview List-marker parsing + list-data ↔ Node bridging.
 *
 * Extracted from the block parser. `parseListMarker` mutates the parser
 * cursor (advances offset / column) as a side effect — semantics
 * preserved verbatim.
 *
 * Exposed as the `mdBlockListData` factory descriptor. Module-level
 * named exports are materialised once for direct importers.
 *
 * @module md/block/list-data
 */

import { mdAstTypes } from '../ast/types.js';

export const mdBlockListData = {
    name: 'mdBlockListData',
    dependencies: ['mdAstTypes'],
    deps: [mdAstTypes],
    factory(astTypes) {
        const { T_PARAGRAPH } = astTypes;

        const C_TAB   = 9;
        const C_SPACE = 32;

        const reBulletListMarker  = /^[*+-]/;
        const reOrderedListMarker = /^(\d{1,9})([.)])/;
        const reNonSpace          = /[^ \t\f\v\r\n]/;

        function isSpaceOrTab(c) { return c === C_SPACE || c === C_TAB; }
        function peek(ln, pos) { return pos < ln.length ? ln.charCodeAt(pos) : -1; }

        /**
         * Try to match a list marker at the current parser position.
         * On success advances `parser.offset` past the marker + indent and
         * returns the list data object; on failure returns null.
         */
        function parseListMarker(parser, container) {
            const rest = parser.currentLine.slice(parser.nextNonspace);
            let match;
            let nextc;
            const data = {
                type:         null,
                tight:        true,
                bulletChar:   null,
                start:        null,
                delimiter:    null,
                padding:      null,
                markerOffset: parser.indent
            };
            if (parser.indent >= 4) return null;
            if ((match = rest.match(reBulletListMarker))) {
                data.type = 'bullet';
                data.bulletChar = match[0][0];
            } else if (
                (match = rest.match(reOrderedListMarker)) &&
                (container.type !== T_PARAGRAPH || match[1] == 1)
            ) {
                data.type = 'ordered';
                data.start = parseInt(match[1], 10);
                data.delimiter = match[2];
            } else {
                return null;
            }
            nextc = peek(parser.currentLine, parser.nextNonspace + match[0].length);
            if (!(nextc === -1 || nextc === C_TAB || nextc === C_SPACE)) return null;
            if (
                container.type === T_PARAGRAPH &&
                !parser.currentLine
                    .slice(parser.nextNonspace + match[0].length)
                    .match(reNonSpace)
            ) {
                return null;
            }

            parser.advanceNextNonspace();
            parser.advanceOffset(match[0].length, true);
            const spacesStartCol    = parser.column;
            const spacesStartOffset = parser.offset;
            do {
                parser.advanceOffset(1, true);
                nextc = peek(parser.currentLine, parser.offset);
            } while (parser.column - spacesStartCol < 5 && isSpaceOrTab(nextc));
            const blank_item          = peek(parser.currentLine, parser.offset) === -1;
            const spaces_after_marker = parser.column - spacesStartCol;
            if (spaces_after_marker >= 5 || spaces_after_marker < 1 || blank_item) {
                data.padding = match[0].length + 1;
                parser.column = spacesStartCol;
                parser.offset = spacesStartOffset;
                if (isSpaceOrTab(peek(parser.currentLine, parser.offset))) {
                    parser.advanceOffset(1, true);
                }
            } else {
                data.padding = match[0].length + spaces_after_marker;
            }
            return data;
        }

        /** True iff two list-data shapes describe the same list. */
        function listsMatch(list_data, item_data) {
            return list_data.type === item_data.type &&
                list_data.delimiter === item_data.delimiter &&
                list_data.bulletChar === item_data.bulletChar;
        }

        /** Copy list-data slots onto a Node (in place). */
        function applyListData(node, d) {
            node.listType         = d.type;
            node.listStart        = d.start;
            node.listTight        = d.tight;
            node.listDelimiter    = d.delimiter;
            node.listBulletChar   = d.bulletChar;
            node.listPadding      = d.padding;
            node.listMarkerOffset = d.markerOffset;
        }

        /** Extract list-data slots from a Node into a fresh data object. */
        function listDataFromNode(node) {
            return {
                type:         node.listType,
                start:        node.listStart,
                tight:        node.listTight,
                delimiter:    node.listDelimiter,
                bulletChar:   node.listBulletChar,
                padding:      node.listPadding,
                markerOffset: node.listMarkerOffset
            };
        }

        return { parseListMarker, listsMatch, applyListData, listDataFromNode };
    }
};
