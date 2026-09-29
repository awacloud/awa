// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/types/typed.d.ts
//
// Hand-authored types for the optional typed-runtime facade `@awacloud/fw/typed`.
//
// `ModuleInstanceMap` is generated (see `tools/codegen-types/`). This file
// wraps it into a `TypedModuleRuntime` view whose `resolve` / `resolveAll`
// narrow by module name, plus the `InstanceOf` helper. Nothing here changes
// runtime behaviour — `asTyped` is an identity cast at the value level.

import type { ModuleRuntime, ModuleDefinition } from '../dist/types/core/runtime';
import type { ModuleInstanceMap } from './registry.generated';

export type { ModuleInstanceMap };

/**
 * Instance type produced by a module definition's `factory` — what
 * `resolve('<name>')` returns. Works on any module value :
 *
 * ```ts
 * import type { InstanceOf } from '@awacloud/fw/typed';
 * import { hex } from '@awacloud/fw/io/codec/hex.js';
 * type HexCodec = InstanceOf<typeof hex>;
 * ```
 */
export type InstanceOf<M extends { factory: (...args: any[]) => any }> =
    ReturnType<M['factory']>;

/** Every module name known to the generated registry. */
export type ModuleName = Extract<keyof ModuleInstanceMap, string>;

/** Mirror of the runtime's resolve options (kept inline to avoid a hard dep). */
export interface ResolveOptions {
    isolation?: boolean;
    version?: string;
    instances?: Map<string, unknown>;
}

/**
 * A `ModuleRuntime` view whose `resolve` / `resolveAll` narrow by module name.
 *
 * - `resolve('hex')` → the `hex` instance type (no type parameter needed).
 * - `resolve('hex@1.0.0')` or any unknown string → falls back to the generic
 *   `T = unknown` overload.
 *
 * All other runtime methods (`register`, `has`, `list`, `serialize`, …) are
 * inherited unchanged.
 */
export type TypedModuleRuntime = Omit<ModuleRuntime, 'resolve' | 'resolveAll'> & {
    resolve<K extends ModuleName>(spec: K, options?: ResolveOptions): ModuleInstanceMap[K];
    resolve<T = unknown>(spec: string, options?: ResolveOptions): T;

    resolveAll<K extends ModuleName>(
        specs: readonly K[],
        options?: ResolveOptions
    ): { [P in K]: ModuleInstanceMap[P] };
    resolveAll(specs: readonly string[], options?: ResolveOptions): Record<string, unknown>;
};

/**
 * Identity cast that re-types an existing runtime as a {@link TypedModuleRuntime}.
 * Zero runtime cost — the returned object IS the input runtime.
 *
 * ```ts
 * import fw from '@awacloud/fw';
 * import modules from '@awacloud/fw/core/modules.js';
 * import { asTyped } from '@awacloud/fw/typed';
 *
 * fw.runtime.registerAll(modules);
 * const rt = asTyped(fw.runtime);
 * const hex = rt.resolve('hex');   // typed, no <T> needed
 * ```
 */
export declare function asTyped(runtime: ModuleRuntime): TypedModuleRuntime;

/**
 * Minimal injector : create a fresh runtime, deep-register the given modules
 * (transitive `deps` included via `registerAllDeep`), and return it already
 * typed as {@link TypedModuleRuntime}.
 *
 * The standalone-TS counterpart to the build-tool `standalone` output : compose
 * a runtime à la carte from subpath-imported modules, with narrowed `resolve`.
 *
 * ```ts
 * import { createRuntime } from '@awacloud/fw/typed';
 * import { hex } from '@awacloud/fw/io/codec/hex.js';
 * import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';
 *
 * const rt = createRuntime([hex, sanitize]);   // tree-shakable, deep-registered
 * const codec = rt.resolve('hex');             // HexAPI — inferred
 * ```
 *
 * **Narrowing caveat** — `resolve` is typed against the full catalog, not the
 * registered subset (module `name` is `string` in the emitted declarations, not
 * a literal). Only `resolve(name)` for modules you injected ; an unregistered
 * name type-checks but throws "Module not found" at runtime.
 *
 * @param modules Array of module definitions, or a namespace object whose values
 *   are module definitions (the shape of `@awacloud/fw/core/modules`).
 */
export declare function createRuntime(
    modules?: readonly ModuleDefinition[] | Record<string, ModuleDefinition>
): TypedModuleRuntime;
