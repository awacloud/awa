// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdMath, mdSubsuper, mdHighlight, splitMath, expandMathInAst, createMd, walk } from '../../tests/_helpers/build.js';

describe('mdMath', () => {
    test('inline math wraps in span.math.inline', () => {
        const m = createMd().use(mdMath);
        const html = m.renderHtml('Euler : $e^{i\\pi}+1=0$ done.\n');
        expect(html).toContain('<span class="math inline">e^{i\\pi}+1=0</span>');
    });

    test('display math wraps in div.math.display', () => {
        const m = createMd().use(mdMath);
        const html = m.renderHtml('Before $$a^2 + b^2 = c^2$$ after.\n');
        expect(html).toContain('<div class="math display">a^2 + b^2 = c^2</div>');
    });

    test('fenced math code block becomes display math', () => {
        const m = createMd().use(mdMath);
        const html = m.renderHtml('```math\n\\int_0^1 x\\,dx\n```\n');
        expect(html).toContain('<div class="math display">');
        expect(html).toContain('\\int_0^1 x\\,dx');
    });

    test('escapes HTML special chars inside math literals', () => {
        const m = createMd().use(mdMath);
        const html = m.renderHtml('$a&b$\n');
        expect(html).toContain('a&amp;b');
    });

    test('leaves stray single dollar alone', () => {
        const m = createMd().use(mdMath);
        const html = m.renderHtml('Cost $5 today\n');
        expect(html).toBe('<p>Cost $5 today</p>\n');
    });

    test('splitMath returns null on plain text', () => {
        expect(splitMath('hello world')).toBeNull();
        expect(splitMath('a $unfinished')).toBeNull();
    });

    test('splitMath returns segments for inline math', () => {
        const parts = splitMath('a $x$ b');
        expect(parts).toEqual([
            { kind: 'text', value: 'a ' },
            { kind: 'math_inline', value: 'x' },
            { kind: 'text', value: ' b' }
        ]);
    });

    test('multiple math segments in one paragraph', () => {
        const m = createMd().use(mdMath);
        const html = m.renderHtml('$a$ and $b$ and $$c$$\n');
        expect(html).toContain('<span class="math inline">a</span>');
        expect(html).toContain('<span class="math inline">b</span>');
        expect(html).toContain('<div class="math display">c</div>');
    });
});

// BL-2015 — the inline / display math nodes the extra builds are trusted;
// author raw HTML in the same document is not.
describe('mdMath — trusted nodes under the safe default', () => {
    const FIXTURE = 'Euler : $e^{i\\pi}+1=0$ done.\n\n```math\n\\int_0^1 x\\,dx\n```\n';

    test('benign output under the default equals { safe: false }', () => {
        const m = createMd().use(mdMath);
        const html = m.renderHtml(FIXTURE);
        expect(html).toContain('<span class="math inline">');
        expect(html).toContain('<div class="math display">');
        expect(html).toBe(m.renderHtml(FIXTURE, { safe: false }));
    });

    test('author raw HTML in the same document is still stripped', () => {
        const m = createMd().use(mdMath);
        const src = 'Euler : $a<b$ <img src=y onerror=alert(2)>\n\n<img src=x onerror=alert(1)>\n';
        const html = m.renderHtml(src);
        expect(html).toContain('<span class="math inline">a&lt;b</span>');
        expect(html).not.toContain('<img');
        expect(m.renderHtml(src, { safe: false })).toContain('<img src=x onerror');
    });
});

describe('mdMath — a math span takes precedence over inline markup (like a code span)', () => {
    const mathOf = (m, src) => {
        const out = [];
        for (const { node, entering } of walk(m.parse(src))) {
            if (entering && (node.type === 'math_inline' || node.type === 'math_block')) out.push([node.type, node.literal]);
        }
        return out;
    };
    const types = (m, src) => {
        const out = [];
        for (const { node, entering } of walk(m.parse(src))) if (entering) out.push(node.type);
        return out;
    };

    test('a tilde pair inside inline math is not strikethrough, whatever the install order', () => {
        for (const m of [createMd().use(mdMath), createMd().use(mdSubsuper, mdMath), createMd().use(mdMath, mdSubsuper, mdHighlight)]) {
            expect(mathOf(m, 'Water: $H~2~O$.\n')).toEqual([['math_inline', 'H~2~O']]);
            expect(types(m, 'Water: $H~2~O$.\n')).not.toContain('strikethrough');
            expect(types(m, 'Water: $H~2~O$.\n')).not.toContain('subscript');
        }
        expect(createMd().use(mdMath).renderHtml('$H~2~O$\n')).toBe('<p><span class="math inline">H~2~O</span></p>\n');
    });

    test('emphasis, links and display math spans are claimed too', () => {
        const m = createMd().use(mdMath);
        expect(mathOf(m, '$a*b*c$ and $[x](y)$ and $$x_1 + y_2$$\n'))
            .toEqual([['math_inline', 'a*b*c'], ['math_inline', '[x](y)'], ['math_block', 'x_1 + y_2']]);
        expect(types(m, '$a*b*c$ and $[x](y)$\n')).not.toContain('emph');
        expect(types(m, '$a*b*c$ and $[x](y)$\n')).not.toContain('link');
    });

    test('a code span opened before the dollar still wins; non-math dollars keep one text node', () => {
        const m = createMd().use(mdMath);
        expect(mathOf(m, '`a $b` c$\n')).toEqual([]);
        expect(types(m, 'Cost $5 today\n')).toEqual(['document', 'paragraph', 'text']);
    });

    test('escaped dollars stay literal; an escaped dollar inside a span is kept verbatim', () => {
        const m = createMd().use(mdMath);
        expect(m.renderHtml('Cost \\$5 and \\$10\n')).toBe('<p>Cost $5 and $10</p>\n');
        expect(mathOf(m, '$a\\$b$\n')).toEqual([['math_inline', 'a\\$b']]);
    });

    test('expandMathInAst on an AST parsed without the claim still splits text', () => {
        const ast = createMd().parse('Water: $H_2O$.\n');
        expandMathInAst(ast);
        const lits = [];
        for (const { node, entering } of walk(ast)) if (entering && node.type === 'math_inline') lits.push(node.literal);
        expect(lits).toEqual(['H_2O']);
    });

    test('without mdMath the core parse is unchanged', () => {
        expect(types(createMd(), '$H~2~O$\n')).toContain('strikethrough');
    });
});
