// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { parser } from '../../../src/dom/rendering/parser.js';
import { secPolicy } from '../../../src/dom/rendering/secPolicy.js';
import { compileParseResult, deriveName } from './lib/dom-codegen.js';
import { parseArgs } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const TOOLS_DIR = dirname(__filename);
const PKG_ROOT = resolve(TOOLS_DIR, '..', '..', '..');
const CLI = resolve(TOOLS_DIR, 'index.js');
const FIXTURE = resolve(TOOLS_DIR, '_fixtures', 'nav.html');

const p = parser.factory(secPolicy.factory());

/** Compile an HTML string to a factory function (in-memory, no disk I/O). */
function compile(html, name = 'tplTest') {
    const ast = p.fromHTML(html);
    const src = compileParseResult(ast, { fnName: name, esm: true });
    // Strip the export line and evaluate the function body.
    const body = src.replace(/\nexport default [^;]+;\n?$/, '');
     
    return { src, fn: new Function(body + `\nreturn ${name};`)() };
}

describe('deriveName', () => {
    test('converts filename to camelCase factory name', () => {
        expect(deriveName('tpl', 'nav.html')).toBe('tplNav');
        expect(deriveName('tpl', 'nav-bar.html')).toBe('tplNavBar');
        expect(deriveName('tpl', 'user_card.html')).toBe('tplUserCard');
    });
});

describe('codegen — static elements', () => {
    test('plain div', () => {
        const { fn, src } = compile('<div class="x">Hello</div>');
        expect(src).toContain("document.createElement(\"div\")");
        const el = fn();
        expect(el.tagName).toBe('DIV');
        expect(el.getAttribute('class')).toBe('x');
        expect(el.textContent).toBe('Hello');
    });

    test('attribute order is sorted (deterministic)', () => {
        const { src } = compile('<a href="/" title="t" class="c">x</a>');
        const idxClass = src.indexOf('"class"');
        const idxHref  = src.indexOf('"href"');
        const idxTitle = src.indexOf('"title"');
        expect(idxClass).toBeLessThan(idxHref);
        expect(idxHref).toBeLessThan(idxTitle);
    });
});

describe('codegen — text interpolation', () => {
    test('full replace', () => {
        const { fn } = compile('<p>#{name}</p>');
        expect(fn({ name: 'world' }).textContent).toBe('world');
    });

    test('prefix (append) #{v}', () => {
        const { fn } = compile('<p>Hello #{name}</p>');
        expect(fn({ name: 'world' }).textContent).toBe('Hello world');
    });

    test('suffix (prepend)', () => {
        const { fn } = compile('<p>#{name}!</p>');
        expect(fn({ name: 'hi' }).textContent).toBe('hi!');
    });

    test('missing variable keeps static base', () => {
        const { fn } = compile('<p>Hello #{name}</p>');
        expect(fn({}).textContent).toBe('Hello ');
    });

    test('both-sides #{v} keeps leading and trailing runs', () => {
        const { fn } = compile('<p>Loading #{pct}% done</p>');
        expect(fn({ pct: '42' }).textContent).toBe('Loading 42% done');
    });

    test('multiple interleaved vars render in order', () => {
        const { fn } = compile('<p>a#{v1}b#{v2}c</p>');
        expect(fn({ v1: '1', v2: '2' }).textContent).toBe('a1b2c');
    });
});

describe('codegen — attribute interpolation', () => {
    test('full replace href', () => {
        const { fn } = compile('<a href="#{url}">link</a>');
        const el = fn({ url: '/x' });
        expect(el.getAttribute('href')).toBe('/x');
    });

    test('prefix in attribute', () => {
        const { fn } = compile('<a class="btn #{kind}">k</a>');
        expect(fn({ kind: 'primary' }).getAttribute('class')).toBe('btn primary');
    });

    test('both-sides in style attribute keeps the trailing run', () => {
        const { fn } = compile(
            '<div style="display:block;inline-size:#{fillPct};block-size:10px"></div>');
        expect(fn({ fillPct: '60%' }).getAttribute('style'))
            .toBe('display:block;inline-size:60%;block-size:10px');
    });
});

