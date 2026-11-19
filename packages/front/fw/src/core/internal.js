// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview The internal slot of a module API: the primitives some
 * modules expose for their vector tests and for one another (`makeSha` of
 * sha256 / sha512, the NTT of ml_kem, `encodeTlv` of hybridSign…). They sit
 * under a non-enumerable property keyed by a registered symbol, so they are
 * not part of the API object's keys, its types or its documentation, and
 * are outside the semver contract (`docs/guide/stability.md`).
 *
 * A factory cannot import this file (factories are capture-free: a worker
 * re-evaluates their source), so it writes
 * `Object.defineProperty(api, Symbol.for('@awacloud/fw/internal'), { value })`
 * and reads a dependency's slot as `dep[Symbol.for('@awacloud/fw/internal')]`.
 * Tests and tools use the helpers below. This file is not in the package's
 * `exports` map.
 */

/** The registered symbol keying the internal slot. */
export const INTERNAL = Symbol.for('@awacloud/fw/internal');

/**
 * The internal slot of an API object (or `undefined`).
 * @param {object} api
 * @returns {any}
 */
export function internalOf(api) {
    return api == null ? undefined : api[INTERNAL];
}
