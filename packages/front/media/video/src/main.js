// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/media-video` — public entry point.
 *
 * The barrel of the package's fw module descriptors. No code runs at import:
 * registration is explicit,
 * `new ModuleRuntime().registerAllDeep(mediaVideoModules)`.
 *
 * @module @awacloud/media-video
 */

import { colorModule } from './color/color.js';
import { haarModule } from './haar/haar.js';
import { selectModule } from './select/select.js';
import { packModule } from './pack/pack.js';
import { nibblesModule } from './pack/nibbles.js';
import { stripsModule } from './pack/strips.js';
import { postModule } from './post/post.js';
import { reduceModule } from './reduce/reduce.js';
import { glModule } from './gl/gl.js';
import { glAnalyseModule } from './gl/analyse.js';
import { glRenderModule } from './gl/render.js';
import { codecModule } from './codec/codec.js';
import { motionModule } from './motion/motion.js';
import { grabModule } from './grab/grab.js';
import { linkModule } from './link/link.js';

/**
 * The video module descriptors in registration order (dependencies before
 * dependents). Each Track A row appends its own.
 *
 * - `video.color`: the integer colour approximation (a luma and two
 *   colour differences).
 * - `video.haar`: the two-dimensional Haar pyramid on byte planes.
 * - `video.select`: which pixels to send — the change detection, its keep
 *   delay and refresh.
 * - `video.pack`: the geometry of a frame in its shorter form, and the
 *   packet of separable units.
 * - `video.nibbles`: a band of integers in 4-bit codes with runs of zeros.
 * - `video.strips`: the design's 4-bit rewriting — strips and repetitions.
 * - `video.post`: the restoration filter of the decoder.
 * - `video.reduce`: a picture reduced by a whole number, by averaging.
 * - `video.gl`: a small WebGL2 helper for integer image passes (to move into the fw).
 * - `video.gl.analyse`: the encoder's front end on the GPU — colour then exact pyramid, bit for bit the CPU.
 * - `video.gl.render`: the decoder's back end on the GPU — the picture drawn into a canvas, bit for bit the CPU.
 * - `video.codec`: the encoder and the decoder of the layered stream.
 * - `video.motion`: exploration — one vector for a frame that only moves,
 *   and the tiles that follow it.
 * - `video.grab`: the frames of a camera or screen track read in a worker,
 *   as RGBA at the codec's size and rate (D15).
 * - `video.link`: the codec in a worker, from the grab to the picture drawn
 *   on the GPU or a 2D canvas; packets looped back or on a transport port.
 *
 * @type {import('@awacloud/fw/src/core/runtime.js').ModuleDefinition[]}
 */
export const mediaVideoModules = [
    colorModule,
    haarModule,
    selectModule,
    packModule,
    nibblesModule,
    stripsModule,
    postModule,
    reduceModule,
    glModule,
    glAnalyseModule,
    glRenderModule,
    motionModule,
    codecModule,
    grabModule,
    linkModule,
];