describe('codegen — iteration', () => {
    test('iterate block builds N children', () => {
        const html = `<ul>
            <!-- $items -->
            <li>#{label}</li>
            <!-- items$ -->
        </ul>`;
        const { fn, src } = compile(html);
        expect(src).toContain('for (const');
        const ul = fn({ items: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] });
        expect(ul.tagName).toBe('UL');
        const lis = ul.querySelectorAll('li');
        expect(lis.length).toBe(3);
        expect(lis[0].textContent).toBe('a');
        expect(lis[2].textContent).toBe('c');
    });

    test('empty iterate produces no children', () => {
        const html = `<ul><!-- $items --><li>#{label}</li><!-- items$ --></ul>`;
        const { fn } = compile(html);
        const ul = fn({ items: [] });
        expect(ul.querySelectorAll('li').length).toBe(0);
    });

    test('missing iterate data does not throw', () => {
        const html = `<ul><!-- $items --><li>#{label}</li><!-- items$ --></ul>`;
        const { fn } = compile(html);
        const ul = fn({});
        expect(ul.querySelectorAll('li').length).toBe(0);
    });
});

describe('codegen — slots', () => {
    test('slot appended when provided', () => {
        const { fn, src } = compile('<div>${body}</div>');
        expect(src).toContain('slots');
        const child = document.createElement('span');
        child.textContent = 'inner';
        const el = fn({}, { body: child });
        expect(el.firstChild).toBe(child);
    });

    test('missing slot leaves element empty', () => {
        const { fn } = compile('<div>${body}</div>');
        const el = fn({});
        expect(el.children.length).toBe(0);
    });
});

describe('codegen — nesting + mixed', () => {
    test('nested elements with mixed text & interpolation', () => {
        const html = `<section class="card">
            <h2>#{title}</h2>
            <p>Hi #{name}</p>
        </section>`;
        const { fn } = compile(html);
        const el = fn({ title: 'Hello', name: 'Ana' });
        expect(el.querySelector('h2').textContent).toBe('Hello');
        expect(el.querySelector('p').textContent).toBe('Hi Ana');
    });

    test('iterate inside a wrapper', () => {
        const html = `<div class="list">
            <h3>#{title}</h3>
            <ul>
                <!-- $rows -->
                <li>#{label}</li>
                <!-- rows$ -->
            </ul>
        </div>`;
        const { fn } = compile(html);
        const el = fn({ title: 'Stats', rows: [{ label: 'a' }, { label: 'b' }] });
        expect(el.querySelector('h3').textContent).toBe('Stats');
        const lis = el.querySelectorAll('li');
        expect(lis[0].textContent).toBe('a');
        expect(lis[1].textContent).toBe('b');
    });
});

