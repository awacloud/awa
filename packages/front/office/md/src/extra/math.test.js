// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdMath, splitMath, createMd } from '../../tests/_helpers/build.js';

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
