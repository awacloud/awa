// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/oconv-fonts` entry point — re-exports the three
 * public functions. No side effect at import: nothing is fetched or
 * registered until a function is called.
 *
 * - `createOconvDefaultFaces(faces)` — the `oconvDefaultFaces` fw descriptor.
 * - `loadDefaultFaces(opts)` — the async byte path (five vendored faces).
 * - `registerDefaultFaces(runtime, opts)` — load + `runtime.register`.
 *
 * Frozen contract: `docs/descriptor.md`.
 */

export { createOconvDefaultFaces } from './faces.js';
export { loadDefaultFaces, registerDefaultFaces } from './loader.js';
