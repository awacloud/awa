// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for ./table.js — GFM table detection helpers.
 */

import { describe, test, expect } from 'bun:test';
import { testRuntime } from './_test-runtime.js';

const { Node } = testRuntime.resolve('mdNode');
const {
    parseDelimiterRow, splitRowCells, countHeaderCells,
    tryConvertParagraphToTable, detectTables
} = testRuntime.resolve('mdBlockTable');

describe('table module', () => {
    test('parseDelimiterRow extracts alignment per cell', () => {
        expect(parseDelimiterRow('|---|:---|:---:|---:|', 4))
            .toEqual([null, 'left', 'center', 'right']);
    });

    test('parseDelimiterRow returns null for non-delim row', () => {
        expect(parseDelimiterRow('| a | b |', 2)).toBeNull();
    });

    test('parseDelimiterRow rejects mismatched column count', () => {
        expect(parseDelimiterRow('|---|---|', 3)).toBeNull();
    });

    test('splitRowCells honors escaped pipes', () => {
        expect(splitRowCells('| a | b \\| c | d |'))
            .toEqual(['a', 'b | c', 'd']);
    });

    test('countHeaderCells counts pipe-delimited cells', () => {
        expect(countHeaderCells('| a | b | c |')).toBe(3);
    });

    test('tryConvertParagraphToTable converts a valid table paragraph', () => {
        const p = new Node('paragraph');
        p.sourcepos = [[1, 1], [3, 1]];
        p.stringContent = '| a | b |\n|---|---|\n| 1 | 2 |\n';
        const parent = new Node('document');
        parent.appendChild(p);
        const converted = tryConvertParagraphToTable(p);
        expect(converted).toBe(true);
        expect(parent.firstChild.type).toBe('table');
    });

    test('detectTables walks the document and converts paragraphs', () => {
        const doc = new Node('document');
        const p = new Node('paragraph');
        p.sourcepos = [[1, 1], [3, 1]];
        p.stringContent = '| a | b |\n|---|---|\n| 1 | 2 |\n';
        doc.appendChild(p);
        detectTables(doc);
        expect(doc.firstChild.type).toBe('table');
    });
});
