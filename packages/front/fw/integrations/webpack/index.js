// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/webpack/index.js
/**
 * @fileoverview Official Webpack 5 plugin for `@awacloud/fw` (consumer).
 *
 * Exposes the same virtual modules as every other adapter :
 *   - `virtual:@awacloud/fw/preset/<name>`       — pre-instantiated runtime for a preset.
 *   - `virtual:@awacloud/fw/side-bundle/<name>`  — `install(runtime)` helper for a side-bundle.
 *
 * Webpack has no `resolveId`/`load` like Rollup, but **Webpack 5 supports
 * custom URI schemes** — the same mechanism the built-in `DataUriPlugin` uses
 * for `data:` URIs. We tap :
 *   - `normalModuleFactory.hooks.resolveForScheme.for('virtual')` — claim our
 *     `virtual:@awacloud/fw/*` specifiers and tag them as JavaScript ;
 *   - `NormalModule.getCompilationHooks(...).readResourceForScheme.for('virtual')`
 *     — return the generated source (shared `_shared/core.js`).
 *
 * This keeps the integration **dependency-free** : no `webpack-virtual-modules`,
 * no custom loader. The emitted code is identical to Vite / esbuild / Rollup.
 *
 * The sanity layer is injected by prepending a module SPECIFIER to every
 * entry's import list (idiomatic Webpack polyfill-injection), so it runs
 * before app code. Webpack has no snippet-injection seam (unlike Vite/
 * esbuild/Rollup/Bun, which are driven by `core.sanityImportLine` and can
 * inject `import {applyBase} …; applyBase();`), so every tier prepends a
 * SELF-APPLYING subpath instead of the explicit-call ESM source — a bare
 * import of the latter is inert since the sanity tiers became explicit-call
 * ES modules (FINDINGS §c.1):
 *   - `base` / `community` → the **built classic-artifact subpath**
 *     `@awacloud/fw/sanity/<tier>.classic` (e.g.
 *     `dist/build/sanity-base-classic.min.js`) ;
 *   - `lockdown` → `@awacloud/fw/sanity/lockdown.apply`, the self-applying
 *     ESM wrapper around `lockdown()` (BL-45: this branch used to prepend the
 *     bare `@awacloud/fw/sanity/lockdown` specifier and therefore applied
 *     NOTHING — `sanity: 'lockdown'` was silently a no-op). There is no
 *     `lockdown.classic` artifact; the wrapper is the ESM equivalent.
 * Each of those self-applies on import, so a bare side-effect import of it is
 * sufficient.
 *
 * Requires **Webpack 5** (`compiler.webpack`, scheme hooks).
 *
 * Usage :
 *
 *     // webpack.config.js
 *     const { FwWebpackPlugin } = require('@awacloud/fw/webpack');
 *     module.exports = {
 *         entry: './src/app.js',
 *         plugins: [new FwWebpackPlugin({ preset: 'site-interactive', sanity: 'base' })],
 *     };
 *
 *     // src/app.js
 *     import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
 *
 * @see ../_shared/core.js
 * @see ../nextjs/README.md   (Next.js builds on this plugin via `withFw`)
 */

import { createFwCore } from '../_shared/core.js';

const PLUGIN = 'FwWebpackPlugin';
const SCHEME = 'virtual';

/**
 * @typedef {Object} FwWebpackOptions
 * @property {string}                    [preset='site']           Default preset for the bare `virtual:@awacloud/fw/preset` specifier.
 * @property {string[]}                  [sideBundles=[]]          Side-bundles validated up-front.
 * @property {('base'|'community'|'lockdown'|false)} [sanity=false]  Prepend the sanity layer to every entry.
 * @property {string}                    [packageName='@awacloud/fw']   Package specifier used in the emitted imports.
 * @property {string}                    [configPath]              Override `fw.config.json` path.
 */

export class FwWebpackPlugin {
    /** @param {FwWebpackOptions} [options] */
    constructor(options = {}) {
        /** @private */
        this._core = createFwCore(options);
        /** @private */
        this._sanity = options.sanity || false;
    }

