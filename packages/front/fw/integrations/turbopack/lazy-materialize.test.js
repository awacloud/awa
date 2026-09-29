// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/turbopack/lazy-materialize.test.js
/**
 * @fileoverview Tests for the Turbopack adapter's lazy materialization
 * (fw/BATCH_28 task 08, BL-299) — closes the defect where merely
 * *constructing* `fwTurbopack(...)` ran `rmSync` + `mkdirSync` on `outDir`
 * at call time: inspecting the config destroyed any pre-existing directory,
 * including one holding unrelated state.
 *
 * Probe: no live `integrations/turbopack/*.test.js` existed before this task
 * (the directory held only `index.js`/`index.d.ts`) — this is a new
 * co-located test file, named after the behaviour it locks in, mirroring the
 * sibling `integrations/vite/dev-invalidation.test.js` idiom.
 *
 * No `vite`/`next` install and no `_e2e/playgrounds.mjs` harness involved —
 * everything here runs against a fixture `fw.config.json` + the package's
 * own committed catalog, exactly like `_shared/core-reload.test.js`.
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fwTurbopack } from './index.js';

/** Track temp dirs for cleanup. */
const tmpDirs = [];
function mkTmp() {
    const d = mkdtempSync(join(tmpdir(), 'fw-turbopack-lazy-'));
    tmpDirs.push(d);
    return d;
}
afterEach(() => {
    while (tmpDirs.length) {
        try { rmSync(tmpDirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

/** Minimal fixture config matching the vite dev-invalidation test's shape. */
function writeFixtureConfig(dir, modules = ['hex']) {
    const cfgPath = join(dir, 'fw.config.json');
    writeFileSync(
        cfgPath,
        JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules } } }),
        'utf8'
    );
    return cfgPath;
}

describe('turbopack adapter — construction never touches disk (BL-299 red test)', () => {
    it('constructing fwTurbopack(...) does NOT destroy a pre-existing outDir (sentinel survives)', () => {
        const dir = mkTmp();
        const cfgPath = writeFixtureConfig(dir);
        const outDirAbs = join(dir, '.fw-virtual');

        // Pre-existing state the construction call must not disturb.
        mkdirSync(outDirAbs, { recursive: true });
        const sentinelPath = join(outDirAbs, 'sentinel.txt');
        writeFileSync(sentinelPath, 'do-not-touch');

        fwTurbopack({ configPath: cfgPath, preset: 'p', outDir: outDirAbs });

        expect(existsSync(sentinelPath)).toBe(true);
        expect(readFileSync(sentinelPath, 'utf8')).toBe('do-not-touch');
    });

    it('constructing fwTurbopack(...) does not even create outDir when it is absent', () => {
        const dir = mkTmp();
        const cfgPath = writeFixtureConfig(dir);
        const outDirAbs = join(dir, '.fw-virtual');

        fwTurbopack({ configPath: cfgPath, preset: 'p', outDir: outDirAbs });

        expect(existsSync(outDirAbs)).toBe(false);
    });

    it('the returned resolveAlias map and outDir are computed correctly in memory, with no disk access', () => {
        const dir = mkTmp();
        const cfgPath = writeFixtureConfig(dir);
        const outDirAbs = join(dir, '.fw-virtual');

        const { outDir } = fwTurbopack({ configPath: cfgPath, preset: 'p', outDir: outDirAbs });

        expect(outDir).toBe(outDirAbs);
        expect(existsSync(outDirAbs)).toBe(false);
    });
});

describe('turbopack adapter — materialization on first use', () => {
    it('reading resolveAlias (property access) rewrites outDir from scratch, removing the sentinel', () => {
        const dir = mkTmp();
        const cfgPath = writeFixtureConfig(dir);
        const outDirAbs = join(dir, '.fw-virtual');
        mkdirSync(outDirAbs, { recursive: true });
        const sentinelPath = join(outDirAbs, 'sentinel.txt');
        writeFileSync(sentinelPath, 'stale');

        const { resolveAlias } = fwTurbopack({ configPath: cfgPath, preset: 'p', outDir: outDirAbs });

        // A single property access triggers materialization.
        const aliasPath = resolveAlias['virtual:@awacloud/fw/preset'];

        expect(existsSync(sentinelPath)).toBe(false);
        expect(typeof aliasPath).toBe('string');
        expect(existsSync(join(outDirAbs, 'preset-default.js'))).toBe(true);
    });

    it('spreading resolveAlias ({ ...resolveAlias }, the shape every adapter/consumer uses) triggers materialization', () => {
        const dir = mkTmp();
        const cfgPath = writeFixtureConfig(dir);
        const outDirAbs = join(dir, '.fw-virtual');

        const { resolveAlias } = fwTurbopack({ configPath: cfgPath, preset: 'p', outDir: outDirAbs });
        expect(existsSync(outDirAbs)).toBe(false);

        const spread = { ...resolveAlias };

        expect(existsSync(outDirAbs)).toBe(true);
        expect(spread['virtual:@awacloud/fw/preset']).toBe(
            `./${outDirAbs.replace(/\\/g, '/')}/preset-default.js`
        );
        expect(existsSync(join(outDirAbs, 'preset-default.js'))).toBe(true);
    });

    it('calling materialize() explicitly rewrites outDir from scratch, removing the sentinel', () => {
        const dir = mkTmp();
        const cfgPath = writeFixtureConfig(dir);
        const outDirAbs = join(dir, '.fw-virtual');
        mkdirSync(outDirAbs, { recursive: true });
        const sentinelPath = join(outDirAbs, 'sentinel.txt');
        writeFileSync(sentinelPath, 'stale');

        const { materialize } = fwTurbopack({ configPath: cfgPath, preset: 'p', outDir: outDirAbs });
        materialize();

        expect(existsSync(sentinelPath)).toBe(false);
        expect(existsSync(join(outDirAbs, 'preset-default.js'))).toBe(true);
    });

    it('materialize() is idempotent — a second call (or a later resolveAlias read) does not re-run the rewrite', () => {
        const dir = mkTmp();
        const cfgPath = writeFixtureConfig(dir);
        const outDirAbs = join(dir, '.fw-virtual');

        const { resolveAlias, materialize } = fwTurbopack({ configPath: cfgPath, preset: 'p', outDir: outDirAbs });
        materialize();

        // Plant a marker AFTER the first materialize call — if a later
        // materialize()/resolveAlias read re-ran rm+mkdir, this would vanish.
        const markerPath = join(outDirAbs, 'marker-after-first-materialize.txt');
        writeFileSync(markerPath, 'still-here');

        materialize();
        void resolveAlias['virtual:@awacloud/fw/preset'];

        expect(existsSync(markerPath)).toBe(true);
        expect(readFileSync(markerPath, 'utf8')).toBe('still-here');
    });
});

describe('turbopack adapter — rewrite-from-scratch guarantee re-pinned post-materialize', () => {
    it('a stale generated file from a renamed preset is gone after materialize (rewrite-from-scratch, not merge)', () => {
        const dir = mkTmp();
        const cfgPath = writeFixtureConfig(dir);
        const outDirAbs = join(dir, '.fw-virtual');
        mkdirSync(outDirAbs, { recursive: true });
        // Simulate leftover output from a preset that has since been renamed away.
        const staleFile = join(outDirAbs, 'preset-renamed-away.js');
        writeFileSync(staleFile, '// stale');

        const { materialize } = fwTurbopack({ configPath: cfgPath, preset: 'p', outDir: outDirAbs });
        materialize();

        expect(existsSync(staleFile)).toBe(false);
        const files = readdirSync(outDirAbs).sort();
        // `full` is synthesized from the catalog by `_shared/core.js`
        // `injectFullPreset` regardless of what the fixture config declares
        // (memory 2026-07-23) — present alongside the fixture's own `p`.
        expect(files).toEqual(['preset-default.js', 'preset-full.js', 'preset-p.js']);
    });

    it('materialized alias output is byte-identical to a fresh materialize of an equivalent config (no drift from the split)', () => {
        const dirA = mkTmp();
        const dirB = mkTmp();
        const cfgA = writeFixtureConfig(dirA, ['hex', 'b64']);
        const cfgB = writeFixtureConfig(dirB, ['hex', 'b64']);
        const outDirA = join(dirA, '.fw-virtual');
        const outDirB = join(dirB, '.fw-virtual');

        const first = fwTurbopack({ configPath: cfgA, preset: 'p', outDir: outDirA });
        first.materialize();
        const second = fwTurbopack({ configPath: cfgB, preset: 'p', outDir: outDirB });
        // Trigger via resolveAlias read this time, not the explicit method —
        // both triggers must produce byte-identical output.
        void second.resolveAlias['virtual:@awacloud/fw/preset'];

        const contentA = readFileSync(join(outDirA, 'preset-default.js'), 'utf8');
        const contentB = readFileSync(join(outDirB, 'preset-default.js'), 'utf8');
        expect(contentA).toBe(contentB);
        expect(contentA).toContain("import { hex } from '@awacloud/fw/io/codec/hex.js';");
        expect(contentA).toContain("import { b64 } from '@awacloud/fw/io/codec/b64.js';");
    });

    it('resolveAlias keys/values are stable and correct across the lazy trigger (preset + side-bundle + bare specifier)', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({
                defaults: { variants: ['pure'] },
                presets: { p: { modules: ['hex'] } },
                sideBundles: { basic: { modules: ['sha256'] } },
            }),
            'utf8'
        );
        const outDirAbs = join(dir, '.fw-virtual');

        const { resolveAlias, materialize } = fwTurbopack({
            configPath: cfgPath,
            preset: 'p',
            sideBundles: ['basic'],
            outDir: outDirAbs,
        });
        materialize();

        const outDirPosix = outDirAbs.replace(/\\/g, '/');
        // `full` is synthesized from the catalog regardless of the fixture
        // config (memory 2026-07-23) — expected alongside `p` and `basic`.
        expect(resolveAlias).toEqual({
            'virtual:@awacloud/fw/preset': `./${outDirPosix}/preset-default.js`,
            'virtual:@awacloud/fw/preset/p': `./${outDirPosix}/preset-p.js`,
            'virtual:@awacloud/fw/preset/full': `./${outDirPosix}/preset-full.js`,
            'virtual:@awacloud/fw/side-bundle/basic': `./${outDirPosix}/side-bundle-basic.js`,
        });
        expect(existsSync(join(outDirAbs, 'preset-default.js'))).toBe(true);
        expect(existsSync(join(outDirAbs, 'preset-p.js'))).toBe(true);
        expect(existsSync(join(outDirAbs, 'preset-full.js'))).toBe(true);
        expect(existsSync(join(outDirAbs, 'side-bundle-basic.js'))).toBe(true);
    });
});
