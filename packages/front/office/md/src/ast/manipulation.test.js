// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Sibling tests for the AST manipulation helpers.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { mdAstManipulation } from './manipulation.js';
import { mdErrors } from '../errors.js';
import { mdNode } from './node.js';
import {
    Node,
    replaceNode, wrapNode, flattenNode,
    findFirst, findAll, cloneNode,
    ContractError, createMd
} from '../../tests/_helpers/build.js';

const md = createMd({ extendedAutolinks: false });

function makeText(s) { const n = new Node('text'); n.literal = s; return n; }
function countChildren(n) {
    let c = 0; let x = n.firstChild;
    while (x) { c++; x = x.next; }
    return c;
}

describe('mdAstManipulation module', () => {
    test('should have correct module metadata', () => {
        expect(mdAstManipulation.name).toBe('mdAstManipulation');
        expect(mdAstManipulation.dependencies).toEqual(['mdErrors', 'mdNode']);
        expect(typeof mdAstManipulation.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = mdAstManipulation.factory(mdErrors.factory(), mdNode.factory());
            expect(typeof inst.replaceNode).toBe('function');
            expect(typeof inst.wrapNode).toBe('function');
            expect(typeof inst.flattenNode).toBe('function');
            expect(typeof inst.findFirst).toBe('function');
            expect(typeof inst.findAll).toBe('function');
            expect(typeof inst.cloneNode).toBe('function');
        });
    });

    describe('replaceNode', () => {
        test('swaps a node in place', () => {
            const ast = md.parse('hello *world*\n');
            const emph = findFirst(ast, n => n.type === 'emph');
            const repl = makeText('REPL');
            replaceNode(emph, repl);
            const txts = findAll(ast, n => n.type === 'text').map(n => n.literal);
            expect(txts).toContain('REPL');
        });

        test('throws TypeError on missing args', () => {
            expect(() => replaceNode(null, new Node('text'))).toThrow(TypeError);
            expect(() => replaceNode(new Node('text'), null)).toThrow(TypeError);
        });

        test('throws ContractError when oldNode has no parent', () => {
            const orphan = new Node('text');
            let err;
            try { replaceNode(orphan, makeText('x')); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(ContractError);
            expect(err.code).toBe('md/replace-node-no-parent');
        });
    });

    describe('wrapNode', () => {
        test('wraps a node with another', () => {
            const ast = md.parse('a *b* c\n');
            const emph = findFirst(ast, n => n.type === 'emph');
            const wrapper = new Node('strong');
            wrapNode(emph, wrapper);
            const strong = findFirst(ast, n => n.type === 'strong');
            expect(strong.firstChild).toBe(emph);
            expect(emph.parent).toBe(strong);
        });

        test('throws TypeError on missing args', () => {
            expect(() => wrapNode(null, new Node('strong'))).toThrow(TypeError);
            expect(() => wrapNode(new Node('text'), null)).toThrow(TypeError);
        });

        test('throws ContractError when node has no parent', () => {
            const orphan = new Node('text');
            let err;
            try { wrapNode(orphan, new Node('strong')); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(ContractError);
            expect(err.code).toBe('md/wrap-node-no-parent');
        });
    });

    describe('flattenNode', () => {
        test('lifts children up one level', () => {
            const ast = md.parse('hi *a b c* end\n');
            const emph = findFirst(ast, n => n.type === 'emph');
            const para = emph.parent;
            const before = countChildren(para);
            const emphCount = countChildren(emph);
            flattenNode(emph);
            expect(countChildren(para)).toBe(before - 1 + emphCount);
            expect(findFirst(ast, n => n.type === 'emph')).toBeNull();
        });

        test('throws ContractError when node has no parent', () => {
            const orphan = new Node('text');
            let err;
            try { flattenNode(orphan); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(ContractError);
            expect(err.code).toBe('md/flatten-node-no-parent');
        });

        test('throws when given null/undefined', () => {
            expect(() => flattenNode(null)).toThrow(ContractError);
            expect(() => flattenNode(undefined)).toThrow(ContractError);
        });
    });

    describe('findFirst', () => {
        test('returns the first match in document order', () => {
            const ast = md.parse('# h\n\np\n');
            const h = findFirst(ast, n => n.type === 'heading');
            expect(h).not.toBeNull();
            expect(h.level).toBe(1);
        });

        test('returns null when nothing matches', () => {
            const ast = md.parse('plain paragraph\n');
            expect(findFirst(ast, n => n.type === 'heading')).toBeNull();
        });
    });

    describe('findAll', () => {
        test('returns all matches', () => {
            const ast = md.parse('# a\n## b\n### c\n');
            const headings = findAll(ast, n => n.type === 'heading');
            expect(headings.length).toBe(3);
        });

        test('returns empty array when nothing matches', () => {
            const ast = md.parse('hi\n');
            expect(findAll(ast, n => n.type === 'heading')).toEqual([]);
        });
    });

    describe('cloneNode', () => {
        test('clones a node shallowly (no children)', () => {
            const n = new Node('heading');
            n.level = 2;
            n.appendChild(makeText('hi'));
            const c = cloneNode(n);
            expect(c.type).toBe('heading');
            expect(c.level).toBe(2);
            expect(c.firstChild).toBeNull();
        });

        test('clones deep with independent copies', () => {
            const n = new Node('heading');
            n.level = 2;
            n.appendChild(makeText('hi'));
            const c = cloneNode(n, true);
            expect(c.firstChild).not.toBeNull();
            expect(c.firstChild.literal).toBe('hi');
            c.firstChild.literal = 'other';
            expect(n.firstChild.literal).toBe('hi');
        });

        test('throws TypeError when node missing', () => {
            expect(() => cloneNode(null)).toThrow(TypeError);
        });

        test('preserves sourcepos when present', () => {
            const n = new Node('text');
            n.sourcepos = [[1, 1], [1, 5]];
            const c = cloneNode(n);
            expect(c.sourcepos).toEqual([[1, 1], [1, 5]]);
            // Independent copy.
            c.sourcepos[0][0] = 99;
            expect(n.sourcepos[0][0]).toBe(1);
        });
    });
});