    /** @param {any} compiler  Webpack 5 compiler. */
    apply(compiler) {
        const core = this._core;
        const sanity = this._sanity;

        // 1. Sanity layer : prepend the side-effect module to each entry's
        //    import list so prototypes are frozen before app code runs.
        //    EVERY tier must resolve to a SELF-APPLYING subpath — the sanity
        //    tiers are explicit-call ES modules, so prepending their source
        //    subpath applies nothing at all (see file header).
        //    `base`/`community` → the built classic artifact ;
        //    `lockdown`        → the `lockdown.apply` ESM wrapper (BL-45).
        if (sanity) {
            const sanityMod = sanity === 'lockdown'
                ? `${core.pkg}/sanity/lockdown.apply`
                : `${core.pkg}/sanity/${sanity}.classic`;
            prependToEntries(compiler.options && compiler.options.entry, sanityMod);
        }

        // 2. Virtual modules via Webpack 5 scheme hooks.
        const NormalModule = compiler.webpack && compiler.webpack.NormalModule;
        if (!NormalModule) {
            throw new Error(`[${PLUGIN}] requires Webpack 5 (compiler.webpack.NormalModule is unavailable).`);
        }

        // 3. eval-devtool guard : `mode: 'development'` defaults `devtool` to
        //    'eval', which wraps every module in eval() — the sanity layer
        //    blocks eval at runtime, so the bundle throws 'not allowed' on
        //    load. Checked lazily (first compilation) because Webpack applies
        //    option defaults AFTER plugins are constructed.
        let devtoolChecked = false;

        compiler.hooks.compilation.tap(PLUGIN, (compilation, { normalModuleFactory }) => {
            if (sanity && !devtoolChecked) {
                devtoolChecked = true;
                const devtool = compiler.options && compiler.options.devtool;
                if (typeof devtool === 'string' && devtool.includes('eval')) {
                    compilation.warnings.push(
                        new compiler.webpack.WebpackError(
                            `[${PLUGIN}] devtool '${devtool}' wraps modules in eval(), which the ` +
                                `'${sanity}' sanity layer blocks at runtime — the bundle will throw ` +
                                `'not allowed' on load. Use devtool: 'source-map' (or false).`
                        )
                    );
                }
            }
            normalModuleFactory.hooks.resolveForScheme
                .for(SCHEME)
                .tap(PLUGIN, (resourceData) => {
                    const id = resourceData.resource;
                    if (!core.isVirtualId(id)) return undefined; // not ours — let others handle
                    resourceData.path = id;
                    resourceData.query = '';
                    resourceData.fragment = '';
                    resourceData.data = resourceData.data || {};
                    // Drive Webpack's default JS rule (matches text/application javascript mimetypes).
                    resourceData.data.mimetype = 'text/javascript';
                    return true;
                });

            NormalModule.getCompilationHooks(compilation).readResourceForScheme
                .for(SCHEME)
                .tap(PLUGIN, (resource) => {
                    if (!core.isVirtualId(resource)) return undefined;
                    return core.emit(resource);
                });
        });
    }
}

/**
 * Prepend a side-effect import to every entry's import list. Handles Webpack 5's
 * normalised entry object (`{ name: { import: [...] } }`) as well as the
 * string / array / function shorthands.
 *
 * @param {unknown} entry  `compiler.options.entry`.
 * @param {string}  mod    Module specifier to prepend.
 */
function prependToEntries(entry, mod) {
    if (!entry) return;
    // Normalised object form : { main: { import: [...] }, ... }
    if (typeof entry === 'object' && !Array.isArray(entry)) {
        for (const key of Object.keys(entry)) {
            const e = entry[key];
            if (e && Array.isArray(e.import)) {
                if (!e.import.includes(mod)) e.import.unshift(mod);
            } else if (typeof e === 'string') {
                entry[key] = { import: [mod, e] };
            } else if (Array.isArray(e)) {
                if (!e.includes(mod)) e.unshift(mod);
            }
        }
    }
    // String / array shorthands are normalised by Webpack before `apply` in
    // most setups ; the object branch covers the common case. Function entries
    // (`() => ...`) are left untouched — document manual sanity import there.
}

export default FwWebpackPlugin;
