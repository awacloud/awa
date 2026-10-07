// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { md, createMd, mdEmoji, walk, T_TEXT } from '../tests/_helpers/build.js';
import { ContractError } from '../tests/_helpers/build.js';

describe('md façade', () => {
    test('parse + render roundtrip basic', () => {
        const html = md.renderHtml('# Title\n\nA paragraph.\n');
        expect(html).toBe('<h1>Title</h1>\n<p>A paragraph.</p>\n');
    });

    test('parse rejects non-string', () => {
        expect(() => md.parse(42)).toThrow(ContractError);
    });

    test('parse attaches refmap to document.data', () => {
        const ast = md.parse('[foo]: /url "t"\n\n[foo]\n');
        expect(ast.data).toBeDefined();
        expect(ast.data.refmap).toBeDefined();
        // normalized key
        expect(ast.data.refmap['FOO']).toEqual({ destination: '/url', title: 't' });
    });

    test('createMd produces isolated instances', () => {
        const a = createMd();
        const b = createMd();
        expect(a).not.toBe(b);
    });

    test('.use registers extension and is idempotent', () => {
        const m = createMd();
        let calls = 0;
        const ext = { name: 'foo', install() { calls++; } };
        m.use(ext); m.use(ext);
        expect(calls).toBe(1);
        expect(m.extensions.length).toBe(1);
    });

    test('.use rejects malformed extension', () => {
        const m = createMd();
        expect(() => m.use(null)).toThrow(ContractError);
        expect(() => m.use({ name: 'x' })).toThrow(ContractError);
    });
});

describe('md façade — renderMarkdown(string) parses with md.parse (extension passes included)', () => {
    // Test-local extension: wraps md.parse and upper-cases every text literal.
    const upperExt = {
        name: 'test-upper',
        install(m) {
            const original = m.parse;
            m.parse = function (text) {
                const ast = original.call(m, text);
                for (const ev of walk(ast)) {
                    if (ev.entering && ev.node.type === T_TEXT) ev.node.literal = ev.node.literal.toUpperCase();
                }
                return ast;
            };
        }
    };

    test('a parse-wrapping extension is applied to a string argument', () => {
        const m = createMd().use(upperExt);
        const viaString = m.renderMarkdown('a *b*\n');
        expect(viaString).toBe('A *B*\n');
        expect(viaString).toBe(m.renderMarkdown(m.parse('a *b*\n')));
    });

    test('createMd().use(mdEmoji): string path equals parse path', () => {
        const m = createMd().use(mdEmoji);
        expect(m.renderMarkdown(':smile:\n')).toBe(m.renderMarkdown(m.parse(':smile:\n')));
        expect(m.renderMarkdown(':smile:\n')).toBe('\u{1F604}\n');
    });

    test('core instance without extension is unchanged for a CommonMark sample', () => {
        const text = '# Hi\n\nA *paragraph*.\n';
        expect(md.renderMarkdown(text)).toBe('# Hi\n\nA *paragraph*.\n');
        expect(md.renderMarkdown(text)).toBe(md.renderMarkdown(md.parse(text)));
    });

    test('an AST argument is not re-parsed', () => {
        const m = createMd();
        const ast = m.parse('x\n');
        let calls = 0;
        const original = m.parse;
        m.parse = function (t) { calls++; return original.call(m, t); };
        expect(m.renderMarkdown(ast)).toBe('x\n');
        expect(calls).toBe(0);
        // control: a string argument does go through md.parse
        m.renderMarkdown('y\n');
        expect(calls).toBe(1);
    });
});
