// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The package's modules, resolved once for the bench and
 * its experiments.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { mediaAudioModules } from '../../src/main.js';

const runtime = new ModuleRuntime();
runtime.registerAllDeep(mediaAudioModules);

export const modules = {
    baseline: runtime.resolve('audio.baseline'),
    fir: runtime.resolve('audio.fir'),
    resample: runtime.resolve('audio.resample'),
    nibbles: runtime.resolve('audio.nibbles'),
    wavelet: runtime.resolve('audio.wavelet'),
    codec: runtime.resolve('audio.codec'),
};
