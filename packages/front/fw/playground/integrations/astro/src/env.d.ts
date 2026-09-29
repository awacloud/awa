// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Virtual modules provided by `@awacloud/fw/astro` (which re-injects the
// `@awacloud/fw/vite` plugin). Minimal declarations for the editor /
// `astro check` — the actual resolution is done by the plugin at build time.
declare module 'virtual:@awacloud/fw/preset/*' {
    export const runtime: {
        resolve(name: string): any;
        registerAllDeep(mods: any[]): void;
    };
    export const moduleNames: string[];
}

declare module 'virtual:@awacloud/fw/side-bundle/*' {
    export const modules: any[];
    export const moduleNames: string[];
    export function install(runtime: { registerAllDeep(mods: any[]): void }): void;
}
