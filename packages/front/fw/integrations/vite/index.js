// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/vite/index.js
/**
 * @fileoverview Official Vite plugin for `@awacloud/fw`.
 *
 * Exposes virtual modules :
 *   - `virtual:@awacloud/fw/preset/<name>`        — pre-instantiated runtime for a preset.
 *   - `virtual:@awacloud/fw/side-bundle/<name>`   — `install(runtime)` helper for a side-bundle.
 *
 * Module imports use **direct subpath specifiers** — `@awacloud/fw/io/codec/hex.js`,
 * `@awacloud/fw/dom/rendering/sanitize.js`, … — resolved by the `./io/*`,
 * `./dom/*`, `./crypto/*`, `./process/*` wildcards in `package.json#exports`.
 * The plugin emits exactly the same import shape a user would write by hand :
 *
 *     import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';
 *     runtime.registerDeep(sanitize);
 *
 * That keeps the plugin's generated code idiomatic, tree-shakeable, and free
 * of any reliance on `@awacloud/fw/core/modules` (which is the autonomous-mode
 * catalogue — `default export [...]`, no named exports).
 *
 * Transitive closure is achieved via `registerAllDeep`, which walks each
 * module's `deps` field. Each module source statically imports its sibling
 * dependencies — Vite/Rollup follow those `import { dep } from './sibling.js'`
 * statements and trace the graph automatically.
 *
 * Reads the same `fw.config.json` as the autonomous build, plus
 * scans `src/` once at plugin instantiation to know each module's file path
 * (so it can emit subpath imports). The scan happens once per Vite session.
 *
 * Usage :
 *
 *     import fw from '@awacloud/fw/vite';
 *     export default { plugins: [fw({ preset: 'site-interactive', sideBundles: ['crypto-basic'], sanity: 'base' })] };
 *
 *     import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
 *     const cryptoBasic = await import('virtual:@awacloud/fw/side-bundle/crypto-basic');
 *     cryptoBasic.install(runtime);
 */

import { resolve } from 'node:path';

import { createFwCore, CATALOG_PATH } from '../_shared/core.js';

const RESOLVED_PREFIX = '\0';

/**
 * @typedef {Object} FwPluginOptions
 * @property {string}                       [preset='site']     Default preset exposed at `virtual:@awacloud/fw/preset` (no suffix).
 * @property {string[]}                     [sideBundles=[]]    Side-bundles validated up-front so misconfigurations fail at server start.
 * @property {('base'|'community'|'lockdown'|false)}    [sanity=false]      Inject the sanity layer as the first <head> module script of every page (client-only).
 * @property {string}                       [packageName='@awacloud/fw']  Workspace-alias override.
 * @property {string}                       [configPath]        Override config.json path (defaults to the bundled one).
 */

/**
 * @param {FwPluginOptions} [options]
 * @returns {import('vite').Plugin}
 */
