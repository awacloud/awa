// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration test — wires the md factories through fw's `ModuleRuntime`
 * and exercises parse/render/round-trip flows on a varied corpus.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';
import { url as fwUrl } from '@awacloud/fw/io/codec/url.js';
import { sanitize as fwSanitize } from '@awacloud/fw/dom/rendering/sanitize.js';
import { secPolicy } from '@awacloud/fw/dom/rendering/secPolicy.js';
import * as mdMods from './_helpers/build.js';
import { renderXml } from './_helpers/build.js';
import {
    buildMd, buildMdFull, expectAstEquivalent
} from './_helpers/build.js';

// Wire a runtime by hand (mirroring the ooxml integration test pattern).
const runtime = new ModuleRuntime();
runtime.register(htmlEntities);
runtime.register(fwUrl);
runtime.register(secPolicy);   // sanitize depends on secPolicy
runtime.register(fwSanitize);
for (const m of mdMods.modules) runtime.register(m);

const CORPUS = [
    { name: 'plain paragraph',    src: 'hello world\n', htmlNeedles: ['<p>hello world</p>'] },
    { name: 'two paragraphs',     src: 'first\n\nsecond\n', htmlNeedles: ['<p>first</p>', '<p>second</p>'] },
    { name: 'heading h1',         src: '# Title\n', htmlNeedles: ['<h1>Title</h1>'] },
    { name: 'heading h2 + body',  src: '## Section\n\nbody\n', htmlNeedles: ['<h2>Section</h2>', '<p>body</p>'] },
    { name: 'unordered list',     src: '- a\n- b\n- c\n', htmlNeedles: ['<ul>', '<li>a</li>'] },
    { name: 'ordered list',       src: '1. first\n2. second\n', htmlNeedles: ['<ol>', '<li>first</li>'] },
    { name: 'code block',         src: '```js\nlet x=1;\n```\n', htmlNeedles: ['<pre>', '<code class="language-js">'] },
    { name: 'inline code',        src: 'see `code` here\n', htmlNeedles: ['<code>code</code>'] },
    { name: 'link',               src: '[hi](http://example.com)\n', htmlNeedles: ['href="http://example.com"', '>hi</a>'] },
    { name: 'emphasis nested',    src: '*outer **inner** still*\n', htmlNeedles: ['<em>', '<strong>inner</strong>'] }
];

describe('md × fw runtime — parse / render / roundtrip', () => {
    test('runtime resolves the md façade', () => {
        const m = runtime.resolve('md');
        expect(typeof m.parse).toBe('function');
        expect(typeof m.renderHtml).toBe('function');
    });

    for (const { name, src, htmlNeedles } of CORPUS) {
        test(`parse + renderHtml — ${name}`, () => {
            const md = buildMd();
            const ast = md.parse(src);
            expect(ast.type).toBe('document');
            const html = md.renderHtml(src);
            for (const needle of htmlNeedles) expect(html).toContain(needle);
        });

        test(`renderMarkdown roundtrip — ${name}`, () => {
            const md = buildMd();
            const ast1 = md.parse(src);
            const mdOut = md.renderMarkdown(ast1);
            expect(typeof mdOut).toBe('string');
            const ast2 = md.parse(mdOut);
            expectAstEquivalent(ast1, ast2);
        });

        test(`renderXml — ${name}`, () => {
            const md = buildMd();
            const xml = renderXml(md.parse(src));
            expect(xml).toContain('<?xml');
            expect(xml).toContain('<document');
        });
    }

    test('GFM table renders + roundtrips', () => {
        const md = buildMd();
        const src = '| h1 | h2 |\n|----|----|\n| a  | b  |\n';
        const html = md.renderHtml(src);
        expect(html).toContain('<table>');
        expect(html).toContain('<th>h1</th>');
        const ast1 = md.parse(src);
        const ast2 = md.parse(md.renderMarkdown(ast1));
        // Both parses should at least contain a table node.
        expect(hasType(ast1, 'table')).toBe(true);
        expect(hasType(ast2, 'table')).toBe(true);
    });

    test('blockquote nested', () => {
        const md = buildMd();
        const html = md.renderHtml('> a\n>\n> > nested\n');
        expect(html).toContain('<blockquote>');
        expect(html.match(/<blockquote>/g).length).toBeGreaterThanOrEqual(2);
    });

    test('factories remain serialisable (worker-safe)', () => {
        for (const m of mdMods.modules) {
            expect(typeof m.factory.toString()).toBe('string');
            expect(m.factory.toString()).toContain('function');
        }
    });
});

describe('md-full × fw runtime — extras', () => {
    test('frontmatter YAML is extracted onto ast.data', () => {
        const m = buildMdFull();
        const ast = m.parse('---\ntitle: t\n---\n\nbody\n');
        expect(ast.data.frontmatter).toBeDefined();
        expect(ast.data.frontmatter.lang).toBe('yaml');
    });

    test('math inline + block', () => {
        const m = buildMdFull();
        const html = m.renderHtml('eq $a+b$ end\n');
        expect(html).toContain('math');
        const block = m.renderHtml('```math\nx=1\n```\n');
        expect(block).toContain('math');
    });

    test('footnotes', () => {
        const m = buildMdFull();
        const html = m.renderHtml('see[^a]\n\n[^a]: note\n');
        expect(html).toContain('footnote-ref');
    });

    test('wikilinks', () => {
        const m = buildMdFull();
        const html = m.renderHtml('[[Home]]\n');
        expect(html).toContain('href=');
    });
});

function hasType(root, type) {
    if (!root) return false;
    if (root.type === type) return true;
    let c = root.firstChild;
    while (c) {
        if (hasType(c, type)) return true;
        c = c.next;
    }
    return false;
}
