// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/dispatch.integration.test.js
//
// CLI dispatch (src/index.ts) exit-code contract + the shared `./modlib`
// surface. Dispatch is spawned (the entry runs process.exit on import);
// modlib is exercised in-process.

import { describe, test, expect } from 'bun:test';
import { resolve, join } from 'node:path';

import {
    scanAll, parseFile, listSourceFiles, relativeImport,
    printHelp, wantsHelp, isMainModule,
} from '../src/modlib/index.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const ENTRY = join(ROOT, 'tools', 'fw-bundler', 'src', 'index.ts');
const FIX_SRC = join(import.meta.dir, '__fixtures__', 'mini-fw', 'src');

function run(args) {
    const p = Bun.spawnSync(['bun', ENTRY, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    return {
        code: p.exitCode,
        stdout: p.stdout.toString(),
        stderr: p.stderr.toString(),
    };
}

describe('fw-bundler CLI dispatch — exit codes', () => {
    test('no command → usage error, exit 2', () => {
        const r = run([]);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('missing command');
    });

    test('--help → exit 0, lists subcommands', () => {
        const r = run(['--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('bundle');
        expect(r.stdout).toContain('standalone');
    });

    test('unknown command → usage error, exit 2', () => {
        const r = run(['frobnicate']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('unknown command');
    });

    test('bundle --help → exit 0 (routes into subcommand)', () => {
        const r = run(['bundle', '--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('fw-bundler bundle');
    });

    test('standalone --help → exit 0 (routes into subcommand)', () => {
        const r = run(['standalone', '--help']);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain('fw-bundler standalone');
    });

    test('standalone with no module → error, exit 1', () => {
        const r = run(['standalone']);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('Missing <moduleName>');
    });
});

describe('modlib surface (frozen call contract)', () => {
    test('exports the frozen scan-modules + cli-help surface', () => {
        for (const fn of [scanAll, parseFile, listSourceFiles, relativeImport, printHelp, wantsHelp, isMainModule]) {
            expect(typeof fn).toBe('function');
        }
    });

    test('scanAll parses the fixture module shape', () => {
        const { byName, unparseable } = scanAll(FIX_SRC);
        expect(unparseable.length).toBe(0);
        expect([...byName.keys()].sort()).toEqual(['alpha', 'beta']);
        expect(byName.get('beta').dependencies).toEqual(['alpha']);
        expect(byName.get('beta').hasDepsField).toBe(true);
    });

    test('listSourceFiles skips core/sanity, returns module files', () => {
        const files = listSourceFiles(FIX_SRC);
        expect(files.some((f) => f.endsWith('alpha.js'))).toBe(true);
        expect(files.some((f) => f.includes('core'))).toBe(false);
        expect(files.some((f) => f.includes('sanity'))).toBe(false);
    });

    test('parseFile returns null for a non-module file', () => {
        expect(parseFile(join(FIX_SRC, 'core', 'runtime.js'))).toBeNull();
    });

    test('relativeImport yields a POSIX ./ or ../ path', () => {
        const rel = relativeImport(join(FIX_SRC, 'mod', 'beta.js'), join(FIX_SRC, 'mod', 'alpha.js'));
        expect(rel).toBe('./alpha.js');
    });

    test('wantsHelp / isMainModule behave', () => {
        expect(wantsHelp(['--help'])).toBe(true);
        expect(wantsHelp(['-h'])).toBe(true);
        expect(wantsHelp(['bundle'])).toBe(false);
        expect(isMainModule('file:///definitely/not/this/module.js')).toBe(false);
    });
});
