// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/astro/index.js
/**
 * @fileoverview Official Astro integration for `@awacloud/fw`.
 *
 * Astro builds on **Vite**, so this integration does NOT reimplement the
 * virtual-module logic : it re-injects the existing `@awacloud/fw/vite` plugin via
 * the `astro:config:setup` hook. The virtual presets
 * (`virtual:@awacloud/fw/preset/*`, `…/side-bundle/*`) are then available in any
 * Astro app — `.astro` frontmatter, islands, endpoints — for free.
 *
 * Sanity layer : injected as a **client-only** page script via Astro's
 * `injectScript('page', …)`, NOT through the Vite plugin's `sanity` option.
 * Reason : `sanity/base.js` freezes `window`/`document` and must never run on
 * the SSR server. The Vite plugin injects sanity via `transformIndexHtml`, but
 * Astro generates its own page HTML (Vite's HTML transform does not run for
 * Astro pages) — so we force `sanity: false` on the Vite plugin and let Astro
 * place the script on the client only.
 *
 * SSR : `render.toHTML` (worker-safe, pure data) can run in `.astro`
 * frontmatter / endpoints to produce markup ; the client island rehydrates
 * via `uiSession.hydrate`. This integration does NOT bridge JSX/elm-array —
 * it lets you USE fw inside an Astro app (islands + SSR data).
 *
 * Usage :
 *
 *     // astro.config.mjs
 *     import { defineConfig } from 'astro/config';
 *     import fwAstro from '@awacloud/fw/astro';
 *
 *     export default defineConfig({
 *         integrations: [fwAstro({ preset: 'site-interactive', sanity: 'community' })],
 *     });
 *
 *     // any .astro / island script
 *     import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
 *
 * @see ../vite/index.js   the plugin this integration re-injects
 * @see ./README.md
 */

import fwVite from '../vite/index.js';
import { sanityImportLine } from '../_shared/core.js';

/**
 * @typedef {Object} FwAstroOptions
 * @property {string}                    [preset='site']           Default preset for the bare `virtual:@awacloud/fw/preset` specifier.
 * @property {string[]}                  [sideBundles=[]]          Side-bundles validated up-front.
 * @property {('base'|'community'|false)} [sanity=false]           Inject the sanity layer as a client-only page script. `'community'` is recommended: it validates inputs without freezing prototypes or blocking APIs. `'base'` is the strict lockdown (frozen prototypes / blocked APIs) — use only when you need the full enforcement.
 * @property {boolean}                   [devToolbar]              Override for Astro's dev toolbar. Default: disabled only when `sanity: 'base'` is active (frozen prototypes / blocked APIs break the toolbar); `community` keeps the toolbar enabled; without sanity it is untouched.
 * @property {string}                    [packageName='@awacloud/fw']   Package specifier used in the emitted imports.
 * @property {string}                    [configPath]              Override `fw.config.json` path.
 */

/**
 * @param {FwAstroOptions} [options]
 * @returns {{ name: string, hooks: Record<string, Function> }} Astro integration
 */
export default function fwAstro(options = {}) {
    const sanity = options.sanity || false;
    const pkg = options.packageName || '@awacloud/fw';
    // The Vite plugin handles virtual modules ; sanity is forced off here and
    // placed client-only by Astro (see file header).
    const viteOptions = { ...options, sanity: false };
    delete viteOptions.devToolbar;

    return {
        name: '@awacloud/fw',
        hooks: {
            'astro:config:setup': ({ updateConfig, injectScript }) => {
                updateConfig({ vite: { plugins: [fwVite(viteOptions)] } });
                if (sanity) {
                    // 'page' → runs on the client for every page, before islands.
                    // Routed through the shared `sanityImportLine` (rather than
                    // building its own bare-import literal) so the injected
                    // script is the INVOKING form (`import {applyBase} …;
                    // applyBase();`) — a bare side-effect import of the
                    // explicit-call ESM tiers is inert (FINDINGS §c.1).
                    // `injectScript`'s body accepts arbitrary statements, so
                    // the multi-statement snippet is not a problem here.
                    injectScript('page', sanityImportLine(sanity, pkg).trim());
                    // Only the strict `base` lockdown breaks the dev toolbar (frozen
                    // prototypes / blocked APIs). `community` is toolbar-safe.
                    if (sanity === 'base' && options.devToolbar !== true) {
                        updateConfig({ devToolbar: { enabled: false } });
                    }
                }
            },
        },
    };
}
