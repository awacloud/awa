// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/fonts/bundles/fonts-apple-aat` — `fontsFullBundle`
 * + Apple AAT tables (morx, kerx, ankr, prop, lcar, feat).
 *
 * Pure fw factory descriptor. Use this bundle for tooling that targets
 * macOS-distributed fonts or needs AAT-only features (Apple system
 * emoji, advanced Type1 substitutions).
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('fontsAppleAatBundle')`. The
 * runtime resolves `fontsFullBundle` (and therefore the full chain back
 * to the `fonts` core) before wiring the six AAT factories into it.
 *
 * @module fonts/bundles/fonts-apple-aat
 */

import { fontsFullBundle } from './fonts-full.js';
import { aatMorx } from '../extra/apple-aat/morx.js';
import { aatKerx } from '../extra/apple-aat/kerx.js';
import { aatAnkr } from '../extra/apple-aat/ankr.js';
import { aatProp } from '../extra/apple-aat/prop.js';
import { aatLcar } from '../extra/apple-aat/lcar.js';
import { aatFeat } from '../extra/apple-aat/feat.js';

export const fontsAppleAatBundle = {
    name: 'fontsAppleAatBundle',
    dependencies: [
        'fontsFullBundle',
        'aatMorx', 'aatKerx', 'aatAnkr', 'aatProp', 'aatLcar', 'aatFeat'
    ],
    deps: [fontsFullBundle, aatMorx, aatKerx, aatAnkr, aatProp, aatLcar, aatFeat],
    factory(fonts, aatMorx, aatKerx, aatAnkr, aatProp, aatLcar, aatFeat) {
        fonts.use(aatMorx, aatKerx, aatAnkr, aatProp, aatLcar, aatFeat);
        return fonts;
    }
};
