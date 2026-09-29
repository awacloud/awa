// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/esbuild/index.js
/**
 * @fileoverview Official esbuild plugin for `@awacloud/fw` (consumer / role 1).
 *
 * Exposes the same virtual modules as the Vite plugin :
 *   - `virtual:@awacloud/fw/preset/<name>`       — pre-instantiated runtime for a preset.
 *   - `virtual:@awacloud/fw/side-bundle/<name>`  — `install(runtime)` helper for a side-bundle.
 *
 * The generated code is identical to every other bundler adapter (shared
 * `_shared/core.js`) : direct subpath imports (`@awacloud/fw/io/codec/hex.js`) +
 * `registerAllDeep`. esbuild follows those imports and closes the transitive
 * `deps` graph, tree-shaking what the app doesn't use.
 *
 * Virtual modules use esbuild's native `onResolve` / `onLoad` in a dedicated
 * namespace — the simplest of all the bundler ports.
 *
 * Usage :
 *
 *     import * as esbuild from 'esbuild';
 *     import fwEsbuild from '@awacloud/fw/esbuild';
 *
 *     await esbuild.build({
 *         entryPoints: ['src/app.js'],
 *         bundle: true,
 *         format: 'esm',
 *         outfile: 'dist/app.js',
 *         plugins: [fwEsbuild({ preset: 'site-interactive', sanity: 'base' })],
 *     });
 *
 *     // src/app.js
 *     import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
 *
 * NOTE — this is the *consumer* plugin. Using esbuild as the Node build
 * *backend* that replaces `Bun.build` for producing `dist/build/*` is a
 * separate concern : see `./backend.js` (role 2) and `../nodejs/README.md`.
 *
 * @see ../_shared/core.js
 * @see ../vite/index.js   reference adapter (same behaviour)
 */

import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';

import { createFwCore } from '../_shared/core.js';

const NAMESPACE = 'awa-fw';
// Matches both the bare preset specifier and the suffixed preset/side-bundle ones.
const FILTER = /^virtual:@awacloud\/fw\/(preset|side-bundle)(\/.*)?$/;

/**
 * Map a file extension to the esbuild loader used when we re-emit an entry
 * with the sanity import prepended.
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
 * Normalise esbuild's `entryPoints` (string[] | {in,out}[] | Record<out,in>)
 * to a Set of absolute input paths, resolved against the build's working dir.
 * @param {unknown} entryPoints
 * @param {string} cwd
 * @returns {Set<string>}
 */
function entryAbsPaths(entryPoints, cwd) {
    /** @type {string[]} */
    const ins = [];
    if (Array.isArray(entryPoints)) {
        for (const e of entryPoints) {
            if (typeof e === 'string') ins.push(e);
            else if (e && typeof e === 'object' && typeof e.in === 'string') ins.push(e.in);
        }
    } else if (entryPoints && typeof entryPoints === 'object') {
        for (const v of Object.values(entryPoints)) {
            if (typeof v === 'string') ins.push(v);
        }
    }
    return new Set(ins.map((p) => resolve(cwd, p)));
}

/**
 * @typedef {Object} FwEsbuildOptions
 * @property {string}                    [preset='site']           Default preset for the bare `virtual:@awacloud/fw/preset` specifier.
 * @property {string[]}                  [sideBundles=[]]          Side-bundles validated up-front.
 * @property {('base'|'community'|'lockdown'|false)} [sanity=false]  Prepend the sanity layer to every entry point.
 * @property {string}                    [packageName='@awacloud/fw']   Package specifier used in the emitted imports.
 * @property {string}                    [configPath]              Override `fw.config.json` path.
 * @property {string}                    [resolveDir]              Dir from which the emitted `@awacloud/fw/*` imports resolve (default: build cwd / process.cwd()).
 */

/**
 * @param {FwEsbuildOptions} [options]
 * @returns {{ name: string, setup: (build: any) => void }} esbuild plugin
 */
export default function fwEsbuild(options = {}) {
    const sanity = options.sanity || false;
    // Shared core : config load + source-tree scan + virtual matcher/emitter.
    const core = createFwCore(options);

    return {
        name: '@awacloud/fw',
        setup(build) {
            const cwd = (build.initialOptions && build.initialOptions.absWorkingDir) || process.cwd();
            const resolveDir = options.resolveDir || cwd;

            // 1. Virtual modules : claim the specifier, then emit its source.
            build.onResolve({ filter: FILTER }, (args) => ({ path: args.path, namespace: NAMESPACE }));

            build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => {
                const contents = core.emit(args.path);
                if (contents == null) return null;
                // resolveDir lets esbuild resolve the emitted bare `@awacloud/fw/*`
                // imports via the consumer project's node_modules.
                return { contents, loader: 'js', resolveDir };
            });

            // 2. Sanity layer : esbuild has no `isEntry` transform hook, so we
            //    re-emit each declared entry with the side-effect import prepended.
            //    (Mirrors the Vite plugin's entry-only injection.)
            if (sanity) {
                const entries = entryAbsPaths(build.initialOptions && build.initialOptions.entryPoints, cwd);
                if (entries.size) {
                    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
                        if (!entries.has(args.path)) return null;
                        const original = readFileSync(args.path, 'utf8');
                        return {
                            contents: core.sanityImportLine(sanity) + original,
                            loader: loaderFor(args.path),
                            resolveDir: resolve(args.path, '..'),
                        };
                    });
                }
            }
        },
    };
}
