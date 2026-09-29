// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/webpack/index.d.ts
// Types for the `@awacloud/fw` Webpack plugin. Does NOT depend on `webpack` — the
// compiler is typed as `unknown` (same dependency-free convention as the other
// bundler adapters).

export interface FwWebpackOptions {
    /** Default preset for the bare `virtual:@awacloud/fw/preset` specifier. Default: `'site'`. */
    preset?: string;
    /** Side-bundles validated up-front (fail fast on misconfiguration). */
    sideBundles?: string[];
    /** Prepend the sanity layer to every entry. Default: `false`. */
    sanity?: 'base' | 'community' | 'lockdown' | false;
    /** Package specifier used in the emitted imports. Default: `'@awacloud/fw'`. */
    packageName?: string;
    /** Override `fw.config.json` path. */
    configPath?: string;
}

/** Webpack 5 plugin exposing the `@awacloud/fw` virtual modules via scheme hooks. */
export class FwWebpackPlugin {
    constructor(options?: FwWebpackOptions);
    apply(compiler: unknown): void;
}

export default FwWebpackPlugin;
