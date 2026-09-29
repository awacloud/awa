// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/rollup/index.d.ts
// Types for the `@awacloud/fw` Rollup plugin. Does NOT depend on the `rollup`
// package — typed against a minimal structural plugin shape (same convention
// as vite/index.d.ts and esbuild/index.d.ts).

export interface FwRollupOptions {
    /** Default preset for the bare `virtual:@awacloud/fw/preset` specifier. Default: `'site'`. */
    preset?: string;
    /** Side-bundles validated up-front (fail fast on misconfiguration). */
    sideBundles?: string[];
    /** Prepend the sanity layer to every entry chunk. Default: `false`. */
    sanity?: 'base' | 'community' | 'lockdown' | false;
    /** Package specifier used in the emitted imports. Default: `'@awacloud/fw'`. */
    packageName?: string;
    /** Override `fw.config.json` path. */
    configPath?: string;
}

/** Minimal structural shape of a Rollup plugin (no dependency on `rollup`). */
export interface FwRollupPlugin {
    name: string;
    resolveId(id: string): string | null;
    load(id: string): string | null;
    transform(code: string, id: string): { code: string; map: null } | null;
}

/** Create the `@awacloud/fw` Rollup consumer plugin. */
export default function fwRollup(options?: FwRollupOptions): FwRollupPlugin;
