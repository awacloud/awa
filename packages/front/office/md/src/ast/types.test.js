// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Sibling tests for the AST node type constants.
 */

import { describe, test, expect } from 'bun:test';
import { mdAstTypes } from './types.js';
import {
    T_DOCUMENT, T_PARAGRAPH, T_HEADING, T_THEMATIC_BREAK,
    T_CODE_BLOCK, T_HTML_BLOCK, T_BLOCK_QUOTE, T_LIST, T_ITEM,
    T_TABLE, T_TABLE_ROW, T_TABLE_CELL,
    T_TEXT, T_SOFTBREAK, T_LINEBREAK, T_CODE, T_EMPH, T_STRONG,
    T_LINK, T_IMAGE, T_HTML_INLINE, T_STRIKETHROUGH,
    T_MATH_INLINE, T_MATH_BLOCK, T_FOOTNOTE_REF, T_FOOTNOTE_DEF,
    T_ADMONITION, T_HIGHLIGHT, T_SUBSCRIPT, T_SUPERSCRIPT,
    BLOCK_CONTAINERS, INLINE_CONTAINERS, isContainerType
} from '../../tests/_helpers/build.js';

describe('mdAstTypes module', () => {
    test('should have correct module metadata', () => {
        expect(mdAstTypes.name).toBe('mdAstTypes');
        expect(mdAstTypes.dependencies).toEqual([]);
        expect(typeof mdAstTypes.factory).toBe('function');
    });

    describe('factory', () => {
        test('exposes the full set of type constants', () => {
            const t = mdAstTypes.factory();
            expect(t.T_DOCUMENT).toBe('document');
            expect(t.T_PARAGRAPH).toBe('paragraph');
            expect(t.T_HEADING).toBe('heading');
            expect(typeof t.isContainer).toBe('function');
            expect(typeof t.isContainerType).toBe('function');
            // Worker-safe factory exposes its own copies (equal-by-value, not by identity).
            expect(t.BLOCK_CONTAINERS).toEqual(BLOCK_CONTAINERS);
            expect(t.INLINE_CONTAINERS).toEqual(INLINE_CONTAINERS);
        });
    });

    describe('type constants', () => {
        test('core block types use kebab/snake names', () => {
            expect(T_DOCUMENT).toBe('document');
            expect(T_PARAGRAPH).toBe('paragraph');
            expect(T_HEADING).toBe('heading');
            expect(T_THEMATIC_BREAK).toBe('thematic_break');
            expect(T_CODE_BLOCK).toBe('code_block');
            expect(T_HTML_BLOCK).toBe('html_block');
            expect(T_BLOCK_QUOTE).toBe('block_quote');
            expect(T_LIST).toBe('list');
            expect(T_ITEM).toBe('item');
            expect(T_TABLE).toBe('table');
            expect(T_TABLE_ROW).toBe('table_row');
            expect(T_TABLE_CELL).toBe('table_cell');
        });

        test('core inline types', () => {
            expect(T_TEXT).toBe('text');
            expect(T_SOFTBREAK).toBe('softbreak');
            expect(T_LINEBREAK).toBe('linebreak');
            expect(T_CODE).toBe('code');
            expect(T_EMPH).toBe('emph');
            expect(T_STRONG).toBe('strong');
            expect(T_LINK).toBe('link');
            expect(T_IMAGE).toBe('image');
            expect(T_HTML_INLINE).toBe('html_inline');
            expect(T_STRIKETHROUGH).toBe('strikethrough');
        });

        test('extra types', () => {
            expect(T_MATH_INLINE).toBe('math_inline');
            expect(T_MATH_BLOCK).toBe('math_block');
            expect(T_FOOTNOTE_REF).toBe('footnote_ref');
            expect(T_FOOTNOTE_DEF).toBe('footnote_def');
            expect(T_ADMONITION).toBe('admonition');
            expect(T_HIGHLIGHT).toBe('highlight');
            expect(T_SUBSCRIPT).toBe('subscript');
            expect(T_SUPERSCRIPT).toBe('superscript');
        });
    });

    describe('BLOCK_CONTAINERS', () => {
        test('contains the standard block containers', () => {
            for (const t of [T_DOCUMENT, T_BLOCK_QUOTE, T_LIST, T_ITEM,
                              T_TABLE, T_TABLE_ROW, T_ADMONITION,
                              T_FOOTNOTE_DEF]) {
                expect(BLOCK_CONTAINERS.has(t)).toBe(true);
            }
        });

        test('does not contain leaf types', () => {
            expect(BLOCK_CONTAINERS.has(T_TEXT)).toBe(false);
            expect(BLOCK_CONTAINERS.has(T_CODE_BLOCK)).toBe(false);
        });
    });

    describe('INLINE_CONTAINERS', () => {
        test('contains the standard inline containers', () => {
            for (const t of [T_PARAGRAPH, T_HEADING, T_EMPH, T_STRONG,
                              T_LINK, T_IMAGE, T_STRIKETHROUGH,
                              T_TABLE_CELL, T_HIGHLIGHT,
                              T_SUBSCRIPT, T_SUPERSCRIPT]) {
                expect(INLINE_CONTAINERS.has(t)).toBe(true);
            }
        });

        test('does not contain pure block containers', () => {
            expect(INLINE_CONTAINERS.has(T_DOCUMENT)).toBe(false);
            expect(INLINE_CONTAINERS.has(T_BLOCK_QUOTE)).toBe(false);
        });
    });

    describe('isContainerType', () => {
        test('returns true for any container type', () => {
            expect(isContainerType(T_DOCUMENT)).toBe(true);
            expect(isContainerType(T_PARAGRAPH)).toBe(true);
            expect(isContainerType(T_EMPH)).toBe(true);
        });

        test('returns false for leaf types', () => {
            expect(isContainerType(T_TEXT)).toBe(false);
            expect(isContainerType(T_THEMATIC_BREAK)).toBe(false);
            expect(isContainerType(T_CODE_BLOCK)).toBe(false);
        });

        test('returns false for unknown types', () => {
            expect(isContainerType('nope')).toBe(false);
        });
    });
});
