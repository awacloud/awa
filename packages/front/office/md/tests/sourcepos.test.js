// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for inline + block source-position tracking.
 *
 * Sourcepos precision is BEST-EFFORT for inline nodes:
 *   - startLine / endLine are accurate (subject is split on '\n').
 *   - Column is correct on the first line; on subsequent lines it is
 *     1-based relative to the line start within the trimmed subject
 *     (tab expansion is NOT replayed).
 *
 * Block sourcepos was already populated in L1/L2 — these tests pin
 * that down too.
 */

import { test, expect, describe } from 'bun:test';
import { createMd, Walker } from './_helpers/build.js';

const md   = createMd({ sourcepos: true, extendedAutolinks: false });
const mdOff = createMd({ extendedAutolinks: false });

function collect(root) {
    const out = [];
    const w = new Walker(root);
    let ev;
    while ((ev = w.next())) if (ev.entering) out.push(ev.node);
    return out;
}

describe('sourcepos option', () => {
    test('off by default — no sourcepos on inline nodes', () => {
        const ast = mdOff.parse('Hello *world* `code`\n');
        const nodes = collect(ast);
        // Filter inline-level nodes (anything not document/paragraph/heading/block)
        const inlines = nodes.filter(n =>
            n.type === 'text' || n.type === 'emph' || n.type === 'code');
        expect(inlines.length).toBeGreaterThan(0);
        // Block-level sourcepos is fine; inline should be null.
        for (const n of inlines) expect(n.sourcepos).toBeNull();
    });

    test('on: every node has sourcepos', () => {
        const ast = md.parse('Hello *world* `code`\n');
        const nodes = collect(ast);
        for (const n of nodes) {
            if (n.type === 'document') continue;
            expect(n.sourcepos).not.toBeNull();
            expect(Array.isArray(n.sourcepos)).toBe(true);
            expect(n.sourcepos.length).toBe(2);
        }
    });

    test('heading position matches actual line', () => {
        const text = '\n\n# Title\n\nbody\n';
        const ast = md.parse(text);
        const h = collect(ast).find(n => n.type === 'heading');
        expect(h.sourcepos[0][0]).toBe(3);
        expect(h.sourcepos[1][0]).toBe(3);
    });

    test('fenced code block end line is correct', () => {
        const text = '```\nline1\nline2\nline3\n```\n';
        const ast = md.parse(text);
        const cb = collect(ast).find(n => n.type === 'code_block');
        expect(cb.sourcepos[0][0]).toBe(1);
        expect(cb.sourcepos[1][0]).toBe(5);
    });

    test('indented code block end line is correct', () => {
        const text = '    line1\n    line2\n    line3\n';
        const ast = md.parse(text);
        const cb = collect(ast).find(n => n.type === 'code_block');
        expect(cb.sourcepos[0][0]).toBe(1);
        expect(cb.sourcepos[1][0]).toBe(3);
    });

    test('inline emph spans correct line and column', () => {
        const text = 'a *b* c\n';
        const ast = md.parse(text);
        const emph = collect(ast).find(n => n.type === 'emph');
        expect(emph).toBeDefined();
        expect(emph.sourcepos[0][0]).toBe(1);
        expect(emph.sourcepos[1][0]).toBe(1);
        // Start column: '*' at col 3 (1-based).
        expect(emph.sourcepos[0][1]).toBe(3);
    });

    test('inline code span has sourcepos', () => {
        const text = 'a `x` b\n';
        const ast = md.parse(text);
        const cs = collect(ast).find(n => n.type === 'code');
        expect(cs).toBeDefined();
        expect(cs.sourcepos[0][0]).toBe(1);
        expect(cs.sourcepos[1][0]).toBe(1);
    });

    test('inline link wraps children with span', () => {
        const text = '[hi](https://example.com)\n';
        const ast = md.parse(text);
        const link = collect(ast).find(n => n.type === 'link');
        expect(link).toBeDefined();
        expect(link.sourcepos[0][0]).toBe(1);
        expect(link.sourcepos[1][0]).toBe(1);
    });

    test('multi-line paragraph: inline text on second line has line 2', () => {
        const text = 'first line\nsecond line *emph*\n';
        const ast = md.parse(text);
        const emph = collect(ast).find(n => n.type === 'emph');
        expect(emph).toBeDefined();
        expect(emph.sourcepos[0][0]).toBe(2);
    });
});
