// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered by another test file */ }

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    parseArgs,
    run,
    compileOne,
    deepDiff,
    findNonSerializable,
} from './index.js';
import { parser } from '../../../src/dom/rendering/parser.js';
import { secPolicy } from '../../../src/dom/rendering/secPolicy.js';
import { template } from '../../../src/dom/rendering/template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '_tmp-test');
const FIXTURE = join(__dirname, '_fixtures', 'sample.tpl.html');

beforeAll(async () => {
    if (existsSync(TMP)) await rm(TMP, { recursive: true, force: true });
    await mkdir(TMP, { recursive: true });
});

afterAll(async () => {
    if (existsSync(TMP)) await rm(TMP, { recursive: true, force: true });
});

describe('parseArgs', () => {
    test('positional input + flags', () => {
        const o = parseArgs(['foo.html', '--out', 'dist', '--minify', '--verify']);
        expect(o.input).toBe('foo.html');
        expect(o.out).toBe('dist');
        expect(o.minify).toBe(true);
        expect(o.verify).toBe(true);
        expect(o.ext).toBe('.parseresult.json');
    });

    test('--ext override', () => {
        const o = parseArgs(['x', '--ext', '.pr.json']);
        expect(o.ext).toBe('.pr.json');
    });

    test('--esm flag', () => {
        const o = parseArgs(['x', '--esm']);
        expect(o.esm).toBe(true);
    });

    test('rejects unknown flag', () => {
        expect(() => parseArgs(['--nope'])).toThrow();
    });
});

describe('deepDiff', () => {
    test('returns empty for equal values', () => {
        expect(deepDiff({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe('');
    });

    test('reports first divergence path', () => {
        expect(deepDiff({ a: 1 }, { a: 2 })).toContain('a');
        expect(deepDiff([1, 2, 3], [1, 2, 4])).toContain('[2]');
    });
});

describe('findNonSerializable', () => {
    test('accepts plain JSON shapes', () => {
        expect(findNonSerializable({ a: 1, b: 'x', c: [true, null, { d: 2 }] })).toBe('');
    });

    test('rejects functions', () => {
        expect(findNonSerializable({ fn: () => {} })).toContain('function');
    });
});

describe('compileOne (single file)', () => {
    test('produces a JSON artifact with expected shape keys', async () => {
        const sp = secPolicy.factory();
        const ctx = { p: parser.factory(sp), tpl: template.factory(sp) };
        const r = await compileOne(FIXTURE, {
            out: TMP, ext: '.parseresult.json', minify: false,
            verify: false, esm: false,
        }, ctx);
        expect(existsSync(r.output)).toBe(true);
        const parsed = JSON.parse(await readFile(r.output, 'utf8'));
        expect(Array.isArray(parsed.template)).toBe(true);
        expect(parsed.template.length).toBeGreaterThan(0);
        // Fixture has an iterate block "items".
        expect(parsed.iterates).toBeDefined();
        expect(parsed.iterates.items).toBeDefined();
        expect(r.nodes).toBeGreaterThan(0);
    });

    test('--verify round-trips against fresh parser output', async () => {
        const sp = secPolicy.factory();
        const ctx = { p: parser.factory(sp), tpl: template.factory(sp) };
        const r = await compileOne(FIXTURE, {
            out: TMP, ext: '.verify.json', minify: true,
            verify: true, esm: false,
        }, ctx);
        expect(existsSync(r.output)).toBe(true);
    });

    test('--esm also emits a sibling .js file', async () => {
        const sp = secPolicy.factory();
        const ctx = { p: parser.factory(sp), tpl: template.factory(sp) };
        const r = await compileOne(FIXTURE, {
            out: TMP, ext: '.esm.json', minify: true,
            verify: false, esm: true,
        }, ctx);
        const esm = r.output.replace(/\.json$/, '.js');
        expect(existsSync(esm)).toBe(true);
        const src = await readFile(esm, 'utf8');
        expect(src).toContain('export default');
    });

    test('empty HTML → empty template, still produces output', async () => {
        const empty = join(TMP, 'empty.html');
        await writeFile(empty, '', 'utf8');
        const sp = secPolicy.factory();
        const ctx = { p: parser.factory(sp), tpl: template.factory(sp) };
        const r = await compileOne(empty, {
            out: TMP, ext: '.parseresult.json', minify: false,
            verify: true, esm: false,
        }, ctx);
        const parsed = JSON.parse(await readFile(r.output, 'utf8'));
        expect(parsed.template).toEqual([]);
    });
});

describe('run (directory walk)', () => {
    test('walks a directory and emits one output per .html file', async () => {
        const subdir = join(TMP, 'walk');
        await mkdir(subdir, { recursive: true });
        await writeFile(join(subdir, 'a.html'), '<div id="a">${slot}</div>', 'utf8');
        await writeFile(join(subdir, 'b.html'), '<span id="b">#{x}</span>', 'utf8');
        await writeFile(join(subdir, 'ignore.txt'), 'not html', 'utf8');

        const out = join(TMP, 'walk-out');
        const results = await run({
            input: subdir, out, ext: '.parseresult.json',
            glob: '**/*.html', minify: false, verify: false, esm: false,
        });
        expect(results.length).toBe(2);
        const files = await readdir(out);
        expect(files.filter(f => f.endsWith('.parseresult.json')).length).toBe(2);
    });
});

describe('run (error cases)', () => {
    test('missing input rejects', async () => {
        await expect(run({
            input: null, out: null, ext: '.parseresult.json',
            glob: '**/*.html', minify: false, verify: false, esm: false,
        })).rejects.toThrow(/missing/);
    });

    test('non-existent input rejects', async () => {
        await expect(run({
            input: join(TMP, 'does-not-exist.html'), out: null,
            ext: '.parseresult.json', glob: '**/*.html',
            minify: false, verify: false, esm: false,
        })).rejects.toThrow(/not found/);
    });

    test('malformed HTML still parses (forgiving parser) — produces a result without throwing', async () => {
        const broken = join(TMP, 'broken.html');
        await writeFile(broken, '<div id="x"><span unclosed', 'utf8');
        const sp = secPolicy.factory();
        const ctx = { p: parser.factory(sp), tpl: template.factory(sp) };
        const r = await compileOne(broken, {
            out: TMP, ext: '.broken.json', minify: false,
            verify: false, esm: false,
        }, ctx);
        expect(existsSync(r.output)).toBe(true);
    });
});
