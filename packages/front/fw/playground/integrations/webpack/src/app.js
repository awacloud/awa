// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// src/app.js
// Consumes the pre-instantiated `core` preset runtime emitted by FwWebpackPlugin.
import { runtime, moduleNames } from 'virtual:@awacloud/fw/preset/core';

// Resolve a module from the runtime — `errors` ships in the `core` preset.
const errors = runtime.resolve('errors');

const result = [
    `preset modules: ${moduleNames.join(', ')}`,
    `resolved "errors": ${typeof errors}`,
].join('\n');

// Show the result both in the console and on the page.
console.log('[@awacloud/fw playground]\n' + result);

const el = document.getElementById('out');
if (el) el.textContent = result;
