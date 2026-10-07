// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/fonts/bundles/fonts-large` — extended fonts bundle.
 *
 * Pure fw factory descriptor. Declares the core `fonts` orchestrator and
 * the most-used read-path extras (`extraMath`, `extraJstf`) as dependencies.
 * The runtime resolves every dependency transitively and passes the
 * already-constructed instances to the factory, which wires them into the
 * `fonts` core via `fonts.use(...)` and returns the enriched instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('fontsLargeBundle')`.
 *
 * Coverage (vs the core already provided by the `fonts` factory + its
 * transitive table/* / sfnt/* / variable/* / embed-pdf / standard14 /
 * encodings dependencies registered alongside it):
 *  - BASE / JSTF / MATH metadata
 *
 * Excludes (use `fontsFullBundle` for those) :
 *  - TT bytecode hinting VM (RM05)
 *  - Apple AAT
 *  - Complex shapers (Arabic / Indic / CJK)
 *  - WOFF2 write encoder
 *  - DSIG signature parsing
 *
 * @module fonts/bundles/fonts-large
 */

import { fonts } from '../fonts.js';
import { extraMath } from '../extra/math.js';
import { extraJstf } from '../extra/jstf.js';

export const fontsLargeBundle = {
    name: 'fontsLargeBundle',
    dependencies: ['fonts', 'extraMath', 'extraJstf'],
    deps: [fonts, extraMath, extraJstf],
    factory(fonts, extraMath, extraJstf) {
        fonts.use(extraMath, extraJstf);
        return fonts;
    }
};
