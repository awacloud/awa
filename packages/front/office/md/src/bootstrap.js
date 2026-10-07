// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/md/src/bootstrap.js
//
// Importable runtime-bootstrap primitive — registers @awacloud/md's four
// manifest arrays (`fw_require`, `modules`, `extras`, `bundle`, all
// re-exported unchanged from `./main.js`) on an `@awacloud/fw`
// `ModuleRuntime` and returns lazy accessors. No side effect at import :
// every registration happens inside `bootstrapMd()`. `src/main.js` stays
// the strict descriptor manifest — this file is the ONLY member of
// `src/` that instantiates.

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from './main.js';

/**
 * @typedef {object} MdBootstrap
 * @property {ModuleRuntime} runtime
 * @property {(name: string) => any} resolve   runtime.resolve(name)
 * @property {object} md          resolved 'md' facade (carries .createMd)
 * @property {object} mdFull      resolved 'mdFullBundle' (core + 10 extras)
 * @property {object} htmlDocument resolved 'mdHtmlDocument' ({ renderFragment, build })
 */

/**
 * Register @awacloud/md (fw_require + modules + extras + bundle) and return lazy accessors.
 * No side effect at import; every registration happens inside the call.
 * @param {{ runtime?: ModuleRuntime }} [opts]  a host runtime to register on (idempotent:
 *        ModuleRuntime.register replaces a same-name/same-version entry)
 * @returns {MdBootstrap}
 */
export function bootstrapMd(opts) {
    const runtime = (opts && opts.runtime) || new ModuleRuntime();
    if (typeof runtime.register !== 'function' || typeof runtime.resolve !== 'function') {
        throw new TypeError('bootstrapMd: opts.runtime must be a ModuleRuntime');   // plain TypeError, NOT an md/ code (errors-doc snapshot)
    }
    for (const m of fw_require) runtime.register(m);
    for (const m of modules)    runtime.register(m);
    for (const m of extras)     runtime.register(m);
    for (const m of bundle)     runtime.register(m);
    return {
        runtime,
        resolve: (name) => runtime.resolve(name),
        get md()     { return runtime.resolve('md'); },
        get mdFull() { return runtime.resolve('mdFullBundle'); },
        get htmlDocument() { return runtime.resolve('mdHtmlDocument'); },
    };
}
