// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for the committed two-surface `dist/` bundles generated
 * by `tools/generate-bundles.mjs`. Each descriptor must :
 *
 *   - expose the canonical `{ name, dependencies, factory }` shape ;
 *   - resolve to a working `md` instance (parse + render smoke) ;
 *   - reach parity with the source `mdFullBundle` descriptor and with the test helper `createMdFull()` (`tests/_helpers/build.js`) on CommonMark fixtures and extras.
 *
 * Relocated from `src/bundles/prebuilt/prebuilds.test.js` when the prebuilt
 * tree moved to `dist/standalone` (bundled variant) + `dist/build` (package
 * variant). The `-package` variants now declare four fw dependencies
 * (`secPolicy` is part of `fw_require` — `sanitize` depends on it), so the
 * injected `fwArgs` list carries `secPolicy` too.
 *
 * @module md/tests/dist-bundles.integration.test
 */

import { describe, test, expect } from 'bun:test';

import { mdBundled } from '../dist/standalone/md.js';
import { mdPackage } from '../dist/build/md.js';
import { mdFullBundled } from '../dist/standalone/md-full.js';
import { mdFullPackage } from '../dist/build/md-full.js';

import { mdFullBundle } from '../src/bundles/md-full.js';
import { md as defaultMd, createMdFull } from './_helpers/build.js';

import { secPolicy } from '@awacloud/fw/dom/rendering/secPolicy.js';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';
import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';
import { url } from '@awacloud/fw/io/codec/url.js';

const fwArgs = [secPolicy, sanitize, htmlEntities, url];

const ALL = [
    { name: 'mdBundled',      desc: mdBundled,      variant: 'bundled', extras: false },
    { name: 'mdPackage',      desc: mdPackage,      variant: 'package', extras: false },
    { name: 'mdFullBundled',  desc: mdFullBundled,  variant: 'bundled', extras: true  },
    { name: 'mdFullPackage',  desc: mdFullPackage,  variant: 'package', extras: true  }
];

describe('prebuilt descriptor shape', () => {
    for (const { name, desc, variant } of ALL) {
        test(`${name} has { name, dependencies, factory }`, () => {
            expect(typeof desc).toBe('object');
            expect(desc.name).toBe(name);
            expect(Array.isArray(desc.dependencies)).toBe(true);
            expect(typeof desc.factory).toBe('function');
            if (variant === 'package') {
                expect(desc.dependencies).toEqual(['secPolicy', 'sanitize', 'htmlEntities', 'url']);
            } else {
                expect(desc.dependencies).toEqual([]);
            }
        });
    }
});

describe('prebuilt -bundled variants are invocable with no args', () => {
    test('mdBundled.factory() returns a working md', () => {
        const md = mdBundled.factory();
        expect(typeof md.parse).toBe('function');
        expect(typeof md.renderHtml).toBe('function');
        expect(md.renderHtml('# Hi\n')).toBe('<h1>Hi</h1>\n');
    });

    test('mdFullBundled.factory() returns md with extras installed', () => {
        const md = mdFullBundled.factory();
        const src = 'Hello :smile: and ==marked== with H~2~O and $x$\n';
        const html = md.renderHtml(src);
        expect(html).toContain('😄');
        expect(html).toContain('<mark>marked</mark>');
        expect(html).toContain('<span class="math inline">x</span>');
        // mdSubsuper lowers its nodes to trusted HTML nodes, so the safe
        // default keeps the tags: no `{ safe: false }` opt-out needed.
        expect(html).toContain('<sub>2</sub>');
    });
});

describe('prebuilt -package variants are invocable with fw injected', () => {
    test('mdPackage.factory(...fw) returns a working md', () => {
        const md = mdPackage.factory(...fwArgs);
        expect(md.renderHtml('# Hi\n')).toBe('<h1>Hi</h1>\n');
        expect(md.renderHtml('A **bold** _emph_.\n'))
            .toBe('<p>A <strong>bold</strong> <em>emph</em>.</p>\n');
    });

    test('mdFullPackage.factory(...fw) returns md with extras installed', () => {
        const md = mdFullPackage.factory(...fwArgs);
        const ast = md.parse('---\ntitle: t\n---\n\n> [!NOTE]\n> body[^a]\n\n[^a]: a note\n');
        expect(ast.data.frontmatter.lang).toBe('yaml');
        const html = md.render(ast);
        expect(html).toContain('admonition-note');
        expect(html).toContain('footnote-ref');
    });
});

describe('prebuilt smoke — parse + render markdown roundtrip', () => {
    test('mdBundled supports renderMarkdown', () => {
        const md = mdBundled.factory();
        const out = md.renderMarkdown('# Hi\n\nA *paragraph*.\n');
        expect(typeof out).toBe('string');
        expect(out.length).toBeGreaterThan(0);
        expect(out).toContain('Hi');
        expect(out).toContain('paragraph');
    });

    test('mdFullPackage handles wikilinks + mermaid', () => {
        const md = mdFullPackage.factory(...fwArgs);
        const html = md.renderHtml('[[Home]]\n\n```mermaid\nA-->B\n```\n');
        expect(html).toContain('<a href="home"');
        expect(html).toContain('<div class="mermaid">');
    });
});

