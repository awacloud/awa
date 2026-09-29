// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/bun/index.js
/**
 * @fileoverview Official Bun plugin for `@awacloud/fw` (consumer).
 *
 * IMPORTANT — this is the *consumer* plugin, for a third-party app built or
 * run with Bun that wants the virtual presets. It is DISTINCT from the
 * internal builder (`tools/fw-bundler` (`bundle`)) which uses `Bun.build` to produce
 * `dist/build/*`. Same engine, different perimeters — do not conflate them.
 *
 * Exposes the same virtual modules as every other adapter :
 *   - `virtual:@awacloud/fw/preset/<name>`       — pre-instantiated runtime for a preset.
 *   - `virtual:@awacloud/fw/side-bundle/<name>`  — `install(runtime)` helper for a side-bundle.
 *
 * `Bun.plugin` mirrors esbuild's `onResolve`/`onLoad`, so this adapter is the
 * shortest port. The emitted code (shared `_shared/core.js`) is identical to
 * the Vite / esbuild / Rollup output.
 *
 * Usage — at build time :
 *
 *     import fwBun from '@awacloud/fw/bun';
 *     await Bun.build({
 *         entrypoints: ['./src/app.js'],
 *         outdir: './dist',
 *         plugins: [fwBun({ preset: 'site-interactive', sanity: 'base' })],
 *     });
 *
 * Usage — at runtime (bunfig.toml `preload`) :
 *
 *     // bunfig.toml :  preload = ["./fw-register.js"]
 *     // fw-register.js :
 *     import { plugin } from 'bun';
 *     import fwBun from '@awacloud/fw/bun';
 *     plugin(fwBun({ preset: 'site' }));
 *
 * @see ../_shared/core.js
 * @see ../esbuild/index.js   near-identical adapter
 */

import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';

import {
    createFwCore,
    VIRTUAL_PRESET_PREFIX,
    VIRTUAL_SIDE_PREFIX,
} from '../_shared/core.js';

const NAMESPACE = 'awa-fw';
const FILTER = /^virtual:@awacloud\/fw\/(preset|side-bundle)(\/.*)?$/;

/**
 * @param {string} file
 * @returns {('js'|'jsx'|'ts'|'tsx')}
 */
function loaderFor(file) {
    switch (extname(file)) {
        case '.ts': return 'ts';
        case '.tsx': return 'tsx';
        case '.jsx': return 'jsx';
        default: return 'js';
    }
}

/**
 * @typedef {Object} FwBunOptions
 * @property {string}                    [preset='site']           Default preset for the bare `virtual:@awacloud/fw/preset` specifier.
 * @property {string[]}                  [sideBundles=[]]          Side-bundles validated up-front.
 * @property {('base'|'community'|'lockdown'|false)} [sanity=false]  Prepend the sanity layer to every entry point (build-time only).
 * @property {string}                    [packageName='@awacloud/fw']   Package specifier used in the emitted imports.
 * @property {string}                    [configPath]              Override `fw.config.json` path.
 */

/**
 * @param {FwBunOptions} [options]
 * @returns {{ name: string, setup: (build: any) => void }} Bun plugin
 */
export default function fwBun(options = {}) {
    const sanity = options.sanity || false;
    // Shared core : config load + source-tree scan + virtual matcher/emitter.
    const core = createFwCore(options);

    return {
        name: '@awacloud/fw',
        setup(build) {
            // 0. RUNTIME mode (`plugin()` via bunfig `preload`) : static imports
            //    of virtual specifiers are not routed through `onResolve` — the
            //    runtime API for non-file modules is `build.module(exactId, cb)`.
            //    The specifier set is enumerable from the config, so register
            //    every preset / side-bundle up-front. Runtime is detected by the
            //    ABSENCE of `build.config` (present in `Bun.build`, where
            //    `build.module` exists but throws, and the onResolve/onLoad pair
            //    below applies instead).
            if (!build.config && typeof build.module === 'function') {
                const ids = [
                    VIRTUAL_PRESET_PREFIX,
                    ...Object.keys(core.config.presets || {}).map((n) => `${VIRTUAL_PRESET_PREFIX}/${n}`),
                    ...Object.keys(core.config.sideBundles || {}).map((n) => `${VIRTUAL_SIDE_PREFIX}/${n}`),
                ];
                for (const id of ids) {
                    const contents = core.emit(id);
                    if (contents == null) continue;
                    build.module(id, () => ({ contents, loader: 'js' }));
                }
            }

            // 1. Virtual modules (Bun.build).
            build.onResolve({ filter: FILTER }, (args) => ({ path: args.path, namespace: NAMESPACE }));

            build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => {
                const contents = core.emit(args.path);
                if (contents == null) return undefined;
                return { contents, loader: 'js' };
            });

            // 2. Sanity layer on entry points (build-time only ; `build.config`
            //    is present for `Bun.build`, absent for a runtime `plugin()`).
            const entrypoints = build.config && Array.isArray(build.config.entrypoints)
                ? build.config.entrypoints
                : [];
            if (sanity && entrypoints.length) {
                const entries = new Set(entrypoints.map((p) => resolve(process.cwd(), p)));
                build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
                    if (!entries.has(args.path)) return undefined;
                    const original = readFileSync(args.path, 'utf8');
                    return { contents: core.sanityImportLine(sanity) + original, loader: loaderFor(args.path) };
                });
            }
        },
    };
}
