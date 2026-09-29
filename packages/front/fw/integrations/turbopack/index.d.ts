// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/turbopack/index.d.ts
// Types for the `@awacloud/fw` Turbopack adapter. Dependency-free (same
// convention as the other adapters).

export interface FwTurbopackOptions {
    /** Default preset for the bare `virtual:@awacloud/fw/preset` specifier. Default: `'site'`. */
    preset?: string;
    /** Side-bundles validated up-front (fail fast on misconfiguration). */
    sideBundles?: string[];
    /** Package specifier used in the emitted imports. Default: `'@awacloud/fw'`. */
    packageName?: string;
    /** Override `fw.config.json` path. */
    configPath?: string;
    /** Directory (relative to cwd) receiving the materialized modules. Default: `'.fw-virtual'`. */
    outDir?: string;
}

export interface FwTurbopackResult {
    /**
     * `virtual:@awacloud/fw/*` specifier → generated-file path (project-root
     * relative). Reading any property of this object (access, `Object.keys`,
     * a `{ ...spread }`) lazily triggers materialization — see `materialize`.
     */
    resolveAlias: Record<string, string>;
    /** Absolute path of the generated directory (not created until materialization runs). */
    outDir: string;
    /**
     * Rewrite `outDir` from scratch and write every planned module to disk.
     * Idempotent (a second call is a no-op). Called automatically the first
     * time `resolveAlias` is read; exposed so a caller can trigger it
     * explicitly instead.
     */
    materialize(): void;
}

/**
 * Build the Turbopack alias map for the configured virtual modules. Reads
 * `fw.config.json` + the catalog and computes the map ENTIRELY IN MEMORY —
 * this alone never touches disk. The directory rm+mkdir+write is deferred to
 * `materialize()`, run lazily on first read of `resolveAlias`.
 */
export function fwTurbopack(options?: FwTurbopackOptions): FwTurbopackResult;
export default fwTurbopack;
