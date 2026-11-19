// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/media-stream` — public entry point.
 *
 * The barrel of the package's fw module descriptors. No code runs at import:
 * registration is explicit,
 * `new ModuleRuntime().registerAllDeep(mediaStreamModules)`.
 *
 * @module @awacloud/media-stream
 */

import { frameModule } from './frame/frame.js';

/**
 * The stream module descriptors in registration order.
 *
 * - `media.frame`: the frame around each unit that travels — a 12-byte
 *   header (kind, layer, key id, per-layer sequence, media time, flags),
 *   the smaller of deflated or stored, a relay's header read, and a loss
 *   counter (row B5a, ruling D19).
 *
 * @type {import('@awacloud/fw/core/runtime.js').ModuleDefinition[]}
 */
export const mediaStreamModules = [frameModule];
