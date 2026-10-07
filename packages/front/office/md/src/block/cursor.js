// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parser cursor advancement + line incorporation.
 *
 * These functions are designed to be bound onto the parser instance
 * as methods (they all use `this`). They handle :
 *
 *   - `findNextNonspace` — scan forward over space/tab
 *   - `advanceOffset` / `advanceNextNonspace` — move the cursor
 *   - `addLine` / `addChild` — mutation of the tree under construction
 *   - `closeUnmatchedBlocks` — close blocks that didn't continue
 *   - `incorporateLine` — process one input line through the state machine
 *   - `finalize` — close a block + run its finalizer
 *
 * Exposed as the `mdBlockCursor` factory descriptor. Module-level
 * named exports are materialised once for direct importers.
 *
 * @module md/block/cursor
 */

import { mdErrors } from '../errors.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';
import { mdBlockHtmlPatterns } from './html-patterns.js';

export const mdBlockCursor = {
    name: 'mdBlockCursor',
    dependencies: ['mdErrors', 'mdNode', 'mdAstTypes', 'mdBlockHtmlPatterns'],
    deps: [mdErrors, mdNode, mdAstTypes, mdBlockHtmlPatterns],
    factory(errors, nodeMod, astTypes, htmlPatterns) {
        const { ContractError } = errors;
        const { Node } = nodeMod;
        const { T_PARAGRAPH, T_HTML_BLOCK } = astTypes;
        const { reHtmlBlockClose } = htmlPatterns;

        const CODE_INDENT = 4;

        const reMaybeSpecial = /^[#`~*+_=<>0-9-]/;

        function advanceOffset(count, columns) {
            const currentLine = this.currentLine;
            let charsToTab, charsToAdvance, c;
            while (count > 0 && (c = currentLine[this.offset])) {
                if (c === '\t') {
                    charsToTab = 4 - (this.column % 4);
                    if (columns) {
                        this.partiallyConsumedTab = charsToTab > count;
                        charsToAdvance = charsToTab > count ? count : charsToTab;
                        this.column += charsToAdvance;
                        this.offset += this.partiallyConsumedTab ? 0 : 1;
                        count -= charsToAdvance;
                    } else {
                        this.partiallyConsumedTab = false;
                        this.column += charsToTab;
                        this.offset += 1;
                        count -= 1;
                    }
                } else {
                    this.partiallyConsumedTab = false;
                    this.offset += 1;
                    this.column += 1;
                    count -= 1;
                }
            }
        }

        function advanceNextNonspace() {
            this.offset = this.nextNonspace;
            this.column = this.nextNonspaceColumn;
            this.partiallyConsumedTab = false;
        }

        function findNextNonspace() {
            const currentLine = this.currentLine;
            let i = this.offset;
            let cols = this.column;
            let c;
            while ((c = currentLine.charAt(i)) !== '') {
                if (c === ' ') {
                    i++; cols++;
                } else if (c === '\t') {
                    i++; cols += 4 - (cols % 4);
                } else {
                    break;
                }
            }
            this.blank = c === '\n' || c === '\r' || c === '';
            this.nextNonspace       = i;
            this.nextNonspaceColumn = cols;
            this.indent   = this.nextNonspaceColumn - this.column;
            this.indented = this.indent >= CODE_INDENT;
        }

        function addLine() {
            if (this.partiallyConsumedTab) {
                this.offset += 1;
                const charsToTab = 4 - (this.column % 4);
                this.tip.stringContent += ' '.repeat(charsToTab);
            }
            this.tip.stringContent += this.currentLine.slice(this.offset) + '\n';
        }

        function addChild(tag, offset) {
            while (!this.blocks[this.tip.type].canContain(tag)) {
                this.finalize(this.tip, this.lineNumber - 1);
            }
            const column_number = offset + 1;
            const newBlock = new Node(tag, [
                [this.lineNumber, column_number],
                [0, 0]
            ]);
            newBlock.stringContent = '';
            this.tip.appendChild(newBlock);
            this.tip = newBlock;
            return newBlock;
        }

        function closeUnmatchedBlocks() {
            if (!this.allClosed) {
                while (this.oldtip !== this.lastMatchedContainer) {
                    const parent = this.oldtip.parent;
                    this.finalize(this.oldtip, this.lineNumber - 1);
                    this.oldtip = parent;
                }
                this.allClosed = true;
            }
        }

        function incorporateLine(ln) {
            let all_matched = true;
            let container   = this.doc;
            this.oldtip                = this.tip;
            this.offset                = 0;
            this.column                = 0;
            this.blank                 = false;
            this.partiallyConsumedTab  = false;
            this.lineNumber           += 1;

            if (ln.indexOf(' ') !== -1) ln = ln.replace(/\0/g, '�');
            this.currentLine = ln;

            let lastChild;
            while ((lastChild = container.lastChild) && lastChild.open) {
                container = lastChild;
                this.findNextNonspace();
                switch (this.blocks[container.type].continue(this, container)) {
                    case 0: break;
                    case 1: all_matched = false; break;
                    case 2: return;
                    default: throw new ContractError(
                        'md/parse-error', 'continue returned illegal value');
                }
                if (!all_matched) {
                    container = container.parent;
                    break;
                }
            }

            this.allClosed           = container === this.oldtip;
            this.lastMatchedContainer = container;

            let matchedLeaf =
                container.type !== T_PARAGRAPH && this.blocks[container.type].acceptsLines;
            const starts    = this.blockStarts;
            const startsLen = starts.length;
            while (!matchedLeaf) {
                this.findNextNonspace();

                if (!this.indented && !reMaybeSpecial.test(ln.slice(this.nextNonspace))) {
                    this.advanceNextNonspace();
                    break;
                }
                let i = 0;
                while (i < startsLen) {
                    const res = starts[i](this, container);
                    if (res === 1) {
                        container = this.tip;
                        break;
                    } else if (res === 2) {
                        container = this.tip;
                        matchedLeaf = true;
                        break;
                    } else {
                        i++;
                    }
                }
                if (i === startsLen) {
                    this.advanceNextNonspace();
                    break;
                }
            }

            if (!this.allClosed && !this.blank && this.tip.type === T_PARAGRAPH) {
                this.addLine();
            } else {
                this.closeUnmatchedBlocks();
                const t = container.type;
                if (this.blocks[t].acceptsLines) {
                    this.addLine();
                    if (
                        t === T_HTML_BLOCK &&
                        container.htmlBlockType >= 1 &&
                        container.htmlBlockType <= 5 &&
                        reHtmlBlockClose[container.htmlBlockType].test(
                            this.currentLine.slice(this.offset))
                    ) {
                        this.lastLineLength = ln.length;
                        this.finalize(container, this.lineNumber);
                    }
                } else if (this.offset < ln.length && !this.blank) {
                    this.addChild(T_PARAGRAPH, this.offset);
                    this.advanceNextNonspace();
                    this.addLine();
                }
            }
            this.lastLineLength = ln.length;
        }

        function finalize(block, lineNumber) {
            const above = block.parent;
            block.open = false;
            block.sourcepos[1] = [lineNumber, this.lastLineLength];
            this.blocks[block.type].finalize(this, block);
            this.tip = above;
        }

        return {
            advanceOffset, advanceNextNonspace, findNextNonspace,
            addLine, addChild, closeUnmatchedBlocks, incorporateLine, finalize
        };
    }
};
