// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdAdmonitions, preprocessMkdocsAdmonitions, createMd } from '../../tests/_helpers/build.js';

describe('mdAdmonitions', () => {
    test('GitHub callout > [!NOTE] renders as admonition div', () => {
        const m = createMd().use(mdAdmonitions);
        const html = m.renderHtml('> [!NOTE]\n> Body line.\n');
        expect(html).toContain('<div class="admonition admonition-note">');
        expect(html).toContain('<p class="admonition-title">Note</p>');
        expect(html).toContain('Body line.');
        expect(html).toContain('</div>');
    });

    test('GitHub callout > [!WARNING] uses warning kind', () => {
        const m = createMd().use(mdAdmonitions);
        const html = m.renderHtml('> [!WARNING]\n> Careful !\n');
        expect(html).toContain('admonition-warning');
    });

    test('mkdocs !!! note renders', () => {
        const m = createMd().use(mdAdmonitions);
        const html = m.renderHtml('!!! note\n    Body here.\n');
        expect(html).toContain('admonition-note');
        expect(html).toContain('Body here.');
    });

    test('mkdocs !!! warning "Custom title" uses title', () => {
        const m = createMd().use(mdAdmonitions);
        const html = m.renderHtml('!!! warning "Heads up"\n    Be careful.\n');
        expect(html).toContain('admonition-warning');
        expect(html).toContain('Heads up');
    });

    test('preprocessMkdocsAdmonitions rewrites !!! into > marker', () => {
        const out = preprocessMkdocsAdmonitions('!!! tip\n    line\n');
        expect(out).toContain('> [!TIP]');
        expect(out).toContain('> line');
    });

    test('unknown kind is left alone (mkdocs)', () => {
        const out = preprocessMkdocsAdmonitions('!!! unknown\n    body\n');
        expect(out).toBe('!!! unknown\n    body\n');
    });

    test('unknown kind is left alone (github)', () => {
        const m = createMd().use(mdAdmonitions);
        const html = m.renderHtml('> [!FOO]\n> body\n');
        expect(html).not.toContain('admonition');
    });

    test('plain blockquote not affected', () => {
        const m = createMd().use(mdAdmonitions);
        const html = m.renderHtml('> just a quote\n');
        expect(html).not.toContain('admonition');
        expect(html).toContain('<blockquote>');
    });

    test('all five core kinds round-trip', () => {
        const m = createMd().use(mdAdmonitions);
        for (const k of ['note', 'tip', 'warning', 'caution', 'important']) {
            const html = m.renderHtml('> [!' + k.toUpperCase() + ']\n> x\n');
            expect(html).toContain('admonition-' + k);
        }
    });
});

// BL-2015 — the opener / closer `html_block` nodes the extra builds are
// trusted; author raw HTML in the same document is not.
describe('mdAdmonitions — trusted nodes under the safe default', () => {
    const FIXTURE = '> [!NOTE]\n> Body line.\n\n!!! warning "Careful"\n    Body here.\n';

    test('benign output under the default equals { safe: false }', () => {
        const m = createMd().use(mdAdmonitions);
        const html = m.renderHtml(FIXTURE);
        expect(html).toContain('<div class="admonition admonition-note">');
        expect(html).toContain('<div class="admonition admonition-warning">');
        expect(html).toBe(m.renderHtml(FIXTURE, { safe: false }));
    });

    test('author raw HTML in the same document is still stripped', () => {
        const m = createMd().use(mdAdmonitions);
        const src = '> [!NOTE]\n> Body <img src=y onerror=alert(2)> line.\n\n<img src=x onerror=alert(1)>\n';
        const html = m.renderHtml(src);
        expect(html).toContain('<div class="admonition admonition-note">');
        expect(html).not.toContain('<img');
        expect(m.renderHtml(src, { safe: false })).toContain('<img src=x onerror');
    });
});
