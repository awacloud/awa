// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Plain-text extraction helpers for `docx` documents — exposed
 * as the `docxText` module factory.
 *
 * Extracted from `docx.js` to keep the orchestrator focused
 * on read / write / orchestration. The helpers are pure — no
 * dependencies on the runtime, no side effects.
 *
 * @module ooxml/docx/docxText
 */

export const docxText = {
    name: 'docxText',
    dependencies: [],
    factory() {
        /**
         * Extract plain text from a typed docx document tree.
         * Paragraphs are joined by `\n`; table cells by `\t`, rows by `\n`.
         *
         * @param {{ body? }} doc — docx document tree
         * @returns {string}
         */
        function toText(doc) {
            const lines = [];
            for (const node of doc.body || []) {
                if (node.type === 'paragraph')   lines.push(textOfParagraph(node));
                else if (node.type === 'table')  lines.push(textOfTable(node));
            }
            return lines.join('\n');
        }

        function textOfParagraph(p) {
            const out = [];
            for (const c of p.children || []) {
                if (c.type === 'run')            out.push(textOfRun(c));
                else if (c.type === 'hyperlink') for (const r of c.children) out.push(textOfRun(r));
                else if (c.type === 'ins')       for (const r of c.children) out.push(textOfRun(r));
                // <w:del> content is not visible plain text.
            }
            return out.join('');
        }

        function textOfRun(r) {
            const out = [];
            for (const c of r.children || []) {
                if (c.type === 'text')               out.push(c.value);
                else if (c.type === 'tab')           out.push('\t');
                else if (c.type === 'break')         out.push('\n');
                else if (c.type === 'noBreakHyphen') out.push('‑');
            }
            return out.join('');
        }

        function textOfTable(t) {
            const lines = [];
            for (const row of t.rows || []) {
                const cells = [];
                for (const cell of row.cells || []) {
                    const inner = [];
                    for (const node of cell.children || []) {
                        if (node.type === 'paragraph') inner.push(textOfParagraph(node));
                        else if (node.type === 'table') inner.push(textOfTable(node));
                    }
                    cells.push(inner.join(' '));
                }
                lines.push(cells.join('\t'));
            }
            return lines.join('\n');
        }

        return { toText, textOfParagraph, textOfRun, textOfTable };
    }
};
