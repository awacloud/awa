// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/dist-build.integration.test.ts — the transpiled
 * `dist/` an installed copy resolves on Node and Deno (`exports` "."
 * `default` condition).
 *
 * The build script runs for real (`bun scripts/build-dist.ts --out …`) into
 * a temporary copy under the package's git-ignored `tmp/`, next to a copy of
 * `package.json` so `../package.json` resolves exactly as in an installed
 * copy. The `@awacloud/*` imports resolve through the workspace links, the
 * same packages an install would carry. Then:
 *
 *   - structure: one `.js` per non-test source, no relative `.ts` specifier
 *     left, the JSON import attribute kept, the licence header carried over;
 *   - node / deno legs: import `dist/core.js`, run a minimal `toMd` on the
 *     committed fixture and a hostile `toHtml`, and run `dist/index.js
 *     --version`. A runtime that is not installed is skipped, never passed;
 *   - negative controls on the build's own guards (`transpileModule`).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transpileModule } from '../scripts/build-dist.ts';

const PKG = join(import.meta.dir, '..');
const SAMPLE_DOCX = join(import.meta.dir, 'fixtures', 'sample.docx');
const VERSION = (JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { version: string }).version;

mkdirSync(join(PKG, 'tmp'), { recursive: true });
const COPY = mkdtempSync(join(PKG, 'tmp', 'dist-build-'));
const DIST = join(COPY, 'dist');
copyFileSync(join(PKG, 'package.json'), join(COPY, 'package.json'));
const build = spawnSync('bun', [join(PKG, 'scripts', 'build-dist.ts'), '--out', DIST], { encoding: 'utf8' });

afterAll(() => {
    rmSync(COPY, { recursive: true, force: true });
});

function available(bin: string): boolean {
    const r = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    return r.error === undefined && r.status === 0;
}

/** A module script: load the transpiled entry, convert the fixture, render hostile Markdown. */
const PROBE = `
const m = await import(${JSON.stringify(pathToFileURL(join(DIST, 'core.js')).href)});
const { readFileSync } = await import('node:fs');
const bytes = new Uint8Array(readFileSync(${JSON.stringify(SAMPLE_DOCX)}));
const md = await m.toMd({ name: 'sample.docx', bytes, convertedAt: '2026-01-01T00:00:00.000Z' });
const html = await m.toHtml({ markdown: '<script>alert(1)</script>\\n\\n[x](javascript:alert(1))' });
console.log(JSON.stringify({ mdError: md.error, frontmatter: md.markdown.startsWith('---'), lossy: md.lossy, htmlError: html.error, html: html.html }));
`;

const RUNTIMES = [
    { name: 'node', probe: ['node', ['--input-type=module', '-e', PROBE]], cli: ['node', [join(DIST, 'index.js'), '--version']] },
    { name: 'deno', probe: ['deno', ['eval', PROBE]], cli: ['deno', ['run', '--no-prompt', '--allow-read', join(DIST, 'index.js'), '--version']] },
] as const;

describe('build-dist — structure', () => {
    test('the build exits 0 and writes one .js per non-test source', () => {
        expect(build.status).toBe(0);
        const sources = readdirSync(join(PKG, 'src'))
            .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
            .map((f) => f.replace(/\.ts$/, '.js'))
            .sort();
        expect(sources.length).toBeGreaterThan(0);
        expect(readdirSync(DIST).sort()).toEqual(sources);
    });

    test('no relative .ts specifier survives; the JSON attribute and the licence header are kept', () => {
        for (const f of readdirSync(DIST)) {
            const text = readFileSync(join(DIST, f), 'utf8');
            expect(text).not.toMatch(/["']\.{1,2}\/[^"'\n]+\.ts["']/);
            expect(text).toContain('// SPDX-License-Identifier: AGPL-3.0-only');
        }
        for (const f of ['index.js', 'mcp.js']) {
            expect(readFileSync(join(DIST, f), 'utf8')).toContain('from "../package.json" with { type: "json" }');
        }
    });
});

for (const rt of RUNTIMES) {
    const t = available(rt.name) ? test : test.skip;
    describe(`build-dist — ${rt.name} loads the transpiled entry`, () => {
        t(`${rt.name}: dist/core.js runs toMd and a safe toHtml`, () => {
            const [cmd, args] = rt.probe;
            const r = spawnSync(cmd, [...args], { encoding: 'utf8', cwd: COPY });
            expect(r.stderr).toBe('');
            expect(r.status).toBe(0);
            const out = JSON.parse(r.stdout.trim()) as { mdError: null; frontmatter: boolean; htmlError: null; html: string };
            expect(out.mdError).toBeNull();
            expect(out.frontmatter).toBe(true);
            expect(out.htmlError).toBeNull();
            expect(out.html).not.toMatch(/<script\b/i);
            expect(out.html).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
        });

        t(`${rt.name}: dist/index.js --version prints the package version`, () => {
            const [cmd, args] = rt.cli;
            const r = spawnSync(cmd, [...args], { encoding: 'utf8', cwd: COPY });
            expect(r.status).toBe(0);
            expect(r.stdout.trim()).toBe(VERSION);
        });
    });
}

describe('build-dist — negative controls on its own guards', () => {
    test('a relative .ts specifier outside an import clause fails the build', () => {
        const source = "export const u = new URL('./asset.ts', import.meta.url);\n";
        expect(() => transpileModule(source, 'x.ts')).toThrow('a relative .ts specifier survived the rewrite');
    });

    test('import, export-from, dynamic and side-effect specifiers are all rewritten', () => {
        const source = [
            "import { a } from './a.ts';",
            "export { b } from '../b.ts';",
            "import './side.ts';",
            "export const c = () => import('./c.ts');",
            'console.log(a);',
            '',
        ].join('\n');
        const out = transpileModule(source, 'x.ts');
        for (const spec of ['./a.js', '../b.js', './side.js', './c.js']) expect(out).toContain(spec);
    });

    test('a JSON import keeps its attribute', () => {
        const out = transpileModule("import pkg from '../package.json' with { type: 'json' };\nconsole.log(pkg);\n", 'x.ts');
        expect(out).toContain('from "../package.json" with { type: "json" }');
    });
});
