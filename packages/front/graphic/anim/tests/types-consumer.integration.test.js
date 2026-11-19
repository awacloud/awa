// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Consumer type smoke: `tests/types/consumer.ts` compiles under
 * `strict` with `--noEmit` and zero diagnostics.
 *
 * The declarations are hand-authored (`types/main.d.ts`, one `.d.ts` beside
 * each kernel) and nothing else compiles them. The fixture imports the package
 * by its own name (self-reference through the `exports` map, as an installed
 * consumer resolves it) with library checking on, uses the helpers, and states
 * with `@ts-expect-error` what must NOT compile; a loosened declaration leaves
 * a directive unused, which is itself a diagnostic.
 *
 * The compiler is the workspace's INSTALLED TypeScript, resolved from
 * `node_modules` and run by the current runtime: never `bunx` / `npx`, which
 * could fall back to a network download. A missing compiler is a failure
 * naming `bun install`, not a skip.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPageflip, createHypertree } from '../src/main.js';

const PKG = join(import.meta.dir, '..');

/** The installed `tsc` entry script, or `null` when TypeScript is absent. */
function resolveTsc() {
    try {
        const pkgJson = createRequire(join(PKG, 'package.json')).resolve('typescript/package.json');
        const bin = join(dirname(pkgJson), 'bin', 'tsc');
        return existsSync(bin) ? bin : null;
    } catch {
        return null;
    }
}

describe('consumer type smoke (tests/types)', () => {
    test('tsc --noEmit on the consumer fixture reports no diagnostic', () => {
        const tsc = resolveTsc();
        if (!tsc) throw new Error('TypeScript is not installed in the workspace: run `bun install` at the repository root');
        const res = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--pretty', 'false'], {
            cwd: join(PKG, 'tests', 'types'),
            encoding: 'utf8',
            timeout: 120_000,
        });
        const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
        const diagnostics = out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
        expect(diagnostics).toEqual([]);
        expect(res.status).toBe(0);
    }, 120_000);
});

/** The member names an `export interface <name> { … }` block of main.d.ts declares. */
function declaredMembers(name) {
    const text = readFileSync(join(PKG, 'types', 'main.d.ts'), 'utf8');
    const start = text.indexOf(`export interface ${name} {`);
    if (start < 0) throw new Error(`main.d.ts: no interface ${name}`);
    const body = text.slice(start, text.indexOf('\n}', start));
    return [...body.matchAll(/^ {4}(?:readonly )?([A-Za-z_]\w*)\??[(:]/gm)].map((m) => m[1]);
}

describe('the declared instance surfaces exist on real instances', () => {
    test('every Pageflip member declared in main.d.ts exists on a real book', () => {
        const h = createPageflip(document.createElement('div'), { pages: [{ id: 'p1' }, { id: 'p2' }], width: 320, height: 480 });
        try {
            const members = declaredMembers('Pageflip');
            expect(members.length).toBeGreaterThan(8);
            expect(members.filter((m) => !(m in h.instance))).toEqual([]);
        } finally {
            h.dispose();
        }
    });

    test('every Hypertree member declared in main.d.ts exists on a real tree', () => {
        const h = createHypertree(document.createElement('div'), { tree: { id: 'root', children: [{ id: 'a' }] } });
        try {
            const members = declaredMembers('Hypertree');
            expect(members.length).toBeGreaterThan(6);
            expect(members.filter((m) => !(m in h.instance))).toEqual([]);
        } finally {
            h.dispose();
        }
    });
});
