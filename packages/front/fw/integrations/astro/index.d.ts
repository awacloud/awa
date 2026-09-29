// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/astro/index.d.ts
// Types for the `@awacloud/fw` Astro integration. Does NOT depend on the `astro`
// package — typed against a minimal structural integration shape (same
// dependency-free convention as the bundler adapters).

export interface FwAstroOptions {
    /** Default preset for the bare `virtual:@awacloud/fw/preset` specifier. Default: `'site'`. */
    preset?: string;
    /** Side-bundles validated up-front (fail fast on misconfiguration). */
    sideBundles?: string[];
    /**
     * Inject the sanity layer as a client-only page script. Default: `false`.
     * `'community'` is recommended: validates inputs without freezing prototypes
     * or blocking APIs (the dev toolbar stays enabled). `'base'` is the strict
     * lockdown — freezes prototypes / blocks APIs (disables the dev toolbar).
     */
    sanity?: 'base' | 'community' | false;
    /**
     * Override for Astro's dev toolbar. Default: disabled only when
     * `sanity: 'base'` is active (frozen prototypes / blocked APIs break the
     * toolbar); `sanity: 'community'` keeps the toolbar enabled; without
     * `sanity` the toolbar is untouched.
     */
    devToolbar?: boolean;
    /** Package specifier used in the emitted imports. Default: `'@awacloud/fw'`. */
    packageName?: string;
    /** Override `fw.config.json` path. */
    configPath?: string;
}

/** Minimal structural shape of an Astro integration (no dependency on `astro`). */
export interface FwAstroIntegration {
    name: string;
    hooks: Record<string, (...args: unknown[]) => void>;
}

/** Create the `@awacloud/fw` Astro integration (re-injects the Vite plugin). */
export default function fwAstro(options?: FwAstroOptions): FwAstroIntegration;
