// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/media-audio` — public entry point.
 *
 * The barrel of the package's fw module descriptors. No code runs at import:
 * registration is explicit,
 * `new ModuleRuntime().registerAllDeep(mediaAudioModules)`.
 *
 * @module @awacloud/media-audio
 */

import { planesModule } from './baseline/planes.js';
import { firModule } from './baseline/fir.js';
import { resampleModule } from './baseline/resample.js';
import { baselineModule } from './baseline/baseline.js';
import { nibblesModule } from './wavelet/nibbles.js';
import { waveletModule } from './wavelet/wavelet.js';
import { codecModule } from './codec/codec.js';
import { webaudioModule } from './webaudio/webaudio.js';
import { linkModule } from './link/link.js';
import { gateModule } from './gate/gate.js';
import { mixModule } from './mix/mix.js';

/**
 * The audio module descriptors in registration order (dependencies before
 * dependents). Each Track A row appends its own.
 *
 * - `audio.planes`, `audio.fir`, `audio.resample`, `audio.baseline`: the
 *   owner's original voice chain, the baseline of the bench.
 * - `audio.nibbles`: integers in 4-bit codes (bands with runs of zeros,
 *   plain sequences).
 * - `audio.wavelet`: an integer wavelet pyramid per frame (the codec's transform)
 *   (Haar or 5/3 lifting), written as separable layers.
 * - `audio.codec`: the retained codec — the 5/3 wavelet with a step that
 *   follows the level, alone or behind the original low-pass and
 *   decimation; options and presets.
 * - `audio.webaudio`: the Web Audio graph of the bindings (D15) - an audio
 *   context, a capture node and a playback node in an AudioWorklet.
 * - `audio.link`: the codec in a worker, between a capture port and a
 *   playback port; packets looped back or on a transport port.
 * - `audio.gate`: the activity gate - which frames carry sound worth
 *   sending, by a hold counter or a peak follower (row A8a).
 * - `audio.mix`: a mixer of frames - sum, the R&D's envelope, average, or
 *   a limiter (row A9).
 *
 * @type {import('@awacloud/fw/src/core/runtime.js').ModuleDefinition[]}
 */
export const mediaAudioModules = [
    planesModule,
    firModule,
    resampleModule,
    baselineModule,
    nibblesModule,
    waveletModule,
    codecModule,
    webaudioModule,
    linkModule,
    gateModule,
    mixModule,
];
