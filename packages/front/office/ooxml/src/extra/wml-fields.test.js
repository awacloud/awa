// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { wmlFields } from './wml-fields.js';

const ext = wmlFields.factory();

describe('extra/wml-fields — tokenizer', () => {
    test('handles quoted strings + switches', () => {
        const t = ext.tokenize('MERGEFIELD "First Name" \\* MERGEFORMAT \\b "Hello "');
        expect(t[0]).toEqual({ kind: 'word', value: 'MERGEFIELD' });
        expect(t[1]).toEqual({ kind: 'string', value: 'First Name' });
        expect(t[2]).toEqual({ kind: 'switch', value: '\\*' });
        expect(t[3]).toEqual({ kind: 'word', value: 'MERGEFORMAT' });
    });
});

describe('extra/wml-fields — typed catalog', () => {
    test('MERGEFIELD parses + renders', () => {
        const s = ext.parseTyped('MERGEFIELD "First Name" \\* MERGEFORMAT \\b "Hello " \\f "!"');
        expect(s.type).toBe('MERGEFIELD');
        expect(s.fieldName).toBe('First Name');
        expect(s.mergeFormat).toBe(true);
        expect(s.before).toBe('Hello ');
        expect(s.after).toBe('!');
        const re = ext.renderTyped(s);
        expect(re).toContain('MERGEFIELD');
        expect(re).toContain('"First Name"');
        expect(re).toContain('\\b "Hello "');
    });

    test('HYPERLINK parses url + anchor + screenTip', () => {
        const s = ext.parseTyped('HYPERLINK "https://example.com" \\l "section1" \\o "Tooltip" \\t "_blank"');
        expect(s.type).toBe('HYPERLINK');
        expect(s.url).toBe('https://example.com');
        expect(s.anchor).toBe('section1');
        expect(s.screenTip).toBe('Tooltip');
        expect(s.target).toBe('_blank');
        const re = ext.renderTyped(s);
        expect(re).toContain('HYPERLINK');
        expect(re).toContain('https://example.com');
        expect(re).toContain('\\l section1');
    });

    test('TOC parses range + flags', () => {
        const s = ext.parseTyped('TOC \\o "1-3" \\h \\z \\u');
        expect(s.type).toBe('TOC');
        expect(s.minLevel).toBe(1);
        expect(s.maxLevel).toBe(3);
        expect(s.hyperlinks).toBe(true);
        expect(s.omitPageNum).toBe(true);
        expect(s.useAppliedParaOutline).toBe(true);
        const re = ext.renderTyped(s);
        expect(re).toContain('TOC');
        expect(re).toContain('\\o 1-3');
        expect(re).toContain('\\h');
    });

    test('IF parses comparison + branches', () => {
        const s = ext.parseTyped('IF { MERGEFIELD x } = "yes" "ok" "no"');
        expect(s.type).toBe('IF');
    });

    test('REF parses bookmark + flags', () => {
        const s = ext.parseTyped('REF myBookmark \\h \\n');
        expect(s.bookmark).toBe('myBookmark');
        expect(s.hyperlink).toBe(true);
        expect(s.insertParaNum).toBe(true);
    });

    test('STYLEREF parses style name', () => {
        const s = ext.parseTyped('STYLEREF "Heading 1" \\l');
        expect(s.styleName).toBe('Heading 1');
        expect(s.searchFromBottom).toBe(true);
    });

    test('DATE parses format', () => {
        const s = ext.parseTyped('DATE \\@ "MMMM d, yyyy"');
        expect(s.type).toBe('DATE');
        expect(s.format).toBe('MMMM d, yyyy');
    });

    test('PAGE / NUMPAGES are simple', () => {
        expect(ext.parseTyped('PAGE').type).toBe('PAGE');
        expect(ext.parseTyped('NUMPAGES').type).toBe('NUMPAGES');
    });

    test('SET / ASK / FILLIN', () => {
        expect(ext.parseTyped('SET myVar "value"').bookmark).toBe('myVar');
        expect(ext.parseTyped('ASK myVar "Prompt?" \\d "default"').defaultResponse).toBe('default');
        expect(ext.parseTyped('FILLIN "Prompt?" \\d "x"').defaultResponse).toBe('x');
    });

    test('INCLUDETEXT', () => {
        const s = ext.parseTyped('INCLUDETEXT "C:\\\\file.docx" Bookmark1');
        expect(s.type).toBe('INCLUDETEXT');
        expect(s.bookmark).toBe('Bookmark1');
    });
});
