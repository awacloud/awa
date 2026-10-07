// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdMermaid, rewriteMermaidHtml, createMd } from '../../tests/_helpers/build.js';

describe('mdMermaid', () => {
    test('rewrites fenced mermaid block to div', () => {
        const m = createMd().use(mdMermaid);
        const html = m.renderHtml('```mermaid\ngraph TD;\nA-->B;\n```\n');
        expect(html).toContain('<div class="mermaid">');
        expect(html).toContain('graph TD;');
        expect(html).toContain('A--&gt;B;');
        expect(html).not.toContain('<pre><code');
    });

    test('keeps HTML entities escaped inside the diagram (textContent decodes them)', () => {
        const m = createMd().use(mdMermaid);
        const html = m.renderHtml('```mermaid\nA & B < C\n```\n');
        expect(html).toContain('A &amp; B &lt; C');
    });

    test('rewriteMermaidHtml is a pure transform', () => {
        const out = rewriteMermaidHtml('<pre><code class="language-mermaid">x-&gt;y</code></pre>');
        expect(out).toBe('<div class="mermaid">x-&gt;y</div>');
    });

    test('leaves other fenced code blocks alone', () => {
        const m = createMd().use(mdMermaid);
        const html = m.renderHtml('```js\nconst x = 1;\n```\n');
        expect(html).toContain('<pre><code class="language-js">');
    });

    test('handles multiple mermaid blocks', () => {
        const m = createMd().use(mdMermaid);
        const html = m.renderHtml('```mermaid\nA\n```\n\n```mermaid\nB\n```\n');
        const matches = html.match(/<div class="mermaid">/g);
        expect(matches.length).toBe(2);
    });

    test('passes through when no mermaid blocks present', () => {
        const m = createMd().use(mdMermaid);
        const html = m.renderHtml('plain paragraph\n');
        expect(html).toBe('<p>plain paragraph</p>\n');
    });
});

// BL-2035 — the Mermaid rewrite runs on the HTML AFTER `render` (and after
// the `sanitize` pass), so the diagram body must stay HTML-escaped inside
// the container: Mermaid's runtime reads `textContent`, which decodes the
// entities. Assert the TAG token, never the payload word.
describe('mdMermaid — hostile fence bodies stay inert (BL-2035)', () => {
    const PAYLOADS = [
        '<img src=x onerror=alert(1)>',
        '</div><script>alert(1)</script>'
    ];
    const OPTION_SETS = [
        ['default options', undefined],
        ['{ safe: true }', { safe: true }],
        ['{ sanitize: true }', { sanitize: true }],
        ['{ safe: true, sanitize: true }', { safe: true, sanitize: true }],
        ['{ safe: false }', { safe: false }]
    ];
    const LIVE_EVENT_ATTR = /<[^>]*\son\w+\s*=/i;

    for (const payload of PAYLOADS) {
        for (const [label, opts] of OPTION_SETS) {
            test(label + ' — ' + payload, () => {
                const m = createMd().use(mdMermaid);
                const html = m.renderHtml('```mermaid\n' + payload + '\n```\n', opts);
                expect(html).toContain('<div class="mermaid">');
                expect(html).not.toContain('<img');
                expect(html).not.toContain('<script');
                expect(html).not.toMatch(LIVE_EVENT_ATTR);
                // Exactly one container closes: the payload's `</div>` is text.
                expect(html.split('</div>').length - 1).toBe(1);
            });
        }
    }
});

describe('mdMermaid — benign parity', () => {
    /** Decodes the entities `escapeHtml` emits (plus `&#39;`), as `textContent` would. */
    function decodeEntities(s) {
        return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&');
    }

    test('a plain diagram keeps its body escaped and its textContent equal to the source', () => {
        const m = createMd().use(mdMermaid);
        const html = m.renderHtml('```mermaid\ngraph TD; A-->B\n```\n');
        expect(html).toBe('<div class="mermaid">graph TD; A--&gt;B\n</div>\n');
        const body = /<div class="mermaid">([\s\S]*?)<\/div>/.exec(html)[1];
        expect(decodeEntities(body)).toBe('graph TD; A-->B\n');
    });
});
