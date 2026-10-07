// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Sibling tests for the `docxText` module — plain-text extraction
 * helpers split from `docx.js`.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { docxText } from './docx-text.js';

describe('docxText module', () => {
    test('module metadata', () => {
        expect(docxText.name).toBe('docxText');
        expect(docxText.dependencies).toEqual([]);
        expect(typeof docxText.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns the expected API surface', () => {
            const t = docxText.factory();
            expect(typeof t.toText).toBe('function');
            expect(typeof t.textOfParagraph).toBe('function');
            expect(typeof t.textOfRun).toBe('function');
            expect(typeof t.textOfTable).toBe('function');
        });
    });

    describe('toText', () => {
        let t;
        beforeEach(() => { t = docxText.factory(); });

        test('empty body returns empty string', () => {
            expect(t.toText({})).toBe('');
            expect(t.toText({ body: [] })).toBe('');
        });

        test('joins paragraphs with newlines', () => {
            const doc = {
                body: [
                    { type: 'paragraph', children: [
                        { type: 'run', children: [{ type: 'text', value: 'Hello' }] }
                    ] },
                    { type: 'paragraph', children: [
                        { type: 'run', children: [{ type: 'text', value: 'World' }] }
                    ] }
                ]
            };
            expect(t.toText(doc)).toBe('Hello\nWorld');
        });

        test('handles run special characters (tab/break/noBreakHyphen)', () => {
            const doc = {
                body: [{ type: 'paragraph', children: [
                    { type: 'run', children: [
                        { type: 'text', value: 'A' },
                        { type: 'tab' },
                        { type: 'text', value: 'B' },
                        { type: 'break' },
                        { type: 'text', value: 'C' },
                        { type: 'noBreakHyphen' },
                        { type: 'text', value: 'D' }
                    ] }
                ] }]
            };
            expect(t.toText(doc)).toBe('A\tB\nC‑D');
        });

        test('extracts text from hyperlinks and ins, ignores del', () => {
            const doc = {
                body: [{ type: 'paragraph', children: [
                    { type: 'hyperlink', children: [
                        { type: 'run', children: [{ type: 'text', value: 'link' }] }
                    ] },
                    { type: 'ins', children: [
                        { type: 'run', children: [{ type: 'text', value: '+ins' }] }
                    ] },
                    { type: 'del', children: [
                        { type: 'run', children: [{ type: 'text', value: 'GONE' }] }
                    ] }
                ] }]
            };
            expect(t.toText(doc)).toBe('link+ins');
        });

        test('serialises tables with tab/newline separators', () => {
            const doc = {
                body: [{ type: 'table', rows: [
                    { cells: [
                        { children: [{ type: 'paragraph', children: [
                            { type: 'run', children: [{ type: 'text', value: 'A' }] }
                        ] }] },
                        { children: [{ type: 'paragraph', children: [
                            { type: 'run', children: [{ type: 'text', value: 'B' }] }
                        ] }] }
                    ] },
                    { cells: [
                        { children: [{ type: 'paragraph', children: [
                            { type: 'run', children: [{ type: 'text', value: 'C' }] }
                        ] }] },
                        { children: [{ type: 'paragraph', children: [
                            { type: 'run', children: [{ type: 'text', value: 'D' }] }
                        ] }] }
                    ] }
                ] }]
            };
            expect(t.toText(doc)).toBe('A\tB\nC\tD');
        });
    });
});
