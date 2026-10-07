// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Block-type method table.
 *
 * For every container/leaf block type the parser knows, this table
 * supplies four hooks :
 *   - `continue(parser, container)` — code 0 (matched), 1 (no match),
 *     2 (consumed line entirely)
 *   - `finalize(parser, block)` — called when the block closes
 *   - `canContain(type)` — true if this block can contain a child
 *     of the given type
 *   - `acceptsLines` — true for leaf blocks that swallow raw lines
 *
 * Exposed as the `mdBlockTypes` factory descriptor. Module-level
 * named exports are materialised once for direct importers.
 *
 * @module md/block/block-types
 */

import { mdAstTypes } from '../ast/types.js';
import { mdBlockLinkRef } from './link-ref.js';
import { mdCommon } from '../common.js';

export const mdBlockTypes = {
    name: 'mdBlockTypes',
    dependencies: ['mdAstTypes', 'mdBlockLinkRef', 'mdCommon'],
    deps: [mdAstTypes, mdBlockLinkRef, mdCommon],
    factory(astTypes, blockLinkRef, common) {
        const { T_ITEM } = astTypes;
        const { removeLinkReferenceDefinitions } = blockLinkRef;
        const { unescapeString } = common;

        const CODE_INDENT   = 4;
        const C_TAB         = 9;
        const C_SPACE       = 32;
        const C_GREATERTHAN = 62;

        const reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;

        function isSpaceOrTab(c) { return c === C_SPACE || c === C_TAB; }
        function peek(ln, pos) { return pos < ln.length ? ln.charCodeAt(pos) : -1; }

        function endsWithBlankLine(block) {
            return block.next &&
                block.sourcepos[1][0] !== block.next.sourcepos[0][0] - 1;
        }

        const blocks = {
            document: {
                continue() { return 0; },
                finalize(parser, block) { removeLinkReferenceDefinitions(parser, block); },
                canContain(t) { return t !== T_ITEM; },
                acceptsLines: false
            },
            list: {
                continue() { return 0; },
                finalize(parser, block) {
                    let item = block.firstChild;
                    while (item) {
                        if (item.next && endsWithBlankLine(item)) {
                            block.listTight = false;
                            break;
                        }
                        let subitem = item.firstChild;
                        while (subitem) {
                            if (subitem.next && endsWithBlankLine(subitem)) {
                                block.listTight = false;
                                break;
                            }
                            subitem = subitem.next;
                        }
                        item = item.next;
                    }
                    if (block.lastChild) {
                        block.sourcepos[1] = block.lastChild.sourcepos[1];
                    }
                },
                canContain(t) { return t === T_ITEM; },
                acceptsLines: false
            },
            block_quote: {
                continue(parser) {
                    const ln = parser.currentLine;
                    if (!parser.indented && peek(ln, parser.nextNonspace) === C_GREATERTHAN) {
                        parser.advanceNextNonspace();
                        parser.advanceOffset(1, false);
                        if (isSpaceOrTab(peek(ln, parser.offset))) {
                            parser.advanceOffset(1, true);
                        }
                    } else {
                        return 1;
                    }
                    return 0;
                },
                finalize() {},
                canContain(t) { return t !== T_ITEM; },
                acceptsLines: false
            },
            item: {
                continue(parser, container) {
                    if (parser.blank) {
                        if (container.firstChild == null) return 1;
                        parser.advanceNextNonspace();
                    } else if (
                        parser.indent >= container.listMarkerOffset + container.listPadding
                    ) {
                        parser.advanceOffset(
                            container.listMarkerOffset + container.listPadding,
                            true
                        );
                    } else {
                        return 1;
                    }
                    return 0;
                },
                finalize(parser, block) {
                    if (block.lastChild) {
                        block.sourcepos[1] = block.lastChild.sourcepos[1];
                    } else {
                        block.sourcepos[1][0] = block.sourcepos[0][0];
                        block.sourcepos[1][1] = block.listMarkerOffset + block.listPadding;
                    }
                },
                canContain(t) { return t !== T_ITEM; },
                acceptsLines: false
            },
            heading: {
                continue() { return 1; },
                finalize() {},
                canContain() { return false; },
                acceptsLines: false
            },
            thematic_break: {
                continue() { return 1; },
                finalize() {},
                canContain() { return false; },
                acceptsLines: false
            },
            code_block: {
                continue(parser, container) {
                    const ln = parser.currentLine;
                    const indent = parser.indent;
                    if (container.isFenced) {
                        const match =
                            indent <= 3 &&
                            ln.charAt(parser.nextNonspace) === container.fenceChar &&
                            ln.slice(parser.nextNonspace).match(reClosingCodeFence);
                        if (match && match[0].length >= container.fenceLength) {
                            parser.lastLineLength = parser.offset + indent + match[0].length;
                            parser.finalize(container, parser.lineNumber);
                            return 2;
                        }
                        let i = container.fenceOffset;
                        while (i > 0 && isSpaceOrTab(peek(ln, parser.offset))) {
                            parser.advanceOffset(1, true);
                            i--;
                        }
                    } else {
                        if (indent >= CODE_INDENT) {
                            parser.advanceOffset(CODE_INDENT, true);
                        } else if (parser.blank) {
                            parser.advanceNextNonspace();
                        } else {
                            return 1;
                        }
                    }
                    return 0;
                },
                finalize(parser, block) {
                    if (block.isFenced) {
                        const content = block.stringContent;
                        const newlinePos = content.indexOf('\n');
                        const firstLine  = content.slice(0, newlinePos);
                        const rest       = content.slice(newlinePos + 1);
                        block.info    = unescapeString(firstLine.trim());
                        block.literal = rest;
                    } else {
                        const lines = block.stringContent.split('\n');
                        while (/^[ \t]*$/.test(lines[lines.length - 1])) lines.pop();
                        block.literal = lines.join('\n') + '\n';
                        block.sourcepos[1][0] = block.sourcepos[0][0] + lines.length - 1;
                        block.sourcepos[1][1] =
                            block.sourcepos[0][1] + lines[lines.length - 1].length - 1;
                    }
                    block.stringContent = null;
                },
                canContain() { return false; },
                acceptsLines: true
            },
            html_block: {
                continue(parser, container) {
                    return parser.blank &&
                        (container.htmlBlockType === 6 || container.htmlBlockType === 7)
                        ? 1 : 0;
                },
                finalize(parser, block) {
                    block.literal = block.stringContent.replace(/\n$/, '');
                    block.stringContent = null;
                },
                canContain() { return false; },
                acceptsLines: true
            },
            paragraph: {
                continue(parser) { return parser.blank ? 1 : 0; },
                finalize() {},
                canContain() { return false; },
                acceptsLines: true
            }
        };

        return { blocks };
    }
};
