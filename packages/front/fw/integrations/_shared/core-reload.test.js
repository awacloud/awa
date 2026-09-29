// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_shared/core-reload.test.js
/**
 * @fileoverview Tests for `createFwCore(...).reload()` — the dev-only
 * invalidation seam that closes the vite/`_shared` restart gap (fw/BATCH_26
 * task 04, W0 FINDINGS § 3.2): editing `fw.config.json` or regenerating the
 * committed catalog used to require killing and restarting `vite dev`,
 * because `core.js` read both synchronously at construction and cached them
 * for the core's whole lifetime.
 *
 * Each of the two inputs gets a NON-VACUOUS pair of assertions: first that
 * the pre-fix behaviour (edit invisible without an explicit reload) still
 * happens — proving the gap was real and this test would have caught it —
 * then that `reload()` closes it. A gate that only shows the "after" half
 * would pass identically if the value had never been cached in the first
 * place.
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFwCore, CATALOG_PATH } from './core.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// _shared/ -> integrations/ -> fw package root
const FW_ROOT = resolve(HERE, '..', '..');

/** Track temp dirs for cleanup. */
const tmpDirs = [];
function mkTmp() {
    const d = mkdtempSync(join(tmpdir(), 'fw-core-reload-'));
    tmpDirs.push(d);
    return d;
}
afterEach(() => {
    while (tmpDirs.length) {
        try { rmSync(tmpDirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

describe('createFwCore().reload() — fw.config.json invalidation', () => {
    it('non-vacuity: WITHOUT reload(), an on-disk config edit is invisible (proves construction-time caching is real)', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
            'utf8'
        );

        const core = createFwCore({ configPath: cfgPath, preset: 'p' });
        const before = core.emit('virtual:@awacloud/fw/preset/p');
        expect(before).toContain("import { hex } from '@awacloud/fw/io/codec/hex.js';");
        expect(before).not.toContain('b64');

        // Edit the config on disk — a real dev-session action — WITHOUT calling reload().
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex', 'b64'] } } }),
            'utf8'
        );

        const stillCached = core.emit('virtual:@awacloud/fw/preset/p');
        expect(stillCached).toBe(before); // exactly the old bytes — the gap, demonstrated live.
        expect(stillCached).not.toContain('b64');
    });

    it('WITH reload(), the same edit is observed — no restart needed', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
            'utf8'
        );

        const core = createFwCore({ configPath: cfgPath, preset: 'p' });
        expect(core.emit('virtual:@awacloud/fw/preset/p')).not.toContain('b64');

        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex', 'b64'] } } }),
            'utf8'
        );
        core.reload();

        const after = core.emit('virtual:@awacloud/fw/preset/p');
        expect(after).toContain("import { hex } from '@awacloud/fw/io/codec/hex.js';");
        expect(after).toContain("import { b64 } from '@awacloud/fw/io/codec/b64.js';");
        expect(after).toContain('runtime.registerAllDeep([hex, b64]);');
    });

    it('a malformed edit throws from reload() and leaves the prior working cache untouched', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
            'utf8'
        );
        const core = createFwCore({ configPath: cfgPath, preset: 'p' });
        const before = core.emit('virtual:@awacloud/fw/preset/p');

        // Break the default preset the core was constructed with.
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { other: { modules: ['hex'] } } }),
            'utf8'
        );
        expect(() => core.reload()).toThrow('Unknown preset "p"');

        // The old, still-valid state is untouched — atomic swap, not a partial one.
        expect(core.emit('virtual:@awacloud/fw/preset/p')).toBe(before);
    });

    it('exposes the resolved absolute configPath used (default path when no override is given)', () => {
        const core = createFwCore();
        expect(core.configPath).toBe(resolve(FW_ROOT, 'fw.config.json'));
    });
});

describe('createFwCore().reload() — catalog.generated.json invalidation', () => {
    it('non-vacuity + fix, via a direct on-disk mutation of the catalog artifact (never invokes the real generator — see the separate idempotency test below for that)', () => {
        const originalBytes = readFileSync(CATALOG_PATH, 'utf8');
        try {
            const artifact = JSON.parse(originalBytes);
            expect(artifact.modules.hex).toBeDefined();

            // Config referencing a module name that does NOT exist in the
            // catalog YET — the "before" pass proves the emitter really
            // reads through the cached catalog snapshot, not the live file.
            const dir = mkTmp();
            const cfgPath = join(dir, 'fw.config.json');
            writeFileSync(
                cfgPath,
                JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex', '__synthetic_reload_probe__'] } } }),
                'utf8'
            );

            // Constructing against a preset naming an unknown module throws
            // at emit() time (not construction), so build the core against a
            // config naming ONLY `hex` first, snapshot its emitted bytes,
            // then synthesize the catalog entry and swap the config+reload.
            const cfgPathReal = join(dir, 'fw.config.real.json');
            writeFileSync(
                cfgPathReal,
                JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
                'utf8'
            );
            const core = createFwCore({ configPath: cfgPathReal, preset: 'p' });
            const before = core.emit('virtual:@awacloud/fw/preset/p');
            expect(before).toContain('hex');

            // Mutate the committed catalog on disk (synthetic entry) WITHOUT reload().
            const mutated = JSON.parse(originalBytes);
            mutated.modules.__synthetic_reload_probe__ = { bindingName: 'syntheticProbe', subpath: 'io/codec/hex.js' };
            writeFileSync(CATALOG_PATH, JSON.stringify(mutated), 'utf8');

            const stillCached = core.emit('virtual:@awacloud/fw/preset/p');
            expect(stillCached).toBe(before); // the gap, live: catalog changed on disk, core didn't notice.

            // Now point the config at the newly-catalogued module and reload().
            writeFileSync(
                cfgPathReal,
                JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex', '__synthetic_reload_probe__'] } } }),
                'utf8'
            );
            core.reload();
            const after = core.emit('virtual:@awacloud/fw/preset/p');
            expect(after).toContain("import { syntheticProbe } from '@awacloud/fw/io/codec/hex.js';");
            expect(after).toContain('registerAllDeep([hex, syntheticProbe]);');
        } finally {
            // Restore byte-exact, whatever happened above.
            writeFileSync(CATALOG_PATH, originalBytes, 'utf8');
        }
    });

    it('tree left clean: the restore above leaves no dirt on the committed catalog', () => {
        const result = Bun.spawnSync(['git', 'status', '--porcelain', CATALOG_PATH], { cwd: FW_ROOT });
        const out = result.stdout.toString();
        expect(out.trim()).toBe('');
    });

    it('the real generator (`bun run integrations:catalog`) is byte-idempotent on an unchanged src/ — exercises the exact command the orchestrator notes flag as tracked-file-rewriting, and proves it leaves the tree clean', () => {
        const before = readFileSync(CATALOG_PATH, 'utf8');
        const result = Bun.spawnSync(['bun', 'run', 'integrations:catalog'], { cwd: FW_ROOT });
        expect(result.exitCode).toBe(0);

        const after = readFileSync(CATALOG_PATH, 'utf8');
        expect(after).toBe(before); // idempotent — the regen produced byte-identical output.

        const status = Bun.spawnSync(['git', 'status', '--porcelain', CATALOG_PATH], { cwd: FW_ROOT });
        expect(status.stdout.toString().trim()).toBe('');
    });
});