describe('codegen — null/false attribute omission (matches runtime)', () => {
    test('null bound value omits the attribute', () => {
        const { fn } = compile('<button disabled="#{flag}">x</button>');
        const el = fn({ flag: null });
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    test('false bound value omits the attribute', () => {
        const { fn } = compile('<button disabled="#{flag}">x</button>');
        const el = fn({ flag: false });
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    test('truthy bound value sets the attribute', () => {
        const { fn } = compile('<button disabled="#{flag}">x</button>');
        const el = fn({ flag: 'true' });
        expect(el.hasAttribute('disabled')).toBe(true);
    });

    test('static attribute (no binding) is always set', () => {
        const { fn } = compile('<a href="/x">k</a>');
        expect(fn().getAttribute('href')).toBe('/x');
    });
});

describe('codegen — SVG', () => {
    test('svg element + child emit createElementNS', () => {
        const { src, fn } = compile('<svg><circle cx="10" cy="10" r="5"></circle></svg>');
        expect(src).toContain('createElementNS');
        const root = fn();
        expect(root.namespaceURI).toBe('http://www.w3.org/2000/svg');
    });
});

describe('codegen — multi-root', () => {
    test('multi-root returns a DocumentFragment', () => {
        const { fn, src } = compile('<span>a</span><span>b</span>');
        expect(src).toContain('createDocumentFragment');
        const frag = fn();
        // Fragment has 2 element children.
        expect(frag.children.length).toBe(2);
    });
});

describe('codegen — synthetic text (mixed inline/block)', () => {
    test('mixed text and elements inside a container', () => {
        const html = '<div>hello <span>world</span> #{name}</div>';
        const { fn } = compile(html);
        const root = fn({ name: 'fw' });
        expect(root.textContent).toContain('hello');
        expect(root.textContent).toContain('world');
        expect(root.textContent).toContain('fw');
    });
});

describe('codegen — CJS load', () => {
    test('module.exports = tplFoo loads in a synthetic CJS sandbox', () => {
        const ast = p.fromHTML('<p>hi</p>');
        const src = compileParseResult(ast, { fnName: 'tplFoo', esm: false });
        // Build a minimal CJS sandbox via `new Function(...)`.
        const exec = new Function('module', 'document', src + '\nreturn module.exports;');
        const mod = { exports: {} };
        const fn = exec(mod, globalThis.document);
        expect(typeof fn).toBe('function');
        const el = fn();
        expect(el.tagName).toBe('P');
        expect(el.textContent).toBe('hi');
    });
});

describe('codegen — output shape', () => {
    test('emits an export default for ESM', () => {
        const ast = p.fromHTML('<div>x</div>');
        const src = compileParseResult(ast, { fnName: 'tplFoo', esm: true });
        expect(src).toContain('export default tplFoo');
    });

    test('emits module.exports for CJS', () => {
        const ast = p.fromHTML('<div>x</div>');
        const src = compileParseResult(ast, { fnName: 'tplFoo', esm: false });
        expect(src).toContain('module.exports = tplFoo');
    });

    test('generated code is deterministic for the same input', () => {
        const ast1 = p.fromHTML('<a href="/x" class="c">k</a>');
        const ast2 = p.fromHTML('<a href="/x" class="c">k</a>');
        const s1 = compileParseResult(ast1, { fnName: 'tplA', esm: true });
        const s2 = compileParseResult(ast2, { fnName: 'tplA', esm: true });
        expect(s1).toBe(s2);
    });
});

describe('parseArgs (CLI)', () => {
    test('defaults', () => {
        const a = parseArgs([]);
        expect(a.input).toBeNull();
        expect(a.esm).toBe(true);
        expect(a.prefix).toBe('tpl');
    });
    test('--cjs flips esm', () => {
        expect(parseArgs(['x.html', '--cjs']).esm).toBe(false);
    });
    test('rejects unknown flag', () => {
        expect(() => parseArgs(['--nope'])).toThrow(/Unknown flag/);
    });
    test('--help short-circuits', () => {
        expect(parseArgs(['--help'])._help).toBe(true);
    });
});

describe('aot CLI', () => {
    test('--help prints usage', async () => {
        const proc = Bun.spawn(['bun', CLI, '--help'], { stdout: 'pipe', stderr: 'pipe' });
        const out = await new Response(proc.stdout).text();
        const code = await proc.exited;
        expect(code).toBe(0);
        expect(out).toContain('Usage:');
    });
    test('unknown flag exits 1', async () => {
        const proc = Bun.spawn(['bun', CLI, '--bogus'], { stdout: 'pipe', stderr: 'pipe' });
        const err = await new Response(proc.stderr).text();
        const code = await proc.exited;
        expect(code).toBe(1);
        expect(err).toMatch(/Unknown flag/);
    });
    test('compiles fixture', async () => {
        const outDir = resolve(PKG_ROOT, 'dist', 'aot', 'cli-test');
        if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
        mkdirSync(outDir, { recursive: true });
        const proc = Bun.spawn(['bun', CLI, FIXTURE, '--out', outDir], {
            stdout: 'pipe', stderr: 'pipe',
        });
        const code = await proc.exited;
        expect(code).toBe(0);
        const expected = join(outDir, 'nav.js');
        expect(existsSync(expected)).toBe(true);
        const src = readFileSync(expected, 'utf8');
        expect(src).toContain('export default');
    });
});
