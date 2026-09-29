// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/vite/index.d.ts

/** A Vite plugin definition (minimal subset — full type lives in `vite`). */
export interface VitePluginShape {
    name: string;
    enforce?: 'pre' | 'post';
    resolveId?(id: string): string | null;
    load?(id: string): string | null;
    transform?(code: string, id: string): { code: string; map: null } | null;
}

export interface FwPluginOptions {
    /** Default preset exposed at `virtual:@awacloud/fw/preset` (no suffix). Defaults to `'site'`. */
    preset?: string;
    /** Side-bundle names to pre-resolve as separate Vite chunks. */
    sideBundles?: readonly string[];
    /** Sanity layer to inject at every entry. `false` (default) skips injection. */
    sanity?: 'base' | 'community' | 'lockdown' | false;
    /** Workspace-alias override. Defaults to `'@awacloud/fw'`. */
    packageName?: string;
    /** Override the path to `config.json`. */
    configPath?: string;
}

export default function fwVitePlugin(options?: FwPluginOptions): VitePluginShape;
