// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_shared/config-resolve.test.js
/**
 * @fileoverview Unit tests for the shipped pure config resolver, plus a small
 * integration slice exercising `core.js`'s single resolver code path
 * (`configPath` override) and its missing-artifact guard. The resolver tests
 * are pure (no fs); the `core.js` slice uses temp files because it validates
 * the file-loading seam.
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveConfig, injectFullPreset } from './config-resolve.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Track temp dirs for cleanup. */
const tmpDirs = [];
function mkTmp() {
    const d = mkdtempSync(join(tmpdir(), 'fw-config-resolve-'));
    tmpDirs.push(d);
    return d;
}
afterEach(() => {
    while (tmpDirs.length) {
        try { rmSync(tmpDirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

describe('resolveConfig — extends cascade', () => {
    it('applies a single extends (base modules first, then own, order preserved)', () => {
        const cfg = resolveConfig({
            presets: {
                base: { modules: ['a', 'b'] },
                site: { extends: 'base', modules: ['c', 'd'] },
            },
        });
        expect(cfg.presets.site.modules).toEqual(['a', 'b', 'c', 'd']);
    });

    it('resolves a multi-level chain and deduplicates across the cascade', () => {
        const cfg = resolveConfig({
            presets: {
                base: { modules: ['x', 'y'] },
                mid: { extends: 'base', modules: ['y', 'z'] },
                top: { extends: 'mid', modules: ['x', 'w'] },
            },
        });
        // base=[x,y] → mid=[x,y,z] → top=[x,y,z,w] (first-seen order kept).
        expect(cfg.presets.top.modules).toEqual(['x', 'y', 'z', 'w']);
    });

    it('deduplicates repeats inside a preset\'s own modules', () => {
        const cfg = resolveConfig({ presets: { p: { modules: ['a', 'b', 'a', 'c', 'b'] } } });
        expect(cfg.presets.p.modules).toEqual(['a', 'b', 'c']);
    });

    it('throws on a direct extends cycle with the chain in the message', () => {
        expect(() =>
            resolveConfig({ presets: { a: { extends: 'b', modules: [] }, b: { extends: 'a', modules: [] } } })
        ).toThrow('[config] cycle in preset extends: a -> b -> a');
    });

    it('throws on a longer extends cycle', () => {
        expect(() =>
            resolveConfig({
                presets: {
                    a: { extends: 'b' },
                    b: { extends: 'c' },
                    c: { extends: 'a' },
                },
            })
        ).toThrow('[config] cycle in preset extends: a -> b -> c -> a');
    });

    it('throws when extends points at an undefined preset', () => {
        expect(() => resolveConfig({ presets: { a: { extends: 'ghost' } } })).toThrow(
            '[config] preset "ghost" is referenced via extends but not defined'
        );
    });
});

describe('resolveConfig — variants defaults & validation', () => {
    it('defaults variants to ["pure"] when no defaults block is present', () => {
        const cfg = resolveConfig({ presets: { p: { modules: [] } } });
        expect(cfg.defaults.variants).toEqual(['pure']);
        expect(cfg.presets.p.variants).toEqual(['pure']);
    });

    it('inherits the defaults.variants into presets and side-bundles', () => {
        const cfg = resolveConfig({
            defaults: { variants: ['pure', 'classic'] },
            presets: { p: { modules: [] } },
            sideBundles: { s: { modules: [] } },
        });
        expect(cfg.presets.p.variants).toEqual(['pure', 'classic']);
        expect(cfg.sideBundles.s.variants).toEqual(['pure', 'classic']);
    });

    it('lets a preset override variants', () => {
        const cfg = resolveConfig({ presets: { p: { modules: [], variants: ['classic'] } } });
        expect(cfg.presets.p.variants).toEqual(['classic']);
    });

    it('deduplicates a variants array', () => {
        const cfg = resolveConfig({ presets: { p: { modules: [], variants: ['pure', 'pure', 'classic'] } } });
        expect(cfg.presets.p.variants).toEqual(['pure', 'classic']);
    });

    it('throws on a non-array variants field', () => {
        expect(() => resolveConfig({ presets: { p: { modules: [], variants: 'pure' } } })).toThrow(
            '[config] presets.p.variants must be an array'
        );
    });

    it('throws on an invalid variant value', () => {
        expect(() => resolveConfig({ presets: { p: { modules: [], variants: ['nope'] } } })).toThrow(
            '[config] presets.p.variants contains invalid variant "nope" (allowed: pure, classic)'
        );
    });

    it('throws on an empty variants array', () => {
        expect(() => resolveConfig({ presets: { p: { modules: [], variants: [] } } })).toThrow(
            '[config] presets.p.variants must not be empty (omit the field to inherit defaults)'
        );
    });

    it('honours a custom defaultVariantsFallback', () => {
        const cfg = resolveConfig({ presets: { p: { modules: [] } } }, { defaultVariantsFallback: ['classic'] });
        expect(cfg.defaults.variants).toEqual(['classic']);
    });
});

describe('resolveConfig — endpoint defaults & validation', () => {
    it('defaults endpoint to "fw"', () => {
        const cfg = resolveConfig({ presets: { p: { modules: [] } } });
        expect(cfg.defaults.endpoint).toBe('fw');
        expect(cfg.presets.p.endpoint).toBe('fw');
    });

    it('inherits a custom defaults.endpoint', () => {
        const cfg = resolveConfig({ defaults: { endpoint: 'MyApp' }, presets: { p: { modules: [] } } });
        expect(cfg.presets.p.endpoint).toBe('MyApp');
    });

    it('lets a preset override the endpoint', () => {
        const cfg = resolveConfig({ presets: { p: { modules: [], endpoint: 'Custom$1' } } });
        expect(cfg.presets.p.endpoint).toBe('Custom$1');
    });

    it('throws on an endpoint that is not a valid JS identifier', () => {
        expect(() => resolveConfig({ presets: { p: { modules: [], endpoint: '1bad' } } })).toThrow(
            '[config] presets.p.endpoint must be a valid JS identifier (got "1bad")'
        );
    });

    it('honours a custom defaultEndpointFallback', () => {
        const cfg = resolveConfig({ presets: { p: { modules: [] } } }, { defaultEndpointFallback: 'Fallback' });
        expect(cfg.defaults.endpoint).toBe('Fallback');
    });
});

describe('resolveConfig — side-bundles', () => {
    it('deduplicates side-bundle modules and applies defaults', () => {
        const cfg = resolveConfig({ sideBundles: { s: { modules: ['a', 'a', 'b'] } } });
        expect(cfg.sideBundles.s.modules).toEqual(['a', 'b']);
        expect(cfg.sideBundles.s.variants).toEqual(['pure']);
        expect(cfg.sideBundles.s.endpoint).toBe('fw');
        expect(cfg.sideBundles.s.name).toBe('s');
    });

    it('side-bundles do NOT resolve extends (only own modules)', () => {
        const cfg = resolveConfig({ sideBundles: { s: { extends: 'whatever', modules: ['a'] } } });
        expect(cfg.sideBundles.s.modules).toEqual(['a']);
    });

    it('coerces a missing modules field to an empty array', () => {
        const cfg = resolveConfig({ sideBundles: { s: {} } });
        expect(cfg.sideBundles.s.modules).toEqual([]);
    });
});

describe('injectFullPreset', () => {
    const base = () => resolveConfig({ defaults: { variants: ['pure'] }, presets: {} });

    it('synthesises a full preset from an artifact-shaped modules object', () => {
        const cfg = base();
        const modulesData = {
            hex: { bindingName: 'hex', subpath: 'io/codec/hex.js' },
            b64: { bindingName: 'b64', subpath: 'io/codec/b64.js' },
        };
        injectFullPreset(cfg, modulesData);
        expect(cfg.presets.full.name).toBe('full');
        expect(cfg.presets.full.modules).toEqual(['hex', 'b64']);
        expect(cfg.presets.full.variants).toEqual(['pure']);
        expect(cfg.presets.full.endpoint).toBe('fw');
        expect(cfg.presets.full.description).toContain('Every module discovered');
    });

    it('accepts an equivalent Map and uses its key order', () => {
        const cfg = base();
        const m = new Map([
            ['a', { bindingName: 'a', subpath: 'x/a.js' }],
            ['b', { bindingName: 'b', subpath: 'x/b.js' }],
        ]);
        injectFullPreset(cfg, m);
        expect(cfg.presets.full.modules).toEqual(['a', 'b']);
    });

    it('returns the same config object (chainable, mutating)', () => {
        const cfg = base();
        expect(injectFullPreset(cfg, {})).toBe(cfg);
        expect(cfg.presets.full.modules).toEqual([]);
    });
});

describe('core.js — single resolver code path & catalog guard', () => {
    it('default createFwCore() resolves against the committed artifact', async () => {
        const { createFwCore } = await import('./core.js');
        const core = createFwCore();
        expect(core.config.presets.site).toBeDefined();
        expect(core.config.presets.full.modules.length).toBeGreaterThan(0);
        // full is synthesised from the committed (sorted) artifact catalog.
        expect(core.catalog.has('hex')).toBe(true);
    });

    it('configPath override goes through the SAME resolver and validates against the artifact catalog', async () => {
        const { createFwCore } = await import('./core.js');
        const dir = mkTmp();
        const cfgPath = join(dir, 'custom.config.json');
        writeFileSync(
            cfgPath,
            JSON.stringify({ defaults: { variants: ['pure'] }, presets: { tiny: { modules: ['hex', 'b64'] } } }),
            'utf8'
        );
        const core = createFwCore({ configPath: cfgPath, preset: 'tiny' });
        expect(core.config.presets.tiny.modules).toEqual(['hex', 'b64']);
        const src = core.emit('virtual:@awacloud/fw/preset/tiny');
        expect(src).toContain("import { hex } from '@awacloud/fw/io/codec/hex.js';");
        expect(src).toContain("import { b64 } from '@awacloud/fw/io/codec/b64.js';");
        expect(src).toContain('runtime.registerAllDeep([hex, b64]);');
    });

    it('throws the actionable regeneration message when the catalog artifact is absent', async () => {
        // Copy core.js + config-resolve.js into a temp _shared dir WITHOUT the
        // catalog artifact; the loader must fail closed with the exact message.
        const dir = mkTmp();
        const shared = join(dir, 'integrations', '_shared');
        mkdirSync(shared, { recursive: true });
        copyFileSync(join(HERE, 'core.js'), join(shared, 'core.js'));
        copyFileSync(join(HERE, 'config-resolve.js'), join(shared, 'config-resolve.js'));
        const mod = await import(pathToFileURL(join(shared, 'core.js')).href);
        expect(() => mod.createFwCore()).toThrow(
            '[@awacloud/fw] integrations catalog missing/stale — run `bun run integrations:catalog` in packages/front/fw'
        );
    });
});
