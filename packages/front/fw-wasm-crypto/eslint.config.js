// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw-wasm-crypto/eslint.config.js — dev-only flat config (not shipped).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
    {
        linterOptions: { reportUnusedDisableDirectives: 'error' },
    },

    {
        ignores: ['dist/**', 'vendor/**', 'spikes/**', 'node_modules/**'],
    },

    // Core recommended (applies to every linted file).
    js.configs.recommended,

    // typescript-eslint recommended — scoped to .ts only.
    ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts'] })),

    // Shipped JS sources: browser + worker runtime.
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.worker },
        },
        rules: {
            'no-var': 'error',
            'no-eval': 'error',
            eqeqeq: ['warn', 'smart'],
        },
    },

    // Tests: Bun + node + browser globals; unused-vars off.
    {
        files: ['**/*.test.{ts,js}'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser, Bun: 'readonly' },
        },
        rules: {
            'no-unused-vars': 'off',
        },
    },

    // Declaration files: any is legitimate in type surfaces.
    {
        files: ['**/*.d.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
];
