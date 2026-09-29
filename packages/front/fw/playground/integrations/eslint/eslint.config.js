// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// playground/integrations/eslint/eslint.config.js
//
// Minimal flat config demonstrating the `fw/no-factory-capture` rule.
// Mirrors how the root eslint.config.js wires the `fw` plugin (see
// ../../../eslint.config.js: `plugins: { fw }` + `'fw/no-factory-capture': 'error'`).

import js from '@eslint/js';
import fw from '../../../integrations/eslint/no-factory-capture.js';

export default [
    js.configs.recommended,
    {
        files: ['*.js'],
        ignores: ['eslint.config.js'],
        plugins: { fw },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
        },
        rules: {
            'fw/no-factory-capture': 'error',
        },
    },
];
