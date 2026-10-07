// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The `oconvDefaultFaces` STAND-IN descriptor — the name-only
 * seam through which the `md → pdf` writer facade (`../ir-to-pdf.js`) reaches
 * an OPTIONAL default face pack without importing it (the optional default-face pack).
 *
 * ## Why a stand-in
 *
 * An fw factory never sees the runtime: `ModuleRuntime#resolve` invokes
 * `def.factory.apply({}, deps)` (`@awacloud/fw` `core/runtime.js`, the
 * `resolve` path), so only RESOLVED DEPENDENCIES reach it — `oconvIrToPdf`
 * cannot probe `runtime.has(...)` from inside its factory. The fw-native way
 * to depend on an optional module by NAME is therefore a stand-in registered
 * under that same name at the LOWEST version:
 *
 * - a descriptor without an explicit version defaults to `'0.0.0'`
 *   (`DEFAULT_VERSION`, `core/runtime.js`), the lowest semver there is;
 * - `ModuleRuntime#register` re-points an entry's `latestDef` only when the
 *   newly registered version sorts `>=` the current latest.
 *
 * So a registered face pack carrying any version above `0.0.0` (the
 * companion face pack ships `1.0.0`) displaces this stand-in WHICHEVER ORDER
 * the two are registered in, and registration alone switches the default
 * tier on — no import of the companion package, no flag.
 *
 * ## Shape
 *
 * The resolved API mirrors the registered `oconvDefaultFaces` descriptor's
 * frozen surface — `{ defaultFaces, family, release }` — with the "absent"
 * values: `defaultFaces()` returns `null` (the facade then leaves the
 * default tier empty and every existing call byte-identical), `family` and
 * `release` are `null`.
 *
 * It carries NO bytes and closes over nothing, so it is capture-free
 * (`fw/no-factory-capture`) and survives `ModuleRuntime#serialize`. Bytes
 * never travel inside a descriptor: a worker receives the registered map as
 * `writeOpts.defaultFaces` (structured clone).
 *
 * ## Host rule
 *
 * `ModuleRuntime` caches resolved instances. Register the real face pack
 * BEFORE the first `resolve('oconvIrToPdf')` (or of anything depending on
 * it), or afterwards call
 * `runtime.invalidate('oconvDefaultFaces', { cascade: true })` so the facade
 * is rebuilt against the pack.
 *
 * @module oconv/write/pdf/default-faces
 */

/**
 * Stand-in `oconvDefaultFaces` module descriptor (no face pack registered).
 *
 * Public API (`runtime.resolve('oconvDefaultFaces')`, while no real pack
 * displaces it):
 *
 * | Member | Value |
 * |---|---|
 * | `defaultFaces()` | `null` |
 * | `family` | `null` |
 * | `release` | `null` |
 *
 * @type {{name: 'oconvDefaultFaces', version: '0.0.0', dependencies: [],
 *         deps: [], factory: Function}}
 */
export const oconvDefaultFacesAbsent = {
    name: 'oconvDefaultFaces',     // the frozen pack name — the only token oconv knows
    version: '0.0.0',              // lowest version: any registered real pack displaces it
    dependencies: [],
    deps: [],
    factory() {
        return { defaultFaces: () => null, family: null, release: null };
    }
};
