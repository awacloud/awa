// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CommonMark 0.31 block-phase parser (orchestrator).
 *
 * Ported from the reference implementation `commonmark.js` (BSD-2)
 * — `lib/blocks.js` — adapted to use our `Node` class (public,
 * unprefixed slot names) and our `linkRefs` helpers.
 *
 * Logic is split across sibling sub-modules — all now exposed as
 * factory descriptors and consumed via declared dependencies on this
 * orchestrator :
 *   - `mdBlockHtmlPatterns`  — HTML tag regex + opener / closer patterns
 *   - `mdBlockLinkRef`       — link reference definition parser
 *   - `mdBlockTable`         — GFM tables post-pass
 *   - `mdBlockTaskList`      — GFM task list items post-pass
 *   - `mdBlockListData`      — list-marker parsing + data ↔ Node bridging
 *   - `mdBlockTypes`         — block-type method table (`blocks`)
 *   - `mdBlockStarts`        — block-start matcher functions (`blockStarts`)
 *   - `mdBlockCursor`        — cursor / line-incorporation state machine
 *
 * Exports the `blockParser` factory :
 *     blockParser.factory().parse(text)
 *         -> { document: Node, refmap: Object<string, {destination,title}> }
 *
 * @module md/block/parser
 */

/**
 * Module factory — exposes the block parser as `{ parse }`.
 *
 * Worker-safe : **full**. The orchestrator declares its full sub-module
 * graph as factory dependencies (8 sibling block sub-modules + ast +
 * refs + errors). Every dependency is itself a factory descriptor whose
 * body is self-contained, so the entire closure can be serialised to a
 * Worker via `factory.toString()` traversal.
 */
import { mdErrors } from '../errors.js';
import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';
import { refsLinkRefs } from '../refs/linkRefs.js';
import { mdBlockHtmlPatterns } from './html-patterns.js';
import { mdBlockLinkRef } from './link-ref.js';
import { mdBlockListData } from './list-data.js';
import { mdBlockTable } from './table.js';
import { mdBlockTaskList } from './task-list.js';
import { mdBlockTypes } from './block-types.js';
import { mdBlockStarts } from './block-starts.js';
import { mdBlockCursor } from './cursor.js';

export const blockParser = {
    name: 'blockParser',
    dependencies: [
        'mdErrors', 'mdNode', 'mdAstTypes', 'refsLinkRefs',
        'mdBlockHtmlPatterns', 'mdBlockLinkRef', 'mdBlockListData',
        'mdBlockTable', 'mdBlockTaskList',
        'mdBlockTypes', 'mdBlockStarts', 'mdBlockCursor'
    ],
    deps: [mdErrors, mdNode, mdAstTypes, refsLinkRefs, mdBlockHtmlPatterns, mdBlockLinkRef, mdBlockListData, mdBlockTable, mdBlockTaskList, mdBlockTypes, mdBlockStarts, mdBlockCursor],
    factory(
        errors, nodeMod, astTypes, linkRefsMod,
        htmlPatterns, blockLinkRef, blockListData,
        blockTable, blockTaskList,
        blockTypes, blockStartsMod, blockCursor
    ) {
        const { ContractError: _ContractError } = errors;
        const { Node } = nodeMod;
        const { T_DOCUMENT, T_PARAGRAPH, T_HEADING, T_TEXT, T_TABLE_CELL } = astTypes;
        const { createLinkRefMap } = linkRefsMod;
        const { blocks } = blockTypes;
        const { blockStarts } = blockStartsMod;
        const { detectTables } = blockTable;
        const { detectTaskLists } = blockTaskList;
        const {
            findNextNonspace, advanceOffset, advanceNextNonspace,
            addLine, addChild, closeUnmatchedBlocks, incorporateLine, finalize
        } = blockCursor;

        const C_NEWLINE   = 10;
        const reLineEnding = /\r\n|\n|\r/;

        // ---------------------------------------------------------------
        // Inline stub — fallback when no inline parser is injected
        // ---------------------------------------------------------------
        function stubInlines(block) {
            const walker = block.walker();
            let event;
            while ((event = walker.next())) {
                const node = event.node;
                const t = node.type;
                if (!event.entering && (t === T_PARAGRAPH || t === T_HEADING)) {
                    const text = (node.stringContent || '').replace(/\n+$/, '');
                    const child = new Node(T_TEXT);
                    child.literal = text;
                    node.appendChild(child);
                    node.stringContent = null;
                }
            }
        }

        function makeDocument() {
            return new Node(T_DOCUMENT, [[1, 1], [0, 0]]);
        }

        function makeParser() {
            const doc = makeDocument();
            const p = {
                doc,
                blocks,
                blockStarts,
                tip:                   doc,
                oldtip:                doc,
                currentLine:           '',
                lineNumber:            0,
                offset:                0,
                column:                0,
                nextNonspace:          0,
                nextNonspaceColumn:    0,
                indent:                0,
                indented:              false,
                blank:                 false,
                partiallyConsumedTab:  false,
                allClosed:             true,
                lastMatchedContainer:  doc,
                refmap:                createLinkRefMap(),
                lastLineLength:        0,

                findNextNonspace,
                advanceOffset,
                advanceNextNonspace,
                addLine,
                addChild,
                incorporateLine,
                finalize,
                closeUnmatchedBlocks
            };
            return p;
        }

        function parse(input, opts) {
            if (typeof input !== 'string') {
                throw new _ContractError(
                    'md/parse-not-string',
                    'blockParser.parse: input must be a string, got ' + typeof input,
                    { context: { gotType: typeof input } });
            }
            const p = makeParser();

            const lines = input.split(reLineEnding);
            let len = lines.length;
            if (input.charCodeAt(input.length - 1) === C_NEWLINE) len -= 1;

            for (let i = 0; i < len; i++) p.incorporateLine(lines[i]);
            while (p.tip) p.finalize(p.tip, len);

            // GFM block-level post-passes (before inline parsing).
            detectTables(p.doc);
            detectTaskLists(p.doc);

            const ip = opts && opts.inlineParser;
            if (typeof ip === 'function') {
                const walker = p.doc.walker();
                let event;
                while ((event = walker.next())) {
                    const node = event.node;
                    if (!event.entering &&
                        (node.type === T_PARAGRAPH || node.type === T_HEADING ||
                         node.type === T_TABLE_CELL)) {
                        ip(node, p.refmap);
                    }
                }
            } else {
                stubInlines(p.doc);
            }

            return { document: p.doc, refmap: p.refmap };
        }

        return { parse };
    }
};

export default blockParser;
