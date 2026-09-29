// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Resolved by the `@awacloud/fw/bun` plugin to a pre-instantiated `core` preset runtime.
import { runtime, moduleNames } from 'virtual:@awacloud/fw/preset/core';

// The virtual module already registered every `core` module on the runtime.
console.log('preset "core" modules:', moduleNames.join(', '));

// Resolve one of them through the runtime — `clock` has no dependencies.
const clock = runtime.resolve('clock');
console.log('resolved clock:', typeof clock, 'now =', clock.now());