export default function fwVitePlugin(options = {}) {
    const sanity = options.sanity || false;
    // Shared core : config load + committed-catalog read + virtual
    // matcher/emitter. Built once, cached for the plugin's lifetime — this
    // single construction is EXACTLY what `vite build` runs (it never calls
    // `configureServer`), so production output is untouched by everything
    // below: `core.reload()` is reachable only through the dev-only hook.
    const core = createFwCore(options);

    return {
        name: '@awacloud/fw',
        enforce: 'pre',

        resolveId(id) {
            return core.isVirtualId(id) ? RESOLVED_PREFIX + id : null;
        },

        load(id) {
            if (!id.startsWith(RESOLVED_PREFIX)) return null;
            return core.emit(id.slice(RESOLVED_PREFIX.length));
        },

        // Dev-only : close the restart gap (W0 FINDINGS § 3.2) — editing
        // `fw.config.json` or regenerating the committed catalog used to
        // require killing and restarting `vite dev`, because `core` was
        // built once at plugin construction and never re-read. This hook is
        // Vite's own dev-server seam (never invoked by `vite build`), so it
        // is the preferred host seam over adding a second file watcher of
        // our own into `_shared/core.js`.
        //
        // Watches BOTH inputs `core.emit()` depends on — `fw.config.json`
        // (`core.configPath`, default or `options.configPath` override) and
        // the generated catalog (`CATALOG_PATH`, always the one committed
        // location) — invalidation must be total, closing only one leaves
        // the other's edits silently requiring a restart.
        configureServer(server) {
            const watched = new Set([resolve(core.configPath), resolve(CATALOG_PATH)]);

            server.watcher.add([...watched]);

            const onFsEvent = (file) => {
                if (!watched.has(resolve(file))) return;

                try {
                    // Re-read + re-validate both inputs and swap the cache
                    // atomically — see core.js `reload()`. A bad edit throws
                    // and leaves the previous (working) cache in place.
                    core.reload();
                } catch (err) {
                    server.config.logger.error(
                        `[@awacloud/fw] reload failed after a change to ${file}: ${err.message}`,
                        { error: /** @type {Error} */ (err), timestamp: true }
                    );
                    return;
                }

                // The virtual modules are whole-graph structural output (an
                // entirely different `import` list per preset/side-bundle),
                // not a value HMR can patch in place — invalidate every
                // previously-resolved module so the next request re-runs
                // `load()` against the fresh core state, then force the
                // browser to reload so the new graph is actually fetched.
                server.moduleGraph.invalidateAll();
                const hot = server.hot ?? server.ws; // Vite ≥6 renamed `ws` to `hot`; `ws` still exists as an alias.
                hot.send({ type: 'full-reload' });
            };

            server.watcher.on('change', onFsEvent);
            server.watcher.on('add', onFsEvent);
        },

        // Sanity injection — inject the invoking sanity snippet as the FIRST
        // module script in every page's <head>. Module scripts execute in
        // document order, so this locks down `window`/`document` synchronously
        // before any app entry runs — matching the documented manual pattern
        // (`<script src=".../sanity/base.js">` first in <head>).
        //
        // `order: 'pre'` is REQUIRED : the injected script carries a bare *package*
        // specifier inside the snippet (`@awacloud/fw/sanity/...`). Only `transformIndexHtml`
        // hooks that run BEFORE Vite's core HTML plugin get their inline module
        // scripts processed — bundled in `build`, bare-specifier-resolved in
        // `dev`. A default/`post` hook injects the tag too late, so the bare
        // import survives verbatim into the page and the browser throws
        // "specifier was not remapped".
        //
        // Why not a `transform` hook keyed on `ModuleInfo.isEntry` (the previous
        // approach) : Vite's dev server does NOT support `ModuleInfo.isEntry`
        // (`getModuleInfo(id).isEntry` throws "not supported"), so `vite dev`
        // 500'd. `isEntry` is also wrong under SSR (server entries would get the
        // browser lockdown). `transformIndexHtml` is client-only and works in
        // both `dev` and `build`.
        //
        // CAVEAT — documented only, NOT fixed here (pre-existing, orthogonal
        // to the ESM sanity conversion; W0 FINDINGS §b.5): the injected script
        // carries `type: 'module'`, and per the HTML spec module scripts are
        // DEFERRED until after HTML parsing completes, unlike a classic
        // blocking `<script>`. Any inline classic script, inline event
        // handler, or non-module script that runs *during* parsing therefore
        // observes an UNLOCKED realm — the "applies before all app code"
        // guarantee here depends on app code itself being loaded as a module
        // (or later). This is Vite's existing `<script type="module">`
        // injection behaviour, unchanged by and unrelated to the
        // import→invoke snippet fix; the zero-bundler classic-`<script>` path
        // (§b.4) keeps the synchronous, ordering-independent guarantee.
        transformIndexHtml: {
            order: 'pre',
            handler() {
                if (!sanity) return;
                return [{
                    tag: 'script',
                    // Extension-less specifier : the `./sanity/base` / `./sanity/community`
                    // entries in package.json#exports are explicit (no `.js`).
                    attrs: { type: 'module' },
                    children: core.sanityImportLine(sanity).trim(),
                    injectTo: 'head-prepend',
                }];
            },
        },
    };
}
