// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/nextjs/index.js
/**
 * @fileoverview Official Next.js integration for `@awacloud/fw`.
 *
 * `withFw(nextConfig, fwOptions)` wraps a Next.js config to expose the
 * `virtual:@awacloud/fw/preset/*` / `…/side-bundle/*` modules in the **Webpack**
 * build, by plugging the existing `@awacloud/fw/webpack` plugin into Next's
 * `webpack(config)` hook. It composes with any `webpack` function already on
 * the config.
 *
 * Scope (explicit) :
 *   - **Webpack AND Turbopack.** The Webpack build goes through the
 *     `@awacloud/fw/webpack` plugin; Turbopack (default since Next 16) cannot run
 *     Webpack plugins, so the virtual modules are MATERIALIZED to real files
 *     and wired through `turbopack.resolveAlias` (see ../turbopack/index.js).
 *     Both paths expose the same `virtual:@awacloud/fw/*` specifiers.
 *   - **Sanity is NOT injected here.** The sanity layers are browser-only and
 *     must never run on the Next server. Next manages entry points itself (the
 *     Webpack plugin's entry-prepend can't reach them). Place the `community`
 *     layer client-side — a root `'use client'` component that does
 *     `import { applyCommunity } from '@awacloud/fw/sanity/community';
 *     applyCommunity();` (a bare side-effect import is inert — `community` is
 *     an explicit-call ES module, FINDINGS §c.1). Under `community`, `<Link>`
 *     / `history` client navigation works normally. See README for the
 *     recommended pattern.
 *   - **Not a React bridge.** This lets you USE fw inside a Next app (a widget
 *     mounted in `useEffect`, or SSR data via `render.toHTML`) — it does NOT
 *     marry fw's elm-array rendering with JSX.
 *
 * Usage :
 *
 *     // next.config.mjs
 *     import withFw from '@awacloud/fw/next';
 *     export default withFw({ &#47;* your next config *&#47; }, { preset: 'site-interactive' });
 *
 *     // any client component / island
 *     import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
 *
 * @see ../webpack/index.js   the plugin this wraps
 * @see ./README.md
 */

import { FwWebpackPlugin } from '../webpack/index.js';
import { fwTurbopack } from '../turbopack/index.js';

/**
 * @typedef {Object} FwNextOptions
 * @property {string}   [preset='site']           Default preset for the bare `virtual:@awacloud/fw/preset` specifier.
 * @property {string[]} [sideBundles=[]]          Side-bundles validated up-front.
 * @property {string}   [packageName='@awacloud/fw']   Package specifier used in the emitted imports.
 * @property {string}   [configPath]              Override `fw.config.json` path.
 */

/**
 * Wrap a Next.js config so the `@awacloud/fw` virtual modules resolve in the
 * Webpack build. Sanity is intentionally NOT injected here (browser-only,
 * client-side — see file header / README). Recommended: a root
 * `'use client'` component that imports `applyCommunity` from
 * `@awacloud/fw/sanity/community` and calls it (bare side-effect import does
 * nothing — the tier is explicit-call).
 *
 * @param {Record<string, any>} [nextConfig]  The user's Next.js config.
 * @param {FwNextOptions}       [fwOptions]    Options forwarded to the Webpack plugin.
 * @returns {Record<string, any>} The augmented Next.js config.
 */
export default function withFw(nextConfig = {}, fwOptions = {}) {
    // Turbopack path (default engine since Next 16) : materialize the virtual
    // modules into `.fw-virtual/` and alias the specifiers to those files.
    // Composes with any `turbopack` config already present.
    const { resolveAlias } = fwTurbopack(fwOptions);

    return {
        ...nextConfig,
        turbopack: {
            ...(nextConfig.turbopack || {}),
            resolveAlias: {
                ...((nextConfig.turbopack || {}).resolveAlias || {}),
                ...resolveAlias,
            },
        },
        webpack(config, options) {
            config.plugins = config.plugins || [];
            // `sanity: false` — Next owns entry points; the community sanity
            // layer is placed client-side by the app (see README), not via the
            // build. `<Link>` / history navigation works under community.
            config.plugins.push(new FwWebpackPlugin({ ...fwOptions, sanity: false }));
            // Compose with a pre-existing `webpack` hook on the user's config.
            if (typeof nextConfig.webpack === 'function') {
                return nextConfig.webpack(config, options);
            }
            return config;
        },
    };
}
