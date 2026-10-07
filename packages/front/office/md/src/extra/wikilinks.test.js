// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { mdWikilinks, defaultSlugify, createMd } from '../../tests/_helpers/build.js';

describe('mdWikilinks', () => {
    test('renders a simple [[Page]] link', () => {
        const m = createMd().use(mdWikilinks);
        const html = m.renderHtml('See [[Home]].\n');
        expect(html).toContain('<a href="home" title="Home">Home</a>');
    });

    test('renders [[Page Name]] with slugified destination', () => {
        const m = createMd().use(mdWikilinks);
        const html = m.renderHtml('Go to [[My Page]].\n');
        expect(html).toContain('<a href="my-page" title="My Page">My Page</a>');
    });

    test('renders [[Page|alias]] with alias as text', () => {
        const m = createMd().use(mdWikilinks);
        const html = m.renderHtml('[[Home|Back home]]\n');
        expect(html).toContain('<a href="home" title="Home">Back home</a>');
    });

    test('renders [[Page#section|alias]]', () => {
        const m = createMd().use(mdWikilinks);
        const html = m.renderHtml('[[Page#Intro|intro]]\n');
        expect(html).toContain('<a href="page#intro" title="Page">intro</a>');
    });

    test('leaves single [Page] alone', () => {
        const m = createMd().use(mdWikilinks);
        const html = m.renderHtml('[not wiki]\n');
        expect(html).toBe('<p>[not wiki]</p>\n');
    });

    test('defaultSlugify lowercases and dashes', () => {
        expect(defaultSlugify('Hello World')).toBe('hello-world');
        expect(defaultSlugify('  Foo BAR  ')).toBe('foo-bar');
        expect(defaultSlugify('A_B+C')).toBe('a-b-c');
    });

    test('multiple wikilinks in one paragraph', () => {
        const m = createMd().use(mdWikilinks);
        const html = m.renderHtml('[[A]] and [[B]].\n');
        expect(html).toContain('<a href="a"');
        expect(html).toContain('<a href="b"');
    });

    test('custom slugify option', () => {
        const m = createMd();
        m.use({ name: 'wk', install(md) {
            mdWikilinks.install(md, { slugify: s => s.toUpperCase().replace(/\s+/g, '_') });
        }});
        const html = m.renderHtml('[[my page]]\n');
        expect(html).toContain('href="MY_PAGE"');
    });
});
