// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/media/stream/eslint.config.js
//
// Package-local ESLint flat config for @awacloud/media-stream, after the
// @awacloud/graphic-anim config. The fw flat config scopes
// `fw/no-factory-capture` to files relative to packages/front/fw, which is
// vacuous from here: this config re-applies the rule on this package's
// `src/`. `@eslint/js` and `globals` are reused from fw's installed copies.
//
// Run from this directory: bunx eslint . --max-warnings 0

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = async (relative) => (await import(pathToFileURL(resolve(HERE, relative)).href)).default;

const fw = await load('../../fw/integrations/eslint/no-factory-capture.js');
const js = await load('../../fw/node_modules/@eslint/js/src/index.js');
const globals = await load('../../fw/node_modules/globals/index.js');

const base = {
    ...js.configs.recommended,
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: { ...globals.browser, ...globals.worker },
    },
};

const rules = {
    ...js.configs.recommended.rules,
    'no-unused-vars': ['error', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
    }],
    eqeqeq: ['warn', 'smart'],
    'no-var': 'error',
    'no-eval': 'error',
};

export default [
    {
        ignores: ['dist/**', 'node_modules/**'],
    },

    // Module descriptors: worker-serializable factories.
    {
        ...base,
        files: ['src/**/*.js'],
        plugins: { fw },
        rules: { ...rules, 'fw/no-factory-capture': 'error' },
    },

    // Tests, bench scripts (Bun or a browser) and the demo page; factories there may capture.
    {
        ...base,
        files: ['**/*.test.js', 'tests/**/*.js', 'bench/**/*.js', 'demo/**/*.js'],
        languageOptions: {
            ...base.languageOptions,
            globals: { ...globals.browser, ...globals.worker, ...globals.node },
        },
        plugins: { fw },
        rules: { ...rules, 'fw/no-factory-capture': 'off' },
    },
];
