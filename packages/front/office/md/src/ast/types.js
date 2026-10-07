// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Canonical AST node type names. Compatible with the
 * CommonMark XML AST format (cmark `--to xml`).
 *
 * Strict factory-only : the canonical definitions live inside the
 * `mdAstTypes` descriptor's `factory()` body. No top-level materialisation —
 * the canonical instance is produced by `main.js` (sole bootstrap site)
 * and seeded into the package-level `ModuleRuntime`.
 *
 * @module md/ast/types
 */

export const mdAstTypes = {
    name: 'mdAstTypes',
    dependencies: [],
    factory() {
        // Self-contained — worker-safe, no closure over module-level state.
        const T_DOCUMENT        = 'document';
        const T_PARAGRAPH       = 'paragraph';
        const T_HEADING         = 'heading';
        const T_THEMATIC_BREAK  = 'thematic_break';
        const T_CODE_BLOCK      = 'code_block';
        const T_HTML_BLOCK      = 'html_block';
        const T_BLOCK_QUOTE     = 'block_quote';
        const T_LIST            = 'list';
        const T_ITEM            = 'item';
        const T_TABLE           = 'table';
        const T_TABLE_ROW       = 'table_row';
        const T_TABLE_CELL      = 'table_cell';
        const T_TEXT            = 'text';
        const T_SOFTBREAK       = 'softbreak';
        const T_LINEBREAK       = 'linebreak';
        const T_CODE            = 'code';
        const T_EMPH            = 'emph';
        const T_STRONG          = 'strong';
        const T_LINK            = 'link';
        const T_IMAGE           = 'image';
        const T_HTML_INLINE     = 'html_inline';
        const T_STRIKETHROUGH   = 'strikethrough';
        const T_MATH_INLINE     = 'math_inline';
        const T_MATH_BLOCK      = 'math_block';
        const T_FOOTNOTE_REF    = 'footnote_ref';
        const T_FOOTNOTE_DEF    = 'footnote_def';
        const T_ADMONITION      = 'admonition';
        const T_HIGHLIGHT       = 'highlight';
        const T_SUBSCRIPT       = 'subscript';
        const T_SUPERSCRIPT     = 'superscript';

        const BLOCK_CONTAINERS = new Set([
            T_DOCUMENT, T_BLOCK_QUOTE, T_LIST, T_ITEM,
            T_TABLE, T_TABLE_ROW, T_ADMONITION, T_FOOTNOTE_DEF
        ]);
        const INLINE_CONTAINERS = new Set([
            T_PARAGRAPH, T_HEADING, T_EMPH, T_STRONG, T_LINK, T_IMAGE,
            T_STRIKETHROUGH, T_TABLE_CELL,
            T_HIGHLIGHT, T_SUBSCRIPT, T_SUPERSCRIPT
        ]);
        function isContainerType(type) {
            return BLOCK_CONTAINERS.has(type) || INLINE_CONTAINERS.has(type);
        }
        function isContainer(type) { return isContainerType(type); }
        return {
            isContainer,
            T_DOCUMENT, T_PARAGRAPH, T_HEADING, T_THEMATIC_BREAK,
            T_CODE_BLOCK, T_HTML_BLOCK, T_BLOCK_QUOTE, T_LIST, T_ITEM,
            T_TABLE, T_TABLE_ROW, T_TABLE_CELL,
            T_TEXT, T_SOFTBREAK, T_LINEBREAK, T_CODE, T_EMPH, T_STRONG,
            T_LINK, T_IMAGE, T_HTML_INLINE, T_STRIKETHROUGH,
            T_MATH_INLINE, T_MATH_BLOCK, T_FOOTNOTE_REF, T_FOOTNOTE_DEF,
            T_ADMONITION, T_HIGHLIGHT, T_SUBSCRIPT, T_SUPERSCRIPT,
            BLOCK_CONTAINERS, INLINE_CONTAINERS,
            isContainerType
        };
    }
};
