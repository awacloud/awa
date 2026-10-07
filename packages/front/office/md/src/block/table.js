// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GFM tables — post-block-phase detection pass.
 *
 * After the main block parse completes, every paragraph that looks
 * like a GFM table (header row + delimiter row + N body rows) is
 * converted in-place into a `T_TABLE` subtree.
 *
 * Exposed as the `mdBlockTable` factory descriptor. Module-level
 * named exports are materialised once for direct importers.
 *
 * @module md/block/table
 */

import { mdNode } from '../ast/node.js';
import { mdAstTypes } from '../ast/types.js';

export const mdBlockTable = {
    name: 'mdBlockTable',
    dependencies: ['mdNode', 'mdAstTypes'],
    deps: [mdNode, mdAstTypes],
    factory(nodeMod, astTypes) {
        const { Node } = nodeMod;
        const { T_PARAGRAPH, T_TABLE, T_TABLE_ROW, T_TABLE_CELL } = astTypes;

        /**
         * Parse a delimiter row into an align array, or null if not a delim row.
         */
        function parseDelimiterRow(line, expectedCols) {
            let s = line.replace(/^\s+/, '').replace(/\s+$/, '');
            if (s.length === 0) return null;
            if (!/^[\s|:-]+$/.test(s)) return null;
            if (s.startsWith('|')) s = s.slice(1);
            if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
            const cells = s.split('|');
            const aligns = [];
            for (const cell of cells) {
                const c = cell.trim();
                const m = c.match(/^(:?)(-+)(:?)$/);
                if (!m) return null;
                const leftColon = m[1] === ':';
                const rightColon = m[3] === ':';
                if (leftColon && rightColon) aligns.push('center');
                else if (rightColon) aligns.push('right');
                else if (leftColon) aligns.push('left');
                else aligns.push(null);
            }
            if (expectedCols != null && aligns.length !== expectedCols) return null;
            return aligns;
        }

        /** Split a row line into cell strings, honoring escaped pipes. */
        function splitRowCells(line) {
            let s = line;
            s = s.replace(/^\s+/, '').replace(/\s+$/, '');
            if (s.startsWith('|')) s = s.slice(1);
            if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
            const cells = [];
            let cur = '';
            for (let i = 0; i < s.length; i++) {
                const c = s.charAt(i);
                if (c === '\\' && s.charAt(i + 1) === '|') {
                    cur += '|';
                    i++;
                } else if (c === '|') {
                    cells.push(cur);
                    cur = '';
                } else {
                    cur += c;
                }
            }
            cells.push(cur);
            return cells.map(c => c.trim());
        }

        /** Count cells in a row (for header-row column count). */
        function countHeaderCells(line) {
            return splitRowCells(line).length;
        }

        /**
         * Try to convert `paragraph` into a table.
         * Returns true if conversion happened (paragraph unlinked).
         */
        function tryConvertParagraphToTable(paragraph) {
            const content = paragraph.stringContent || '';
            if (content.indexOf('|') === -1) return false;
            const lines = content.replace(/\n+$/, '').split('\n');
            if (lines.length < 2) return false;
            const headerLine = lines[0];
            const delimLine  = lines[1];
            if (headerLine.indexOf('|') === -1) return false;
            const headerCells = splitRowCells(headerLine);
            if (headerCells.length === 0) return false;
            const aligns = parseDelimiterRow(delimLine, headerCells.length);
            if (!aligns) return false;

            const table = new Node(T_TABLE);
            table.align = aligns;
            const headerRow = new Node(T_TABLE_ROW);
            headerRow.isHeader = true;
            for (let i = 0; i < headerCells.length; i++) {
                const cell = new Node(T_TABLE_CELL);
                cell.isHeader = true;
                cell.cellAlign = aligns[i] || null;
                cell.stringContent = headerCells[i];
                headerRow.appendChild(cell);
            }
            table.appendChild(headerRow);

            for (let i = 2; i < lines.length; i++) {
                const rowLine = lines[i];
                if (rowLine.trim() === '') break;
                const cells = splitRowCells(rowLine);
                const row = new Node(T_TABLE_ROW);
                row.isHeader = false;
                for (let j = 0; j < aligns.length; j++) {
                    const cell = new Node(T_TABLE_CELL);
                    cell.isHeader = false;
                    cell.cellAlign = aligns[j] || null;
                    cell.stringContent = j < cells.length ? cells[j] : '';
                    row.appendChild(cell);
                }
                table.appendChild(row);
            }

            paragraph.insertAfter(table);
            paragraph.unlink();
            return true;
        }

        /** Walk the document, converting paragraphs that match a table. */
        function detectTables(doc) {
            const paragraphs = [];
            const walker = doc.walker();
            let event;
            while ((event = walker.next())) {
                if (event.entering && event.node.type === T_PARAGRAPH) {
                    paragraphs.push(event.node);
                }
            }
            for (const p of paragraphs) {
                if (!p.parent) continue;
                tryConvertParagraphToTable(p);
            }
        }

        return {
            parseDelimiterRow, splitRowCells, countHeaderCells,
            tryConvertParagraphToTable, detectTables
        };
    }
};
