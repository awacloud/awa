// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Barrel entry point for the Apple Advanced Typography
 * (AAT) parser scaffolds. Strict factory-only — exposes a single
 * `aatBarrel` descriptor whose `factory()` returns the array of the six
 * AAT factory descriptors. Direct per-table imports continue to live
 * under `./morx.js`, `./kerx.js`, `./ankr.js`, `./prop.js`, `./lcar.js`,
 * `./feat.js`.
 *
 *  - `aatMorx`  : extended glyph metamorphosis (`morx`)
 *  - `aatKerx`  : extended kerning (`kerx`)
 *  - `aatAnkr`  : anchor points (`ankr`)
 *  - `aatProp`  : glyph properties (`prop`)
 *  - `aatLcar`  : ligature carets (`lcar`)
 *  - `aatFeat`  : feature names (`feat`)
 *
 * Parse functions live on each factory result — resolve via your
 * ModuleRuntime to obtain them.
 *
 * @module fonts/extra/apple-aat
 */

/**
 * Factory exposing the AAT factory list. Consumers that need the array
 * can `import { aatBarrel }`, register its dependencies, and resolve it
 * to read `aatFactories`.
 */
import { aatMorx } from './morx.js';
import { aatKerx } from './kerx.js';
import { aatAnkr } from './ankr.js';
import { aatProp } from './prop.js';
import { aatLcar } from './lcar.js';
import { aatFeat } from './feat.js';

export const aatBarrel = {
    name: 'aatBarrel',
    dependencies: ['aatMorx', 'aatKerx', 'aatAnkr', 'aatProp', 'aatLcar', 'aatFeat'],
    deps: [aatMorx, aatKerx, aatAnkr, aatProp, aatLcar, aatFeat],
    factory(morx, kerx, ankr, prop, lcar, feat) {
        return { aatFactories: [morx, kerx, ankr, prop, lcar, feat] };
    }
};
