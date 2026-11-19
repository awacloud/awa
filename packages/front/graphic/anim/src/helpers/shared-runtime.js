// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The ONE `ModuleRuntime` the constructible helpers
 * (`createPageflip`, `createHypertree`) share.
 *
 * Each helper registers its composed descriptor and that descriptor's whole
 * `deps` closure (`registerDeep`, which skips modules already registered), then
 * resolves what it needs. One runtime resolves ONE `graphic.scheduler`
 * singleton, so a page using both helpers runs one animation-frame loop, not
 * one per helper.
 *
 * The runtime is built lazily (nothing runs at import) and reference-counted:
 * every acquire is paired with a release, and the last release drops it, so a
 * page that disposes every helper instance keeps no engine instance alive. The
 * next acquire builds a fresh runtime.
 *
 * Internal to the package: not an exports entry, not a module descriptor.
 *
 * @module graphic/helpers/shared-runtime
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';

/** @type {ModuleRuntime|null} The shared runtime, while any helper instance lives. */
let _runtime = null;

/** @type {number} Live helper instances: acquires not yet released. */
let _live = 0;

/**
 * Count one more live helper instance and return the shared runtime, with
 * `descriptor` and its `deps` closure registered on it. Pair with
 * {@link releaseRuntime}.
 *
 * @param {{ name: string }} descriptor A composed module descriptor.
 * @returns {ModuleRuntime}
 */
export function acquireRuntime(descriptor) {
    if (_runtime === null) _runtime = new ModuleRuntime();
    _runtime.registerDeep(descriptor);
    _live += 1;
    return _runtime;
}

/**
 * Drop one live helper instance; the last one drops the runtime. Never goes
 * negative.
 *
 * @returns {void}
 */
export function releaseRuntime() {
    if (_live === 0) return;
    _live -= 1;
    if (_live === 0) _runtime = null;
}
