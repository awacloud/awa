// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/vite/vite-env.d.ts
//
// Ambient types for the virtual modules emitted by the @awacloud/fw Vite plugin.
// Enable in your project with one line (e.g. in a `vite-env.d.ts` or any .ts
// in the include set) :
//
//     /// <reference types="@awacloud/fw/vite-env" />
//
// Then `runtime` imported from a preset virtual module is already a
// TypedModuleRuntime — `runtime.resolve('hex')` narrows by name, no `asTyped`,
// no type parameter.
//
// IMPORTANT — this file is a *global script* (no top-level import/export) so the
// `declare module 'virtual:...'` blocks are ambient. Cross-package types are
// pulled in via inline `import('...')` type queries, which do NOT turn the file
// into a module.

declare module 'virtual:@awacloud/fw/preset/*' {
    /** Pre-instantiated runtime, narrowed by module name. */
    export const runtime: import('@awacloud/fw/typed').TypedModuleRuntime;
    /** Names of the top-level modules registered for this preset. */
    export const moduleNames: string[];
}

declare module 'virtual:@awacloud/fw/side-bundle/*' {
    /** Register every module of this side-bundle onto a runtime. */
    export function install(runtime: import('@awacloud/fw/core/runtime').ModuleRuntime): void;
    /** The side-bundle's module definitions. */
    export const modules: import('@awacloud/fw/core/runtime').ModuleDefinition[];
    /** Names of the modules in this side-bundle. */
    export const moduleNames: string[];
}
