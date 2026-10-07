// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Fuzz / malformed-input tests — Markdown is supposed to parse anything
 * that is a string. The parser must throw a typed `ContractError` only
 * for non-string inputs, and never stack-overflow on pathological but
 * legal strings.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as mdMods from './_helpers/build.js';
import { ContractError } from './_helpers/build.js';
import { buildMd } from './_helpers/build.js';

const runtime = new ModuleRuntime();
for (const m of mdMods.modules) runtime.register(m);

function expectThrowsContract(fn) {
    let caught = null;
    try { fn(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ContractError);
    return caught;
}

describe('fuzz — md.parse never throws on string input', () => {
    test('empty string → empty document', () => {
        const md = buildMd();
        const ast = md.parse('');
        expect(ast.type).toBe('document');
        expect(ast.firstChild).toBeNull();
    });

    test('garbage control bytes do not throw', () => {
        const md = buildMd();
        const junk = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f';
        expect(() => md.parse(junk)).not.toThrow();
    });

    test('lone surrogates (broken unicode) do not throw', () => {
        const md = buildMd();
        // Lone high surrogate, lone low surrogate.
        const broken = '\uD83D' + 'plain' + '\uDC00';
        expect(() => md.parse(broken)).not.toThrow();
    });

    test('1 MB string does not throw', () => {
        const md = buildMd();
        const big = 'x'.repeat(1_000_000);
        expect(() => md.parse(big)).not.toThrow();
    });

    test('huge paragraph (100k chars) does not throw', () => {
        const md = buildMd();
        const big = 'x'.repeat(100_000);
        const ast = md.parse(big);
        expect(ast.type).toBe('document');
    });

    test('deeply nested blockquote does not stack-overflow (limits disabled)', () => {
        const md = buildMd({ maxDepth: Infinity, maxNodes: Infinity });
        const src = '> '.repeat(10000) + 'text\n';
        expect(() => md.parse(src)).not.toThrow();
    });

    test('deeply nested blockquote throws md/limit-exceeded with default limits', () => {
        const md = buildMd();
        const src = '> '.repeat(2000) + 'text\n';
        let caught = null;
        try { md.parse(src); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('md/limit-exceeded');
        expect(caught.context && caught.context.kind).toBe('maxDepth');
    });

    test('custom maxDepth=10 trips on 20 blockquotes', () => {
        const md = buildMd({ maxDepth: 10 });
        const src = '> '.repeat(20) + 'text\n';
        let caught = null;
        try { md.parse(src); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('md/limit-exceeded');
    });

    test('huge URL throws md/limit-exceeded', () => {
        const md = buildMd({ maxUrlLength: 100 });
        const longUrl = 'https://example.com/' + 'a'.repeat(200);
        let caught = null;
        try { md.parse('[x](' + longUrl + ')\n'); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('md/limit-exceeded');
        expect(caught.context && caught.context.kind).toBe('maxUrlLength');
    });

    test('malformed GFM table does not throw', () => {
        const md = buildMd();
        const src = '| h |\n| invalid\n';
        expect(() => md.parse(src)).not.toThrow();
    });

    test('unclosed code fence does not throw', () => {
        const md = buildMd();
        const src = '```js\nlet x = 1;\n';
        expect(() => md.parse(src)).not.toThrow();
    });

    test('only Markdown special chars does not throw', () => {
        const md = buildMd();
        const src = '*_~`#>[]()!=-|\\\n';
        expect(() => md.parse(src)).not.toThrow();
    });

    test('CR-only newlines do not throw', () => {
        const md = buildMd();
        expect(() => md.parse('a\rb\rc')).not.toThrow();
    });
});

describe('fuzz — md.parse throws ContractError on non-string input', () => {
    const md = buildMd();
    test('number', () => { expectThrowsContract(() => md.parse(42)); });
    test('null', () => { expectThrowsContract(() => md.parse(null)); });
    test('undefined', () => { expectThrowsContract(() => md.parse(undefined)); });
    test('array', () => { expectThrowsContract(() => md.parse(['a'])); });
    test('object', () => { expectThrowsContract(() => md.parse({})); });
    test('boolean', () => { expectThrowsContract(() => md.parse(true)); });
});

describe('fuzz — typed error class reachable', () => {
    test('ContractError exported and instanceable', () => {
        expect(typeof ContractError).toBe('function');
        const e = new ContractError('md/x', 'msg');
        expect(e).toBeInstanceOf(Error);
        expect(e.code).toBe('md/x');
    });
});
