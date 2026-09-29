// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/vite/dev-invalidation.test.js
/**
 * @fileoverview Tests for the Vite plugin's `configureServer` dev-only
 * invalidation hook (fw/BATCH_26 task 04) — closes the restart gap where
 * editing `fw.config.json` or regenerating the catalog required killing and
 * restarting `vite dev` (W0 FINDINGS § 3.2).
 *
 * Exercises the hook against a MINIMAL fake `ViteDevServer` exposing only
 * the subset of the real API the plugin touches (`watcher.add`/`.on`,
 * `moduleGraph.invalidateAll`, `hot.send`/`ws.send`, `config.logger.error`)
 * — deliberately not the real e2e playgrounds harness (no scoping flag,
 * self-skips without `node_modules`; see `ai/memory/types/fw.md`), and not a
 * real `vite` install (not a devDependency of this package). The second
 * `describe` block proves the production/build path — which never calls
 * `configureServer` at all — is unaffected.
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fwVitePlugin from './index.js';
import { CATALOG_PATH } from '../_shared/core.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// vite/ -> integrations/ -> fw package root
const FW_ROOT = resolve(HERE, '..', '..');

/** Track temp dirs for cleanup. */
const tmpDirs = [];
function mkTmp() {
    const d = mkdtempSync(join(tmpdir(), 'fw-vite-dev-invalidation-'));
    tmpDirs.push(d);
    return d;
}
afterEach(() => {
    while (tmpDirs.length) {
        try { rmSync(tmpDirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

/**
 * Minimal fake `ViteDevServer` — only the members `configureServer` reads:
 * `watcher.add`/`.on` (real vite `watcher` is a chokidar instance, an
 * EventEmitter — mirrored here), `moduleGraph.invalidateAll`, `hot.send`
 * (or `ws.send` pre-v6), `config.logger.error`.
 *
 * @param {{ useHot?: boolean }} [opts]
 */
function makeFakeServer({ useHot = true } = {}) {
    const watcher = new EventEmitter();
    const addedPaths = [];
    watcher.add = (paths) => addedPaths.push(...(Array.isArray(paths) ? paths : [paths]));

    const invalidateAllCalls = [];
    const sent = [];
    const errors = [];

    const server = {
        watcher,
        addedPaths,
        moduleGraph: { invalidateAll: () => invalidateAllCalls.push(true) },
        invalidateAllCalls,
        config: { logger: { error: (msg, meta) => errors.push({ msg, meta }) } },
        errors,
        sent,
    };
    if (useHot) server.hot = { send: (msg) => sent.push(msg) };
    else server.ws = { send: (msg) => sent.push(msg) };
    return server;
}

describe('vite plugin — configureServer dev-only invalidation', () => {
    it('watches both fw.config.json (default path) and the committed catalog', () => {
        const plugin = fwVitePlugin();
        const server = makeFakeServer();
        plugin.configureServer(server);

        const watched = server.addedPaths.map((p) => resolve(p));
        expect(watched).toContain(resolve(FW_ROOT, 'fw.config.json'));
        expect(watched).toContain(resolve(CATALOG_PATH));
    });

    it('a change to an unrelated file is ignored — no reload, no invalidation, no reload signal', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
            'utf8'
        );
        const plugin = fwVitePlugin({ configPath: cfgPath, preset: 'p' });
        const server = makeFakeServer();
        plugin.configureServer(server);

        server.watcher.emit('change', join(dir, 'unrelated.txt'));

        expect(server.invalidateAllCalls).toHaveLength(0);
        expect(server.sent).toHaveLength(0);
        expect(server.errors).toHaveLength(0);
    });

    it('config edit + matching "change" event: cache reloads, module graph invalidates, full-reload sent — no server restart', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
            'utf8'
        );
        const plugin = fwVitePlugin({ configPath: cfgPath, preset: 'p' });
        const server = makeFakeServer();
        plugin.configureServer(server);

        const before = plugin.load(plugin.resolveId('virtual:@awacloud/fw/preset/p'));
        expect(before).not.toContain('b64');

        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex', 'b64'] } } }),
            'utf8'
        );
        server.watcher.emit('change', cfgPath);

        expect(server.invalidateAllCalls).toHaveLength(1);
        expect(server.sent).toEqual([{ type: 'full-reload' }]);
        expect(server.errors).toHaveLength(0);

        const after = plugin.load(plugin.resolveId('virtual:@awacloud/fw/preset/p'));
        expect(after).toContain("import { b64 } from '@awacloud/fw/io/codec/b64.js';");
    });

    it('falls back to server.ws when server.hot is absent (pre-v6 Vite shape)', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
            'utf8'
        );
        const plugin = fwVitePlugin({ configPath: cfgPath, preset: 'p' });
        const server = makeFakeServer({ useHot: false });
        plugin.configureServer(server);

        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex', 'b64'] } } }),
            'utf8'
        );
        server.watcher.emit('change', cfgPath);

        expect(server.sent).toEqual([{ type: 'full-reload' }]);
    });

    it('a malformed edit logs via server.config.logger.error and skips invalidation — the prior working cache is preserved', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
            'utf8'
        );
        const plugin = fwVitePlugin({ configPath: cfgPath, preset: 'p' });
        const server = makeFakeServer();
        plugin.configureServer(server);

        const before = plugin.load(plugin.resolveId('virtual:@awacloud/fw/preset/p'));

        // Rename preset "p" away — the core was constructed with defaultPreset "p".
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { other: { modules: ['hex'] } } }),
            'utf8'
        );
        server.watcher.emit('change', cfgPath);

        expect(server.errors).toHaveLength(1);
        expect(server.errors[0].msg).toContain('Unknown preset "p"');
        expect(server.invalidateAllCalls).toHaveLength(0);
        expect(server.sent).toHaveLength(0);

        const after = plugin.load(plugin.resolveId('virtual:@awacloud/fw/preset/p'));
        expect(after).toBe(before);
    });

    it('an "add" event (atomic-save unlink+add pattern some editors use) is handled the same as "change"', () => {
        const dir = mkTmp();
        const cfgPath = join(dir, 'fw.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex'] } } }),
            'utf8'
        );
        const plugin = fwVitePlugin({ configPath: cfgPath, preset: 'p' });
        const server = makeFakeServer();
        plugin.configureServer(server);

        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { p: { modules: ['hex', 'b64'] } } }),
            'utf8'
        );
        server.watcher.emit('add', cfgPath);

        expect(server.invalidateAllCalls).toHaveLength(1);
        const after = plugin.load(plugin.resolveId('virtual:@awacloud/fw/preset/p'));
        expect(after).toContain('b64');
    });
});

describe('vite plugin — production/build path is unaffected (configureServer is never invoked by `vite build`)', () => {
    it('resolveId/load stay deterministic across repeated calls when configureServer/reload are never exercised', () => {
        const plugin = fwVitePlugin({ preset: 'site' });
        const id = plugin.resolveId('virtual:@awacloud/fw/preset/site');
        const first = plugin.load(id);
        const second = plugin.load(id);
        expect(first).toBe(second);
        expect(first).toContain("import { ModuleRuntime } from '@awacloud/fw/core/runtime';");
    });

    it('the plugin object gains configureServer as an ADDITIONAL hook — the pre-existing hooks are untouched', () => {
        const plugin = fwVitePlugin();
        expect(plugin.name).toBe('@awacloud/fw');
        expect(plugin.enforce).toBe('pre');
        expect(typeof plugin.resolveId).toBe('function');
        expect(typeof plugin.load).toBe('function');
        expect(typeof plugin.transformIndexHtml.handler).toBe('function');
        expect(typeof plugin.configureServer).toBe('function'); // NEW, dev-only.
    });
});