describe('parity with source descriptors', () => {
    // CommonMark sample fixtures covering headings, emphasis, lists,
    // code spans, links, blockquotes and hard breaks.
    const FIXTURES = [
        '# H1\n',
        '## H2\n\nparagraph\n',
        '**bold** and *emph* and `code`.\n',
        '- a\n- b\n- c\n',
        '1. one\n2. two\n',
        '> quoted\n> line two\n',
        '[link](http://example.com)\n',
        'line one  \nline two\n',
        '```js\nconst x = 1;\n```\n'
    ];

    test('mdBundled matches defaultMd on CommonMark samples', () => {
        const mdA = mdBundled.factory();
        for (const src of FIXTURES) {
            expect(mdA.renderHtml(src)).toBe(defaultMd.renderHtml(src));
        }
    });

    test('mdPackage matches defaultMd on CommonMark samples', () => {
        const mdA = mdPackage.factory(...fwArgs);
        for (const src of FIXTURES) {
            expect(mdA.renderHtml(src)).toBe(defaultMd.renderHtml(src));
        }
    });

    test('mdFullBundled matches createMdFull() on extras + commonmark', () => {
        const mdA = mdFullBundled.factory();
        const mdB = createMdFull();
        for (const src of FIXTURES) {
            expect(mdA.renderHtml(src)).toBe(mdB.renderHtml(src));
        }
        // Extras parity :
        const extraSrc = 'Hello :smile: ==m== H~2~O $x$\n';
        expect(mdA.renderHtml(extraSrc)).toBe(mdB.renderHtml(extraSrc));
    });

    test('mdFullPackage matches createMdFull() on extras + commonmark', () => {
        const mdA = mdFullPackage.factory(...fwArgs);
        const mdB = createMdFull();
        for (const src of FIXTURES) {
            expect(mdA.renderHtml(src)).toBe(mdB.renderHtml(src));
        }
    });

    // The math-before-subsuper order, the table-pipe escaping and the
    // single-tilde run reach the committed dist only through a regeneration:
    // these legs fail on a stale `dist/**`.
    const ORDER_SRC = '$x^{2}y^{3}$ and a[^1]b[^2]\n\n[^1]: x\n[^2]: y\n';
    const PIPE_SRC = '| a\\|b |\n|---|\n';
    const TILDE_SRC = '~x y~ and ~~z~~\n';

    test('mdFullBundled keeps `^` inside math and matches createMdFull()', () => {
        const mdA = mdFullBundled.factory();
        const htmlA = mdA.renderHtml(ORDER_SRC);
        expect(htmlA).toBe(createMdFull().renderHtml(ORDER_SRC));
        expect(htmlA).toContain('<span class="math inline">x^{2}y^{3}</span>');
    });

    test('mdFullPackage keeps `^` inside math and matches createMdFull()', () => {
        const mdA = mdFullPackage.factory(...fwArgs);
        const htmlA = mdA.renderHtml(ORDER_SRC);
        expect(htmlA).toBe(createMdFull().renderHtml(ORDER_SRC));
        expect(htmlA).toContain('<span class="math inline">x^{2}y^{3}</span>');
    });

    const SURFACES = [
        { name: 'mdBundled',     make: () => mdBundled.factory(),              ref: () => defaultMd },
        { name: 'mdPackage',     make: () => mdPackage.factory(...fwArgs),     ref: () => defaultMd },
        { name: 'mdFullBundled', make: () => mdFullBundled.factory(),          ref: () => createMdFull() },
        { name: 'mdFullPackage', make: () => mdFullPackage.factory(...fwArgs), ref: () => createMdFull() }
    ];
    for (const { name, make, ref } of SURFACES) {
        test(`${name} renderMarkdown escapes cell pipes like the source`, () => {
            expect(make().renderMarkdown(PIPE_SRC)).toBe(ref().renderMarkdown(PIPE_SRC));
        });
        test(`${name} renderMarkdown keeps single and double tildes`, () => {
            expect(make().renderMarkdown(TILDE_SRC)).toBe('~x y~ and ~~z~~\n');
        });
    }
});

describe('dist/build/index.js barrel', () => {
    test('re-exports the modules array and every named descriptor', async () => {
        const barrel = await import('../dist/build/index.js');

        // The four registration arrays.
        expect(Array.isArray(barrel.modules)).toBe(true);
        expect(Array.isArray(barrel.fw_require)).toBe(true);
        expect(Array.isArray(barrel.extras)).toBe(true);
        expect(Array.isArray(barrel.bundle)).toBe(true);

        // A representative sample of named module descriptors, each carrying
        // the canonical `{ name, dependencies, factory }` shape.
        for (const name of ['mdMod', 'inlineParser', 'blockParser', 'mdNode', 'mdFullBundle']) {
            const desc = barrel[name];
            expect(typeof desc).toBe('object');
            expect(typeof desc.name).toBe('string');
            expect(Array.isArray(desc.dependencies)).toBe(true);
            expect(typeof desc.factory).toBe('function');
        }

        // mdFullBundle re-exported through the barrel is the same descriptor.
        expect(barrel.mdFullBundle).toBe(mdFullBundle);
    });
});
