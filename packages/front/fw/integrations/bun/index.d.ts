// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/bun/index.d.ts
// Types for the `@awacloud/fw` Bun plugin. Does NOT depend on `bun-types` — typed
// against a minimal structural plugin shape (same convention as the other
// bundler adapters).

export interface FwBunOptions {
    /** Default preset for the bare `virtual:@awacloud/fw/preset` specifier. Default: `'site'`. */
    preset?: string;
    /** Side-bundles validated up-front (fail fast on misconfiguration). */
    sideBundles?: string[];
    /** Prepend the sanity layer to every entry point (build-time only). Default: `false`. */
    sanity?: 'base' | 'community' | 'lockdown' | false;
    /** Package specifier used in the emitted imports. Default: `'@awacloud/fw'`. */
    packageName?: string;
    /** Override `fw.config.json` path. */
    configPath?: string;
}

/** Minimal structural shape of a Bun plugin (no dependency on `bun-types`). */
export interface FwBunPlugin {
    name: string;
    setup(build: unknown): void;
}

/** Create the `@awacloud/fw` Bun consumer plugin (works with `Bun.build` and runtime `plugin()`). */
export default function fwBun(options?: FwBunOptions): FwBunPlugin;
