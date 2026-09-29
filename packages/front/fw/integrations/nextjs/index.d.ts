// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/nextjs/index.d.ts
// Types for the `@awacloud/fw` Next.js integration. Does NOT depend on `next` — the
// Next config is typed structurally (same dependency-free convention as the
// other integrations).

export interface FwNextOptions {
    /** Default preset for the bare `virtual:@awacloud/fw/preset` specifier. Default: `'site'`. */
    preset?: string;
    /** Side-bundles validated up-front (fail fast on misconfiguration). */
    sideBundles?: string[];
    /** Package specifier used in the emitted imports. Default: `'@awacloud/fw'`. */
    packageName?: string;
    /** Override `fw.config.json` path. */
    configPath?: string;
}

/**
 * Wrap a Next.js config so the `@awacloud/fw` virtual modules resolve in the Webpack
 * and Turbopack builds. Sanity is NOT injected here (browser-only). Recommended:
 * place `@awacloud/fw/sanity/community` in a root `'use client'` component —
 * `<Link>` / history navigation works under `community`.
 */
export default function withFw<T extends Record<string, unknown>>(
    nextConfig?: T,
    fwOptions?: FwNextOptions,
): T & { webpack: (config: any, options: unknown) => any };
