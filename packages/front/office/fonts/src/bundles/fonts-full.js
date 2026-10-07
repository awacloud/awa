// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/fonts/bundles/fonts-full` — 100 % OpenType +
 * RM05 hinting + complex shapers + WOFF2 write + DSIG.
 *
 * Pure fw factory descriptor. Composes `fontsLargeBundle` with the heavy
 * extras :
 *  - TT bytecode hinting VM (RM05)
 *  - Complex shapers : Arabic, Indic, CJK
 *  - WOFF2 write encoder
 *  - DSIG digital signature parser
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('fontsFullBundle')`. The
 * runtime resolves `fontsLargeBundle` (and therefore the `fonts` core)
 * before wiring the heavy extras into it.
 *
 * @module fonts/bundles/fonts-full
 */

import { fontsLargeBundle } from './fonts-large.js';
import { extraTtHinting } from '../extra/tt-hinting.js';
import { extraShaperArabic } from '../extra/shaper-arabic.js';
import { extraShaperIndic } from '../extra/shaper-indic.js';
import { extraShaperCjk } from '../extra/shaper-cjk.js';
import { extraWoff2Write } from '../extra/woff2-write.js';
import { extraDsig } from '../extra/dsig.js';

export const fontsFullBundle = {
    name: 'fontsFullBundle',
    dependencies: [
        'fontsLargeBundle',
        'extraTtHinting',
        'extraShaperArabic', 'extraShaperIndic', 'extraShaperCjk',
        'extraWoff2Write', 'extraDsig'
    ],
    deps: [fontsLargeBundle, extraTtHinting, extraShaperArabic, extraShaperIndic, extraShaperCjk, extraWoff2Write, extraDsig],
    factory(fonts,
            extraTtHinting,
            extraShaperArabic, extraShaperIndic, extraShaperCjk,
            extraWoff2Write, extraDsig) {
        fonts.use(
            extraTtHinting,
            extraShaperArabic, extraShaperIndic, extraShaperCjk,
            extraWoff2Write, extraDsig
        );
        return fonts;
    }
};
