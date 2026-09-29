// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { runtime } from 'virtual:@awacloud/fw/preset/core';

// Resolve a module bundled into the `core` preset.
const signal = runtime.resolve('signal');

// Tiny demo: a reactive counter driven by the resolved `signal` module.
const count = signal.create(0);
count.set(count.get() + 1);

const app = document.querySelector('#app');
app.textContent = `core preset ready — signal value = ${count.get()}`;
