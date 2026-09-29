// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/nestjs/index.d.ts
// Types for the `@awacloud/fw` NestJS integration. Does NOT depend on
// `@nestjs/common` — the dynamic module is typed structurally.

/** Minimal shape of an imported fw module object. */
export interface FwModuleObject {
    name: string;
    type?: string;
    factory: (...args: any[]) => any;
    deps?: unknown[];
    [k: string]: unknown;
}

export interface FwForFeatureOptions {
    /** Mark the produced Nest module as global. Default: `false`. */
    global?: boolean;
    /** Allow `fw.dom.*` (browser-only) modules server-side. Default: `false`. */
    allowDom?: boolean;
}

/** Structural Nest `DynamicModule` (no dependency on `@nestjs/common`). */
export interface FwDynamicModule {
    module: typeof FwModule;
    providers: Array<{ provide: string; useValue: unknown }>;
    exports: string[];
    global?: boolean;
}

export class FwModule {
    /** Expose the resolved fw modules as Nest providers (token = module name). */
    static forFeature(modules: FwModuleObject[], options?: FwForFeatureOptions): FwDynamicModule;
}

export default FwModule;
