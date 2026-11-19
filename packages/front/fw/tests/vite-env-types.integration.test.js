// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `integrations/vite/vite-env.d.ts` keeps its types whatever
 * the consumer's resolution: through the package (`types:
 * ["@awacloud/fw/vite-env"]`, bundler resolution) and read by path under
 * `moduleResolution: "node"` (node10 ignores `exports`). The proof is a
 * REJECTED value: assigning each virtual-module export to a `number` must
 * fail, naming the real type — an `any` would let it through silently.
 */

import { describe, test, expect, afterAll } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const VITE_ENV = join(PKG, 'integrations', 'vite', 'vite-env.d.ts');
const BUILT = existsSync(join(PKG, 'dist', 'types', 'core', 'runtime.d.ts'));

function resolveTsc() {
    try {
        const pj = createRequire(join(PKG, 'package.json')).resolve('typescript/package.json');
        const bin = join(dirname(pj), 'bin', 'tsc');
        return existsSync(bin) ? bin : null;
    } catch {
        return null;
    }
}

const PROBE_BODY = [
    "import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';",
    "import { install, modules } from 'virtual:@awacloud/fw/side-bundle/x';",
    'export const n: number = runtime;',
    'export const m: number = modules;',
    'export const i: number = install;',
    '',
].join('\n');

const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function compile(files, compilerOptions) {
    const dir = mkdtempSync(join(tmpdir(), 'fw-vite-env-'));
    dirs.push(dir);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true, noEmit: true, skipLibCheck: true, ...compilerOptions },
        files: ['probe.ts'],
    }));
    return { dir, run: () => {
        const res = spawnSync(process.execPath, [resolveTsc(), '-p', 'tsconfig.json', '--pretty', 'false'], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
        return `${res.stdout || ''}${res.stderr || ''}`.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
    } };
}

/** The three typed rejections, one per export. */
function expectTypedRejections(diagnostics) {
    const probe = diagnostics.filter((l) => l.startsWith('probe.ts'));
    expect(probe.join('\n')).toContain("Type 'TypedModuleRuntime' is not assignable to type 'number'");
    expect(probe.join('\n')).toContain("Type 'ModuleDefinition[]' is not assignable to type 'number'");
    expect(probe.join('\n')).toContain("Type '(runtime: ModuleRuntime) => void' is not assignable to type 'number'");
    expect(probe).toHaveLength(3);
}

describe.skipIf(!BUILT)('vite-env.d.ts types never degrade to any (needs dist/types: `bun run types`)', () => {
    test('through the package, bundler resolution', () => {
        expect(resolveTsc()).not.toBe(null);
        const c = compile({ 'probe.ts': PROBE_BODY }, { moduleResolution: 'bundler', types: ['@awacloud/fw/vite-env'] });
        mkdirSync(join(c.dir, 'node_modules', '@awacloud'), { recursive: true });
        symlinkSync(PKG, join(c.dir, 'node_modules', '@awacloud', 'fw'), process.platform === 'win32' ? 'junction' : 'dir');
        expectTypedRejections(c.run());
    }, 120_000);

    test('read by path, node10 resolution (exports ignored)', () => {
        const ref = `/// <reference path="${VITE_ENV.split('\\').join('/')}" />\n`;
        const c = compile({ 'probe.ts': ref + PROBE_BODY }, { moduleResolution: 'node', types: [] });
        expectTypedRejections(c.run());
    }, 120_000);
});
