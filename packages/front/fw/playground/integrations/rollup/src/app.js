// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Consumer entry — imports the pre-instantiated runtime for the `core` preset
// (the preset is set in rollup.config.js via fwRollup({ preset: 'core' })).
import { runtime, moduleNames } from 'virtual:@awacloud/fw/preset/core';

// Resolve one of the preset's modules from the runtime.
const first = moduleNames[0];
const mod = runtime.resolve(first);

console.log('[playground/rollup] preset "core" modules:', moduleNames);
console.log(`[playground/rollup] resolved "${first}":`, mod);
