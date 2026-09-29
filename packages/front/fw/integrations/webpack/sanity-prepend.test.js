// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/webpack/sanity-prepend.test.js
/**
 * @fileoverview Tests for the Webpack plugin's sanity-layer entry prepend
 * (fw/BATCH_28 task 11, BL-45).
 *
 * The defect: Webpack has no snippet-injection seam, so the plugin can only
 * PREPEND A SPECIFIER. For `sanity: 'lockdown'` it prepended the bare
 * `@awacloud/fw/sanity/lockdown` — and the sanity tiers have been
 * explicit-call ES modules since BATCH_20, so that import applied NOTHING:
 * `sanity: 'lockdown'` was silently a no-op. The fix points that branch at the
 * self-applying `@awacloud/fw/sanity/lockdown.apply` wrapper.
 *
 * Exercised against a MINIMAL fake Webpack 5 compiler exposing only the members
 * `apply()` touches (`options.entry`, `options.devtool`, `webpack.NormalModule`,
 * `webpack.WebpackError`, `hooks.compilation.tap`) — deliberately not a real
 * `webpack` install (not a devDependency of this package; the `_e2e/run.mjs`
 * leg that does use one self-skips when it is absent, and only covers
 * `sanity: 'base'`). Mirrors the sibling `../vite/dev-invalidation.test.js`,
 * which fakes a `ViteDevServer` the same way.
 *
 * The prepend happens synchronously inside `apply()`, before any hook fires,
 * so no compilation needs to be driven.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FwWebpackPlugin } from './index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// webpack/ -> integrations/ -> fw package root
const FW_ROOT = resolve(HERE, '..', '..');
const pkg = JSON.parse(readFileSync(join(FW_ROOT, 'package.json'), 'utf8'));

/**
 * Minimal fake Webpack 5 compiler. `apply()` reads `options.entry` (mutated in
 * place), `options.devtool`, requires `webpack.NormalModule` to exist, and taps
 * `hooks.compilation`.
 *
 * @param {unknown} entry `compiler.options.entry`, in any of the shapes
 *   `prependToEntries` handles.
 * @param {{ devtool?: string|false }} [opts]
 */
function makeFakeCompiler(entry, opts = {}) {
    /** @type {Function[]} */
    const compilationTaps = [];
    const noopHook = { for: () => ({ tap() { /* not driven here */ } }) };
    return {
        options: { entry, devtool: opts.devtool },
        webpack: {
            NormalModule: { getCompilationHooks: () => ({ readResourceForScheme: noopHook }) },
            WebpackError: class WebpackError extends Error {},
        },
        hooks: { compilation: { tap: (_name, fn) => compilationTaps.push(fn) } },
        compilationTaps,
    };
}

/**
 * Apply a plugin to a fresh fake compiler and return the resulting entry list
 * of the `main` entry.
 *
 * @param {ConstructorParameters<typeof FwWebpackPlugin>[0]} options
 * @param {unknown} [entry]
 * @returns {{ compiler: ReturnType<typeof makeFakeCompiler>, entry: unknown }}
 */
function applyPlugin(options, entry = { main: { import: ['./src/app.js'] } }) {
    const compiler = makeFakeCompiler(entry);
    new FwWebpackPlugin(options).apply(compiler);
    return { compiler, entry: compiler.options.entry };
}

const LOCKDOWN_APPLY = '@awacloud/fw/sanity/lockdown.apply';
const LOCKDOWN_BARE = '@awacloud/fw/sanity/lockdown';

describe('FwWebpackPlugin — sanity entry prepend', () => {
    test("sanity: 'lockdown' prepends the SELF-APPLYING wrapper subpath", () => {
        const { entry } = applyPlugin({ preset: 'core', sanity: 'lockdown' });
        expect(entry.main.import[0]).toBe(LOCKDOWN_APPLY);
    });

    // The regression lock for BL-45. The bare specifier is an explicit-call ES
    // module: prepending it applies nothing, and every build stays green while
    // `sanity: 'lockdown'` silently does nothing at all.
    test("sanity: 'lockdown' NEVER prepends the inert explicit-call source subpath", () => {
        const { entry } = applyPlugin({ preset: 'core', sanity: 'lockdown' });
        // Exact-match, not `toContain`: `lockdown.apply` starts with the bare
        // specifier, so a substring assertion would be satisfied by the defect.
        expect(entry.main.import).not.toContain(LOCKDOWN_BARE);
        expect(entry.main.import.filter((s) => String(s).includes('/sanity/'))).toEqual([LOCKDOWN_APPLY]);
    });

    test('the prepended specifier is a declared export key of this package', () => {
        const { entry } = applyPlugin({ preset: 'core', sanity: 'lockdown' });
        const subpath = `.${String(entry.main.import[0]).slice('@awacloud/fw'.length)}`;
        expect(pkg.exports[subpath]).toBeDefined();
        expect(pkg.exports[subpath].default).toBe('./src/sanity/lockdown-apply.js');
    });

    // Non-vacuity / no-collateral-damage: the two other tiers are untouched by
    // this task and must still resolve to their built classic artifacts.
    for (const tier of ['base', 'community']) {
        test(`sanity: '${tier}' still prepends the built classic artifact`, () => {
            const { entry } = applyPlugin({ preset: 'core', sanity: tier });
            expect(entry.main.import[0]).toBe(`@awacloud/fw/sanity/${tier}.classic`);
        });
    }

    test('sanity: false prepends nothing', () => {
        const { entry } = applyPlugin({ preset: 'core' });
        expect(entry.main.import).toEqual(['./src/app.js']);
    });

    test('packageName override flows into the prepended specifier', () => {
        const { entry } = applyPlugin({ preset: 'core', sanity: 'lockdown', packageName: '@scope/fw-fork' });
        expect(entry.main.import[0]).toBe('@scope/fw-fork/sanity/lockdown.apply');
    });
});

describe('FwWebpackPlugin — sanity prepend across entry shapes', () => {
    test('string shorthand is normalised, wrapper first', () => {
        const { entry } = applyPlugin({ preset: 'core', sanity: 'lockdown' }, { main: './src/app.js' });
        expect(entry.main).toEqual({ import: [LOCKDOWN_APPLY, './src/app.js'] });
    });

    test('array shorthand is unshifted', () => {
        const { entry } = applyPlugin({ preset: 'core', sanity: 'lockdown' }, { main: ['./src/app.js'] });
        expect(entry.main).toEqual([LOCKDOWN_APPLY, './src/app.js']);
    });

    test('every entry of a multi-entry build gets the wrapper', () => {
        const { entry } = applyPlugin({ preset: 'core', sanity: 'lockdown' }, {
            main: { import: ['./src/app.js'] },
            admin: { import: ['./src/admin.js'] },
        });
        expect(entry.main.import[0]).toBe(LOCKDOWN_APPLY);
        expect(entry.admin.import[0]).toBe(LOCKDOWN_APPLY);
    });

    test('an already-present wrapper is not duplicated', () => {
        const entry = { main: { import: [LOCKDOWN_APPLY, './src/app.js'] } };
        const compiler = makeFakeCompiler(entry);
        new FwWebpackPlugin({ preset: 'core', sanity: 'lockdown' }).apply(compiler);
        expect(entry.main.import).toEqual([LOCKDOWN_APPLY, './src/app.js']);
    });
});
