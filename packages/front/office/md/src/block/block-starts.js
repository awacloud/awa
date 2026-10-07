// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Block-start matcher functions.
 *
 * Each entry in `blockStarts` is a `(parser, container) => number`
 * function. Return values :
 *   0 = no match
 *   1 = matched container, keep going
 *   2 = matched leaf, no more block starts
 *
 * Tried in order on every non-blank line; the first non-zero result
 * wins.
 *
 * Exposed as the `mdBlockStarts` factory descriptor. Module-level
 * named exports are materialised once for direct importers.
 *
 * @module md/block/block-starts
 */

import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';
import { mdBlockHtmlPatterns } from './html-patterns.js';
import { mdBlockLinkRef } from './link-ref.js';
import { mdBlockListData } from './list-data.js';

export const mdBlockStarts = {
    name: 'mdBlockStarts',
    dependencies: [
        'mdNode', 'mdAstTypes',
        'mdBlockHtmlPatterns', 'mdBlockLinkRef', 'mdBlockListData'
    ],
    deps: [mdNode, mdAstTypes, mdBlockHtmlPatterns, mdBlockLinkRef, mdBlockListData],
    factory(nodeMod, astTypes, htmlPatterns, blockLinkRef, blockListData) {
        const { Node } = nodeMod;
        const {
            T_PARAGRAPH, T_HEADING, T_THEMATIC_BREAK,
            T_CODE_BLOCK, T_HTML_BLOCK, T_BLOCK_QUOTE, T_LIST, T_ITEM
        } = astTypes;
        const { reHtmlBlockOpen } = htmlPatterns;
        const { parseReference } = blockLinkRef;
        const {
            parseListMarker, listsMatch, applyListData, listDataFromNode
        } = blockListData;

        const CODE_INDENT    = 4;
        const C_TAB          = 9;
        const C_SPACE        = 32;
        const C_GREATERTHAN  = 62;
        const C_LESSTHAN     = 60;
        const C_OPEN_BRACKET = 91;

        const reThematicBreak     = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
        const reATXHeadingMarker  = /^#{1,6}(?:[ \t]+|$)/;
        const reCodeFence         = /^`{3,}(?!.*`)|^~{3,}/;
        const reSetextHeadingLine = /^(?:=+|-+)[ \t]*$/;

        function isSpaceOrTab(c) { return c === C_SPACE || c === C_TAB; }
        function peek(ln, pos) { return pos < ln.length ? ln.charCodeAt(pos) : -1; }

        const blockStarts = [
            // block quote
            function(parser) {
                if (
                    !parser.indented &&
                    peek(parser.currentLine, parser.nextNonspace) === C_GREATERTHAN
                ) {
                    parser.advanceNextNonspace();
                    parser.advanceOffset(1, false);
                    if (isSpaceOrTab(peek(parser.currentLine, parser.offset))) {
                        parser.advanceOffset(1, true);
                    }
                    parser.closeUnmatchedBlocks();
                    parser.addChild(T_BLOCK_QUOTE, parser.nextNonspace);
                    return 1;
                }
                return 0;
            },

            // ATX heading
            function(parser) {
                let match;
                if (
                    !parser.indented &&
                    (match = parser.currentLine
                        .slice(parser.nextNonspace)
                        .match(reATXHeadingMarker))
                ) {
                    parser.advanceNextNonspace();
                    parser.advanceOffset(match[0].length, false);
                    parser.closeUnmatchedBlocks();
                    const container = parser.addChild(T_HEADING, parser.nextNonspace);
                    container.level = match[0].trim().length;
                    container.stringContent = parser.currentLine
                        .slice(parser.offset)
                        .replace(/^[ \t]*#+[ \t]*$/, '')
                        .replace(/[ \t]+#+[ \t]*$/, '');
                    parser.advanceOffset(parser.currentLine.length - parser.offset);
                    return 2;
                }
                return 0;
            },

            // Fenced code block
            function(parser) {
                let match;
                if (
                    !parser.indented &&
                    (match = parser.currentLine
                        .slice(parser.nextNonspace)
                        .match(reCodeFence))
                ) {
                    const fenceLength = match[0].length;
                    parser.closeUnmatchedBlocks();
                    const container = parser.addChild(T_CODE_BLOCK, parser.nextNonspace);
                    container.isFenced    = true;
                    container.fenceLength = fenceLength;
                    container.fenceChar   = match[0][0];
                    container.fenceOffset = parser.indent;
                    parser.advanceNextNonspace();
                    parser.advanceOffset(fenceLength, false);
                    return 2;
                }
                return 0;
            },

            // HTML block
            function(parser, container) {
                if (
                    !parser.indented &&
                    peek(parser.currentLine, parser.nextNonspace) === C_LESSTHAN
                ) {
                    const s = parser.currentLine.slice(parser.nextNonspace);
                    for (let blockType = 1; blockType <= 7; blockType++) {
                        if (
                            reHtmlBlockOpen[blockType].test(s) &&
                            (blockType < 7 || (container.type !== T_PARAGRAPH &&
                             !(!parser.allClosed && !parser.blank &&
                               parser.tip.type === T_PARAGRAPH)))
                        ) {
                            parser.closeUnmatchedBlocks();
                            const b = parser.addChild(T_HTML_BLOCK, parser.offset);
                            b.htmlBlockType = blockType;
                            return 2;
                        }
                    }
                }
                return 0;
            },

            // Setext heading
            function(parser, container) {
                let match;
                if (
                    !parser.indented &&
                    container.type === T_PARAGRAPH &&
                    (match = parser.currentLine
                        .slice(parser.nextNonspace)
                        .match(reSetextHeadingLine))
                ) {
                    parser.closeUnmatchedBlocks();
                    let pos;
                    while (
                        peek(container.stringContent, 0) === C_OPEN_BRACKET &&
                        (pos = parseReference(container.stringContent, parser.refmap))
                    ) {
                        container.stringContent = container.stringContent.slice(pos);
                    }
                    if (container.stringContent.length > 0) {
                        const heading = new Node(T_HEADING, container.sourcepos);
                        heading.level = match[0][0] === '=' ? 1 : 2;
                        heading.stringContent = container.stringContent;
                        container.insertAfter(heading);
                        container.unlink();
                        parser.tip = heading;
                        parser.advanceOffset(parser.currentLine.length - parser.offset, false);
                        return 2;
                    }
                    return 0;
                }
                return 0;
            },

            // Thematic break
            function(parser) {
                if (
                    !parser.indented &&
                    reThematicBreak.test(parser.currentLine.slice(parser.nextNonspace))
                ) {
                    parser.closeUnmatchedBlocks();
                    parser.addChild(T_THEMATIC_BREAK, parser.nextNonspace);
                    parser.advanceOffset(parser.currentLine.length - parser.offset, false);
                    return 2;
                }
                return 0;
            },

            // List item
            function(parser, container) {
                let data;
                if (
                    (!parser.indented || container.type === T_LIST) &&
                    (data = parseListMarker(parser, container))
                ) {
                    parser.closeUnmatchedBlocks();

                    if (
                        parser.tip.type !== T_LIST ||
                        !listsMatch(listDataFromNode(container), data)
                    ) {
                        container = parser.addChild(T_LIST, parser.nextNonspace);
                        applyListData(container, data);
                    }

                    container = parser.addChild(T_ITEM, parser.nextNonspace);
                    applyListData(container, data);
                    return 1;
                }
                return 0;
            },

            // Indented code block
            function(parser) {
                if (
                    parser.indented &&
                    parser.tip.type !== T_PARAGRAPH &&
                    !parser.blank
                ) {
                    parser.advanceOffset(CODE_INDENT, true);
                    parser.closeUnmatchedBlocks();
                    parser.addChild(T_CODE_BLOCK, parser.offset);
                    return 2;
                }
                return 0;
            }
        ];

        return { blockStarts };
    }
};
