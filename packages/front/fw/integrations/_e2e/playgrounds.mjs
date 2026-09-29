// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/playgrounds.mjs
/**
 * @fileoverview End-to-end harness for the `playground/integrations/*` apps.
 *
 * Complements `run.mjs` (adapter-level, in-process): here each playground is
 * built/run EXACTLY as a developer would (its own package scripts, its own
 * node_modules), asserting exit codes, expected stdout markers and key
 * artifacts. This is the automated version of the manual pass that surfaced
 * the 2026-06-12 batch of integration bugs (bun runtime virtual modules,
 * Turbopack adapter, eval devtool, SSR-safe sanity…).
 *
 * SELF-SKIPPING : a playground whose dependencies are not installed (no
 * node_modules) is reported as SKIP, not FAIL — run `bun install` inside it
 * to enable. `deno` is skipped when the binary is absent.
 *
 * Run :  bun integrations/_e2e/playgrounds.mjs      (or: node …)
 *        bun run e2e:playgrounds                    (from the fw package)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PG = resolve(HERE, '..', '..', 'playground', 'integrations');
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

/** @param {string} bin */
function onPath(bin) {
    const probe = spawnSync(bin, ['--version'], { shell: true, timeout: 15_000 });
    return probe.status === 0;
}

/**
 * @typedef {Object} Step
 * @property {string[]} cmd            Command + args, run with cwd = the playground dir.
 * @property {string}   [expectOut]    Substring that must appear in stdout+stderr.
 *
 * @typedef {Object} Playground
 * @property {string} name
 * @property {Step[]} steps
 * @property {string[]} [artifacts]    Paths (relative to the playground) that must exist afterwards.
 * @property {boolean} [needsInstall=true]  Requires node_modules (SKIP when absent).
 * @property {() => (string|null)} [skip]   Extra skip predicate → reason or null.
 * @property {string[]} [clean]        Paths removed before running (stale-output guard).
 */

/** @type {Playground[]} */
const PLAYGROUNDS = [
    {
        name: 'nodejs',
        needsInstall: false,
        steps: [{ cmd: ['node', 'app.mjs'] }],
    },
    {
        name: 'bun',
        needsInstall: false,
        clean: ['dist'],
        steps: [
            { cmd: ['bun', 'build.ts'], expectOut: 'built' },
            // Runtime path: bunfig.toml preload resolves the virtual preset.
            { cmd: ['bun', 'run', 'src/app.js'], expectOut: 'preset "core"' },
        ],
        artifacts: ['dist/app.js'],
    },
    {
        name: 'deno',
        needsInstall: false,
        skip: () => (onPath('deno') ? null : 'deno not on PATH'),
        steps: [{ cmd: ['deno', 'task', 'start'], expectOut: 'Worker-serialization path OK' }],
    },
    {
        name: 'esbuild',
        steps: [{ cmd: ['bun', 'run', 'build'] }],
    },
    {
        name: 'rollup',
        steps: [{ cmd: ['bun', 'run', 'build'] }],
    },
    {
        name: 'vite',
        clean: ['dist'],
        steps: [{ cmd: ['bun', 'run', 'build'] }],
        artifacts: ['dist/index.html'],
    },
    {
        name: 'webpack',
        clean: ['dist'],
        steps: [{ cmd: ['bun', 'run', 'build'] }],
        artifacts: ['dist/bundle.js', 'dist/index.html'],
    },
    {
        name: 'jest',
        steps: [{ cmd: ['bun', 'run', 'test'] }],
    },
    {
        name: 'vitest',
        steps: [{ cmd: ['bun', 'run', 'test'] }],
    },
    {
        name: 'nest',
        clean: ['dist'],
        steps: [{ cmd: ['bun', 'run', 'build'] }],
    },
    {
        name: 'astro',
        clean: ['dist'],
        steps: [{ cmd: ['bun', 'run', 'build'] }],
        artifacts: ['dist/index.html'],
    },
    {
        name: 'next',
        clean: ['.next'],
        steps: [{ cmd: ['bun', 'run', 'build'] }],
        artifacts: ['.next/BUILD_ID'],
    },
];

const results = [];
/** @param {string} name @param {'PASS'|'SKIP'|'FAIL'} status @param {string} detail */
function record(name, status, detail) {
    results.push({ name, status, detail });
    const icon = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️ ' : '❌';
    console.log(`${icon} ${name.padEnd(10)} ${status.padEnd(4)} ${detail}`);
}

/** @param {Playground} pg */
function runPlayground(pg) {
    const dir = join(PG, pg.name);
    if (!existsSync(dir)) return record(pg.name, 'SKIP', 'directory missing');
    if (pg.skip) {
        const reason = pg.skip();
        if (reason) return record(pg.name, 'SKIP', reason);
    }
    if (pg.needsInstall !== false && !existsSync(join(dir, 'node_modules'))) {
        return record(pg.name, 'SKIP', 'not installed (bun install to enable)');
    }
    for (const p of pg.clean ?? []) rmSync(join(dir, p), { recursive: true, force: true });

    const t0 = Date.now();
    for (const step of pg.steps) {
        const [bin, ...args] = step.cmd;
        const proc = spawnSync(bin, args, {
            cwd: dir,
            shell: true, // resolves bun/node/deno .cmd shims on Windows
            timeout: STEP_TIMEOUT_MS,
            encoding: 'utf8',
            env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
        });
        const out = (proc.stdout ?? '') + (proc.stderr ?? '');
        const label = step.cmd.join(' ');
        if (proc.status !== 0) {
            const tail = out.trim().split('\n').slice(-6).join(' | ');
            return record(pg.name, 'FAIL', `\`${label}\` exit ${proc.status} — ${tail}`);
        }
        if (step.expectOut && !out.includes(step.expectOut)) {
            return record(pg.name, 'FAIL', `\`${label}\`: missing "${step.expectOut}" in output`);
        }
    }
    for (const artifact of pg.artifacts ?? []) {
        if (!existsSync(join(dir, artifact))) {
            return record(pg.name, 'FAIL', `missing artifact: ${artifact}`);
        }
    }
    record(pg.name, 'PASS', `${pg.steps.length} step(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

console.log('\n@awacloud/fw playground e2e — real consumer builds\n');
for (const pg of PLAYGROUNDS) runPlayground(pg);

const failed = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'PASS');
const skipped = results.filter((r) => r.status === 'SKIP');
console.log(`\n${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed\n`);
if (skipped.length) {
    console.log('(skipped playgrounds: run `bun install` inside each to enable)\n');
}
if (failed.length) process.exit(1);
