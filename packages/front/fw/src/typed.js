// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/typed.js
/**
 * @fileoverview Typed-runtime facade entry (`@awacloud/fw/typed`).
 *
 * Two siblings, same goal — give `resolve(name)` / `resolveAll(names)` a
 * precise return type narrowed by module name (see `types/typed.d.ts` + the
 * generated `types/registry.generated.d.ts`) :
 *
 *   - `asTyped(rt)`       : re-type an existing runtime (identity at runtime).
 *   - `createRuntime(ms)` : build a fresh runtime, deep-register `ms`, typed.
 *
 * Narrowing caveat : `resolve` is typed against the FULL catalog, not against
 * what you actually registered (module `name` is `string` in the emitted
 * `.d.ts`, not a literal, so the registered set can't be tracked at the type
 * level). Only call `resolve(name)` for modules you injected — resolving an
 * unregistered name type-checks but throws "Module not found" at runtime.
 *
 * `asTyped` imports nothing ; `createRuntime` pulls `ModuleRuntime`. Consumers
 * using only `asTyped` tree-shake `createRuntime` (and `ModuleRuntime`) away.
 */

import { ModuleRuntime } from './core/runtime.js';

/**
 * Identity cast — re-types an existing runtime. The real typing lives in
 * `types/typed.d.ts`.
 * @param {*} runtime
 * @returns {*}
 */
export const asTyped = (runtime) => runtime;

/**
 * Minimal injector : create a `ModuleRuntime`, deep-register the given modules
 * (via `registerAllDeep`, so transitive `deps` come along), and return it.
 * Typed as `TypedModuleRuntime` in `types/typed.d.ts`.
 *
 * Accepts an array of module definitions or a namespace object whose values
 * are module definitions (the shape of `@awacloud/fw/core/modules`).
 *
 * @param {*} [modules]
 * @returns {*}
 */
export const createRuntime = (modules) => {
    const rt = new ModuleRuntime();
    if (modules) {
        rt.registerAllDeep(Array.isArray(modules) ? modules : Object.values(modules));
    }
    return rt;
};
