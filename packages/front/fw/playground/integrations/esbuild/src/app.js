// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { runtime, moduleNames } from 'virtual:@awacloud/fw/preset/core';

// The virtual preset module exposes a pre-instantiated ModuleRuntime with every
// module of the `core` preset registered. Resolve the first one and log it.
const first = moduleNames[0];
const resolved = runtime.resolve(first);

console.log('[playground/esbuild] core preset modules:', moduleNames);
console.log(`[playground/esbuild] resolved "${first}" ->`, resolved);
