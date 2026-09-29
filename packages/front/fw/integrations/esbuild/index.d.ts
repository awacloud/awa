// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/esbuild/index.d.ts
// Types for the `@awacloud/fw` esbuild plugin. Intentionally does NOT depend on the
// `esbuild` package — we type against a minimal structural plugin shape so the
// integration stays dependency-free (same convention as vite/index.d.ts).

export interface FwEsbuildOptions {
    /** Default preset for the bare `virtual:@awacloud/fw/preset` specifier. Default: `'site'`. */
    preset?: string;
    /** Side-bundles validated up-front (fail fast on misconfiguration). */
    sideBundles?: string[];
    /** Prepend the sanity layer to every entry point. Default: `false`. */
    sanity?: 'base' | 'community' | 'lockdown' | false;
    /** Package specifier used in the emitted imports. Default: `'@awacloud/fw'`. */
    packageName?: string;
    /** Override `fw.config.json` path. */
    configPath?: string;
    /** Dir from which the emitted `@awacloud/fw/*` imports resolve. Default: build cwd. */
    resolveDir?: string;
}

/** Minimal structural shape of an esbuild plugin (no dependency on `esbuild`). */
export interface FwEsbuildPlugin {
    name: string;
    setup(build: unknown): void;
}

/** Create the `@awacloud/fw` esbuild consumer plugin. */
export default function fwEsbuild(options?: FwEsbuildOptions): FwEsbuildPlugin;
