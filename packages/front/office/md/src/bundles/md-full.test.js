// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Sibling tests for the `md-full` kitchen-sink bundle.
 */

import { describe, test, expect } from 'bun:test';
import { createMdFull, mdFull } from '../../tests/_helpers/build.js';
import { mdFullBundle } from './md-full.js';
import { bootstrapMd } from '../bootstrap.js';

describe('bundles/md-full module', () => {
    test('exposes mdFull singleton and createMdFull factory', () => {
        expect(mdFull).toBeDefined();
        expect(typeof createMdFull).toBe('function');
    });

    test('mdFullBundle descriptor is strict factory-only', () => {
        expect(mdFullBundle.name).toBe('mdFullBundle');
        expect(Array.isArray(mdFullBundle.dependencies)).toBe(true);
        expect(typeof mdFullBundle.factory).toBe('function');
    });

    describe('createMdFull', () => {
        test('installs the 10 extras', () => {
            const m = createMdFull();
            expect(m.extensions.length).toBe(10);
            const names = m.extensions.map(e => e.name);
            for (const n of ['mdFrontmatter', 'mdEmoji', 'mdMath',
                              'mdFootnotes', 'mdWikilinks', 'mdAdmonitions',
                              'mdHighlight', 'mdSubsuper', 'mdToc',
                              'mdMermaid']) {
                expect(names).toContain(n);
            }
        });

        test('installs extras in a deterministic order', () => {
            const m = createMdFull();
            const names = m.extensions.map(e => e.name);
            expect(names[0]).toBe('mdFrontmatter');
            // mdMermaid is the post-processor, ordered last in createMdFull.
            expect(names[names.length - 1]).toBe('mdMermaid');
        });

        test('is idempotent — installing the same extension twice is a no-op', () => {
            const m = createMdFull();
            const before = m.extensions.length;
            m.use(m.extensions[0]);
            expect(m.extensions.length).toBe(before);
        });

        test('returns independent instances', () => {
            const a = createMdFull();
            const b = createMdFull();
            expect(a).not.toBe(b);
            expect(a.extensions).not.toBe(b.extensions);
        });
    });

    describe('parse — extras produce the right node types', () => {
        test('frontmatter → data.frontmatter', () => {
            const m = createMdFull();
            const ast = m.parse('---\ntitle: t\n---\n\nbody\n');
            expect(ast.data.frontmatter).toBeDefined();
            expect(ast.data.frontmatter.lang).toBe('yaml');
        });

        test('math inline → math_inline node', () => {
            const m = createMdFull();
            const ast = m.parse('see $a+b$ here\n');
            const types = collectTypes(ast);
            expect(types).toContain('math_inline');
        });

        test('math block → math_block node', () => {
            const m = createMdFull();
            const ast = m.parse('```math\nx=1\n```\n');
            const types = collectTypes(ast);
            expect(types).toContain('math_block');
        });

        test('footnotes → footnote_ref node', () => {
            const m = createMdFull();
            const ast = m.parse('foo[^a]\n\n[^a]: note\n');
            const types = collectTypes(ast);
            expect(types).toContain('footnote_ref');
        });

        test('wikilinks render to an anchor', () => {
            const m = createMdFull();
            const html = m.renderHtml('[[Home]]\n');
            expect(html).toContain('href=');
        });
    });
});

describe('bundles/md-full — inline-pass install order', () => {
    const EXPECTED_ORDER = [
        'mdFrontmatter', 'mdFootnotes', 'mdMath', 'mdSubsuper', 'mdHighlight',
        'mdEmoji', 'mdToc', 'mdWikilinks', 'mdAdmonitions', 'mdMermaid'
    ];

    // Both the test helper and the source descriptor (resolved from a fresh
    // runtime so the shared package-level `md` singleton stays untouched).
    const builders = [
        ['createMdFull()', () => createMdFull()],
        ['mdFullBundle (fresh runtime)', () => bootstrapMd().mdFull]
    ];

    for (const [label, build] of builders) {
        describe(label, () => {
            test('installs the extras in the exact canonical order', () => {
                const names = build().extensions.map(e => e.name);
                expect(names).toEqual(EXPECTED_ORDER);
                expect(names.indexOf('mdMath')).toBeLessThan(names.indexOf('mdSubsuper'));
                expect(names.indexOf('mdFootnotes')).toBeLessThan(names.indexOf('mdSubsuper'));
            });

            test('inline math is not split by the sub/sup pass', () => {
                expect(build().renderHtml('$x^{2}y^{3}$\n'))
                    .toBe('<p><span class="math inline">x^{2}y^{3}</span></p>\n');
            });

            test('footnote references survive the sub/sup pass', () => {
                const ast = build().parse('a[^1]b[^2]\n\n[^1]: x\n[^2]: y\n');
                const types = [];
                const stack = [ast];
                while (stack.length) {
                    const n = stack.pop();
                    types.push(n.type);
                    let c = n.firstChild;
                    while (c) { stack.push(c); c = c.next; }
                }
                expect(types.filter(t => t === 'footnote_ref').length).toBe(2);
                expect(types).not.toContain('superscript');
            });

            test('non-regression: sub/sup, highlight and math+highlight', () => {
                const m = build();
                expect(m.renderHtml('x^2^\n')).toContain('<sup>2</sup>');
                expect(m.renderHtml('H~2~O\n')).toContain('<sub>2</sub>');
                expect(m.renderHtml('==m==\n')).toContain('<mark>m</mark>');
                const html = m.renderHtml('$a==b==c$\n');
                expect(html.match(/class="math inline"/g).length).toBe(1);
                expect(html).not.toContain('<mark>');
            });
        });
    }

    test('mdFullBundle descriptor lists the extras in the same order (dependencies and deps)', () => {
        expect(mdFullBundle.dependencies).toEqual(['md', ...EXPECTED_ORDER]);
        expect(mdFullBundle.deps.slice(1).map(d => d.name)).toEqual(EXPECTED_ORDER);
    });
});

function collectTypes(root) {
    const out = new Set();
    const stack = [root];
    while (stack.length) {
        const n = stack.pop();
        out.add(n.type);
        let c = n.firstChild;
        while (c) { stack.push(c); c = c.next; }
    }
    return out;
}
