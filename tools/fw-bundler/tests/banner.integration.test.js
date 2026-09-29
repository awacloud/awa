// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/banner.integration.test.js
//
// `bundle --banner-file` / `opts.banner` (BL-1502) against the fw-shaped
// mini-fw fixture, default bun backend:
//   1. present at byte 0 of EVERY emitted JS bundle (minified, non-minified,
//      sanity tiers and the sanity alias), exactly once;
//   2. `*.meta.json` sizes/hashes describe the FINAL (bannered) bytes;
//   3. omitted ⇒ the output is byte-identical to a no-option run, and the
//      bannered bundle is that same output with ONLY the banner prefixed
//      (the post-step never alters the minifier's bytes);
//   4. re-running never duplicates the banner;
//   5. CLI face: the flag, a missing value, and a refused banner (exit 1,
//      nothing written).
//
// The fixture is COPIED under the gitignored tests/tmp/ so this suite never
// races `bundle.integration.test.js`, which builds the fixture in place.

import { describe, test, expect, afterAll } from 'bun:test';
import { existsSync, rmSync, readFileSync, cpSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

import { parseArgs, runBundle } from '../src/bundle/index.js';
import { renderBanner } from '../src/bundle/lib/banner.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const COPY_BUNDLE = join(ROOT, 'tools', 'fw-bundler', 'src', 'bundle', 'index.js');
const FIX = join(import.meta.dir, '__fixtures__', 'mini-fw');
const WORK = join(import.meta.dir, 'tmp', 'banner');

const TEXT = 'Banner line one\nBanner line two\nBanner line three\n';
const BANNER = renderBanner(TEXT);

afterAll(() => rmSync(WORK, { recursive: true, force: true }));

function seed(name) {
    const dir = join(WORK, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    cpSync(FIX, dir, { recursive: true });
    rmSync(join(dir, 'dist'), { recursive: true, force: true });
    return dir;
}

/** Every emitted JS file under dist/build, name -> bytes. */
function jsFiles(dir) {
    const out = join(dir, 'dist', 'build');
    const map = new Map();
    for (const n of readdirSync(out).sort()) {
        if (n.endsWith('.js')) map.set(n, readFileSync(join(out, n)));
    }
    return map;
}

function metaOf(dir, name) {
    return JSON.parse(readFileSync(join(dir, 'dist', 'build', name), 'utf8'));
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

describe('bundle banner (bun backend, mini-fw fixture)', () => {
    test('present at byte 0 of every emitted JS bundle, exactly once; meta covers the final bytes', async () => {
        const dir = seed('present');
        const opts = { ...parseArgs(['core', '--pkg', dir, '--backend', 'bun']), banner: TEXT };
        await runBundle(opts);

        const files = jsFiles(dir);
        // Non-vacuity: minified + non-minified preset bundles and the sanity set.
        for (const n of ['fw.core.pure.min.js', 'fw.core.pure.js', 'sanity.min.js',
            'sanity-base-classic.min.js', 'sanity-community-classic.min.js']) {
            expect([n, files.has(n)]).toEqual([n, true]);
        }
        for (const [n, buf] of files) {
            const text = buf.toString('utf8');
            expect([n, text.startsWith(BANNER)]).toEqual([n, true]);
            expect([n, text.split(BANNER).length - 1]).toEqual([n, 1]);
        }

        const meta = metaOf(dir, 'fw.core.pure.meta.json');
        const min = files.get('fw.core.pure.min.js');
        const dev = files.get('fw.core.pure.js');
        expect(meta.bytes.min).toBe(min.byteLength);
        expect(meta.bytes.dev).toBe(dev.byteLength);
        expect(meta.hashSha256.min).toBe(sha(min));
        expect(meta.hashSha256.dev).toBe(sha(dev));
        expect(meta.bytes.minGz).toBe(Bun.gzipSync(min).byteLength);
    }, 60_000);

    test('omitted ⇒ byte-identical to a no-option run; bannered = banner + the SAME bytes', async () => {
        // ONE directory, three sequential builds: the non-minified bundle
        // embeds cwd-relative source paths (PATH-SCOPED determinism, see
        // bundle.integration.test.js), so the comparison must hold the path.
        const dir = seed('omit');
        const META = join(dir, 'dist', 'build', 'fw.core.pure.meta.json');

        await runBundle(parseArgs(['core', '--pkg', dir, '--backend', 'bun']));
        const plain = jsFiles(dir);
        const plainMeta = readFileSync(META, 'utf8');

        await runBundle({ ...parseArgs(['core', '--pkg', dir, '--backend', 'bun']), banner: null, bannerFile: null });
        const plain2 = jsFiles(dir);
        const plain2Meta = readFileSync(META, 'utf8');

        await runBundle({ ...parseArgs(['core', '--pkg', dir, '--backend', 'bun']), banner: TEXT });
        const bannered = jsFiles(dir);

        expect(plain.size).toBeGreaterThanOrEqual(5);
        expect([...plain.keys()]).toEqual([...bannered.keys()]);
        for (const [n, buf] of plain) {
            expect([n, Buffer.compare(buf, plain2.get(n))]).toEqual([n, 0]);
            expect([n, buf.toString('utf8').includes('/*!')]).toEqual([n, false]);
            const b = bannered.get(n);
            expect([n, Buffer.compare(b.subarray(Buffer.byteLength(BANNER)), buf)]).toEqual([n, 0]);
        }
        expect(plain2Meta).toBe(plainMeta);
        expect(JSON.parse(plainMeta).hashSha256.min).toBe(sha(plain.get('fw.core.pure.min.js')));
    }, 60_000);

    test('re-running with the banner never duplicates it and is byte-stable', async () => {
        const dir = seed('rerun');
        const opts = { ...parseArgs(['core', '--no-sanity', '--pkg', dir, '--backend', 'bun']), banner: TEXT };
        await runBundle(opts);
        const first = jsFiles(dir);
        await runBundle(opts);
        const second = jsFiles(dir);
        for (const [n, buf] of first) {
            expect([n, Buffer.compare(buf, second.get(n))]).toEqual([n, 0]);
            expect([n, second.get(n).toString('utf8').split('/*!').length - 1]).toEqual([n, 1]);
        }
    }, 60_000);

    test('opts.banner and opts.bannerFile together are refused before anything is written', async () => {
        const dir = seed('both');
        await expect(runBundle({ ...parseArgs(['core', '--pkg', dir]), banner: TEXT, bannerFile: 'x.txt' }))
            .rejects.toThrow(/not both/);
        expect(existsSync(join(dir, 'dist'))).toBe(false);
    });
});

describe('bundle --banner-file (CLI face)', () => {
    const run = (argv) => Bun.spawnSync(['bun', COPY_BUNDLE, ...argv], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });

    test('parseArgs records --banner-file and rejects a missing value', () => {
        expect(parseArgs(['--banner-file', 'b.txt']).bannerFile).toBe('b.txt');
        expect(parseArgs([]).bannerFile).toBeNull();
        expect(parseArgs([]).banner).toBeNull();
        expect(() => parseArgs(['--banner-file'])).toThrow(/--banner-file requires/);
        expect(() => parseArgs(['--banner-file', '--pkg', 'x'])).toThrow(/--banner-file requires/);
    });

    test('--help documents the flag', () => {
        const r = run(['--help']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout.toString()).toContain('--banner-file <path>');
    });

    test('the flag bannerizes the built bundles (exit 0)', () => {
        const dir = seed('cli');
        const file = join(WORK, 'cli-banner.txt');
        writeFileSync(file, TEXT);
        const r = run(['core', '--no-sanity', '--pkg', dir, '--banner-file', file]);
        expect(r.exitCode).toBe(0);
        const min = readFileSync(join(dir, 'dist', 'build', 'fw.core.pure.min.js'), 'utf8');
        expect(min.startsWith(BANNER)).toBe(true);
    }, 60_000);

    test('a banner carrying "*/" is refused with exit 1 and nothing is written', () => {
        const dir = seed('cli-bad');
        const file = join(WORK, 'cli-bad-banner.txt');
        writeFileSync(file, 'ok\n*/ evil()\n');
        const r = run(['core', '--no-sanity', '--pkg', dir, '--banner-file', file]);
        expect(r.exitCode).toBe(1);
        expect(r.stderr.toString()).toContain('*/');
        expect(existsSync(join(dir, 'dist'))).toBe(false);
    });
});
