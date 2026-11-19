// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/real-fw.integration.test.js
//
// Gate against the LIVE `packages/front/fw` (not the frozen golden extraction
// and not the mini-fw fixture): fw-bundler must be able to read the fw it
// ships to. fw T27 (4a74f6761) froze the registry (`export default
// Object.freeze([ … ]);`) and the fixture-only suite stayed green while every
// preset bundle failed downstream (tools/LIGHT_63). The next change to the fw
// registry shape now reddens HERE, not in a downstream example.
//
//   1. `validateAll` over the live `src/` + `src/core/modules.js` — read-only.
//   2. The `bundle` subcommand builds one preset (exit 0) from a scratch COPY
//      of the live package, so the run never writes into
//      `packages/front/fw/dist`. Scratch root: gitignored `tests/tmp/`.

import { describe, test, expect, afterAll } from 'bun:test';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { validateAll } from '../src/bundle/lib/validate-deps.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const FW = join(ROOT, 'packages', 'front', 'fw');
const BUNDLE_CLI = join(ROOT, 'tools', 'fw-bundler', 'src', 'bundle', 'index.js');
const SCRATCH = join(import.meta.dir, 'tmp', 'real-fw-gate');

afterAll(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
});

describe('fw-bundler against the live packages/front/fw', () => {
    test('validateAll accepts the live source tree and its modules.js registry', () => {
        const report = validateAll(join(FW, 'src'), join(FW, 'src', 'core', 'modules.js'));
        // Non-vacuity: the fw ships far more than a handful of modules.
        expect(report.checked).toBeGreaterThan(100);
        expect(report.withDeps + report.depFree).toBe(report.checked);
    });

    test('`bundle minimal` exits 0 on a copy of the live fw and emits the preset', () => {
        rmSync(SCRATCH, { recursive: true, force: true });
        mkdirSync(SCRATCH, { recursive: true });
        // Source + config only: the co-located unit tests are not bundle input.
        cpSync(join(FW, 'src'), join(SCRATCH, 'src'), {
            recursive: true,
            filter: (p) => !/\.test\.[cm]?[jt]s$/.test(p),
        });
        cpSync(join(FW, 'fw.config.json'), join(SCRATCH, 'fw.config.json'));
        cpSync(join(FW, 'package.json'), join(SCRATCH, 'package.json'));

        const r = Bun.spawnSync(['bun', BUNDLE_CLI, 'minimal', '--no-sanity', '--pkg', SCRATCH], {
            cwd: ROOT, stdout: 'pipe', stderr: 'pipe',
        });
        const out = `${r.stdout.toString()}\n${r.stderr.toString()}`;
        expect([r.exitCode, out.includes('could not locate')]).toEqual([0, false]);
        expect(out).toContain('[validate] OK');
        expect(existsSync(join(SCRATCH, 'dist', 'build', 'fw.minimal.pure.min.js'))).toBe(true);
    }, 120_000);
});
