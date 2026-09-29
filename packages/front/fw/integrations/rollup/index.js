// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/rollup/index.js
/**
 * @fileoverview Official Rollup plugin for `@awacloud/fw` (consumer / role 1).
 *
 * Exposes the same virtual modules as the Vite plugin :
 *   - `virtual:@awacloud/fw/preset/<name>`       — pre-instantiated runtime for a preset.
 *   - `virtual:@awacloud/fw/side-bundle/<name>`  — `install(runtime)` helper for a side-bundle.
 *
 * The Vite plugin IS a Rollup plugin under the hood, so this adapter is the
 * same `resolveId` / `load` / `transform` shape, minus Vite-specific niceties
 * (`enforce`). Both delegate to the shared `_shared/core.js`, so the emitted
 * code — direct subpath imports + `registerAllDeep` — is identical.
 *
 * Usage :
 *
 *     import fwRollup from '@awacloud/fw/rollup';
 *     export default {
 *         input: 'src/app.js',
 *         output: { dir: 'dist', format: 'es' },
 *         plugins: [fwRollup({ preset: 'site-interactive', sanity: 'base' })],
 *     };
 *
 *     // src/app.js
 *     import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
 *
 * NOTE — consumer plugin. Using Rollup as a Node build *backend* (role 2,
 * `@rollup/plugin-terser` for lib output) is a separate concern : see
 * `./README.md` and `../nodejs/README.md`.
 *
 * @see ../_shared/core.js
 * @see ../vite/index.js   reference adapter (same behaviour)
 */

import { createFwCore } from '../_shared/core.js';

// Rollup convention : a leading NUL marks a module id as virtual so no other
// plugin or the default resolver tries to hit the filesystem for it.
const RESOLVED_PREFIX = '\0';

/**
 * @typedef {Object} FwRollupOptions
 * @property {string}                    [preset='site']           Default preset for the bare `virtual:@awacloud/fw/preset` specifier.
 * @property {string[]}                  [sideBundles=[]]          Side-bundles validated up-front.
 * @property {('base'|'community'|'lockdown'|false)} [sanity=false]  Prepend the sanity layer to every entry chunk.
 * @property {string}                    [packageName='@awacloud/fw']   Package specifier used in the emitted imports.
 * @property {string}                    [configPath]              Override `fw.config.json` path.
 */

/**
 * @param {FwRollupOptions} [options]
 * @returns {import('rollup').Plugin}
 */
export default function fwRollup(options = {}) {
    const sanity = options.sanity || false;
    // Shared core : config load + source-tree scan + virtual matcher/emitter.
    const core = createFwCore(options);

    return {
        name: '@awacloud/fw',

        resolveId(id) {
            return core.isVirtualId(id) ? RESOLVED_PREFIX + id : null;
        },

        load(id) {
            if (!id.startsWith(RESOLVED_PREFIX)) return null;
            return core.emit(id.slice(RESOLVED_PREFIX.length));
        },

        transform(code, id) {
            if (!sanity) return null;
            const info = this.getModuleInfo && this.getModuleInfo(id);
            if (info && info.isEntry) {
                // Extension-less `./sanity/base` / `./sanity/community` subpaths.
                return { code: core.sanityImportLine(sanity) + code, map: null };
            }
            return null;
        },
    };
}
