// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// tools/convert/eslint.config.js
//
// Own flat ESLint config for @awacloud/tool-convert, cloned from
// tools/sbom/eslint.config.js (sibling small tool, same runtime).
//
// TypeScript run by Bun — Node + Bun globals, no browser/Worker surface.
// tests/fixtures/** holds byte-copied office documents — never linted.
//
// Run:  bunx eslint . --max-warnings 0
// Needs (devDependencies): eslint  @eslint/js  typescript-eslint  globals

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
    {
        ignores: ['node_modules/**', 'tmp/**', 'dist/**', 'tests/fixtures/**'],
    },

    js.configs.recommended,

    ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts'] })),

    {
        files: ['src/**/*.ts', 'scripts/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node, Bun: 'readonly' },
        },
        rules: {
            eqeqeq: ['warn', 'smart'],
            'no-var': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
        },
    },

    {
        files: ['**/*.test.ts', '**/*.integration.test.ts'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node, Bun: 'readonly' },
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },
];
