// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview AST manipulation helper tests.
 */

import { test, expect, describe } from 'bun:test';
import {
    createMd, Node,
    replaceNode, wrapNode, flattenNode, findFirst, findAll, cloneNode
} from './_helpers/build.js';

const md = createMd({ extendedAutolinks: false });

describe('AST manipulation', () => {
    test('replaceNode swaps a node in place', () => {
        const ast = md.parse('hello *world*\n');
        const emph = findFirst(ast, n => n.type === 'emph');
        const repl = new Node('text');
        repl.literal = 'REPL';
        replaceNode(emph, repl);
        const txts = findAll(ast, n => n.type === 'text').map(n => n.literal);
        expect(txts).toContain('REPL');
    });

    test('wrapNode wraps a node with another', () => {
        const ast = md.parse('a *b* c\n');
        const emph = findFirst(ast, n => n.type === 'emph');
        const wrapper = new Node('strong');
        wrapNode(emph, wrapper);
        const strong = findFirst(ast, n => n.type === 'strong');
        expect(strong.firstChild).toBe(emph);
        expect(emph.parent).toBe(strong);
    });

    test('flattenNode lifts children up one level', () => {
        const ast = md.parse('hi *a b c* end\n');
        const emph = findFirst(ast, n => n.type === 'emph');
        const para = emph.parent;
        const childCountBefore = countChildren(para);
        const emphChildCount = countChildren(emph);
        flattenNode(emph);
        const childCountAfter = countChildren(para);
        expect(childCountAfter).toBe(childCountBefore - 1 + emphChildCount);
        expect(findFirst(ast, n => n.type === 'emph')).toBeNull();
    });

    test('findFirst returns first match', () => {
        const ast = md.parse('# h\n\np\n');
        const h = findFirst(ast, n => n.type === 'heading');
        expect(h).not.toBeNull();
        expect(h.level).toBe(1);
    });

    test('findAll returns all matches', () => {
        const ast = md.parse('# a\n## b\n### c\n');
        const headings = findAll(ast, n => n.type === 'heading');
        expect(headings.length).toBe(3);
    });

    test('cloneNode shallow', () => {
        const n = new Node('heading');
        n.level = 2;
        n.appendChild(makeText('hi'));
        const c = cloneNode(n);
        expect(c.type).toBe('heading');
        expect(c.level).toBe(2);
        expect(c.firstChild).toBeNull();
    });

    test('cloneNode deep', () => {
        const n = new Node('heading');
        n.level = 2;
        n.appendChild(makeText('hi'));
        const c = cloneNode(n, true);
        expect(c.firstChild).not.toBeNull();
        expect(c.firstChild.literal).toBe('hi');
        // Independent copy.
        c.firstChild.literal = 'other';
        expect(n.firstChild.literal).toBe('hi');
    });
});

function countChildren(n) {
    let c = 0;
    let x = n.firstChild;
    while (x) { c++; x = x.next; }
    return c;
}

function makeText(s) { const n = new Node('text'); n.literal = s; return n; }
