// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/graphic/anim/eslint.config.js
//
// Package-local ESLint flat config for @awacloud/graphic-anim.
//
// Every tree the package lints gets a real rule set, and
// `tests/lint-config.integration.test.js` proves it (rule counts through
// `--print-config`, planted violations through `--stdin`):
//
//   - src/**: the fw `src` rule set, TAKEN FROM fw's own config rather than
//     re-derived here: the sanity-derived `no-restricted-globals`,
//     `no-restricted-properties` and `no-restricted-syntax` lists (computed by
//     fw from `src/sanity/base.js`), `fw/no-factory-capture`, eqeqeq, no-var,
//     no-eval, on top of `@eslint/js` recommended. The config throws when
//     fw's block cannot be found, so a change of shape in fw can never
//     silently empty the set. (fw's own globs are relative to the fw package,
//     so fw's config never reaches these files by itself.)
//   - tests/**: recommended rules with node + browser + Bun globals; the
//     sanity restrictions and the capture rule are off (tests exercise bad
//     patterns on purpose, e.g. lint-capture.integration.test.js).
//   - tools/** and this file: recommended rules with node globals.
//   - **/*.d.ts: fw's typescript-eslint blocks, reused as they are.
//   - demos/** and playground/**: browser entry scripts, not fw descriptors:
//     recommended + the fw quality rules, without the capture rule and the
//     sanity restrictions (graphic/BATCH_14 task 06, BATCH_21 task 05).
//
// `@eslint/js`, `globals` and typescript-eslint are not devDependencies of
// this package: they are reached through fw's installed copies by relative
// path + `pathToFileURL` (`ai/conventions/tool.md` § Lint configuration).
//
// Run: bunx eslint --max-warnings 0 .   (from this package's directory)

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Import a module of the fw package by its path relative to fw's root.
 * @param {string} rel
 * @returns {Promise<any>}
 */
const fromFw = async (rel) => (await import(pathToFileURL(resolve(HERE, '../../fw', rel)).href)).default;

/** @type {typeof import('../../fw/integrations/eslint/no-factory-capture.js').default} */
const fw = await fromFw('integrations/eslint/no-factory-capture.js');
/** @type {typeof import('@eslint/js').default} */
const js = await fromFw('node_modules/@eslint/js/src/index.js');
/** @type {typeof import('globals').default} */
const globals = await fromFw('node_modules/globals/index.js');
/** @type {Array<Record<string, any>>} fw's own flat config (the source of truth for the src rule set). */
const fwConfig = await fromFw('eslint.config.js');

const sameGlobs = (block, globs) => Array.isArray(block.files)
    && block.files.length === globs.length && globs.every((g) => block.files.includes(g));

const fwSrc = fwConfig.find((b) => sameGlobs(b, ['src/**/*.js']) && b.rules && b.rules['no-restricted-properties']);
if (!fwSrc) {
    throw new Error('graphic-anim eslint: fw\'s src block (files [\'src/**/*.js\'] with no-restricted-properties) was not found in packages/front/fw/eslint.config.js');
}
const fwTs = fwConfig.filter((b) => sameGlobs(b, ['**/*.ts']) || sameGlobs(b, ['**/*.d.ts']));
if (fwTs.length === 0) {
    throw new Error('graphic-anim eslint: fw\'s typescript-eslint blocks were not found in packages/front/fw/eslint.config.js');
}

/** Same unused-vars tuning as fw and the office preset. */
const UNUSED = ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }];

export default [
    { linterOptions: { reportUnusedDisableDirectives: 'error' } },

    // Generated outputs and dependencies.
    { ignores: ['dist/**', 'node_modules/**'] },

    { ...js.configs.recommended, files: ['**/*.js', '**/*.mjs'] },

    // src/** — fw's src rule set, taken from fw's config.
    {
        files: ['src/**/*.js'],
        plugins: { fw },
        languageOptions: {
            // 'latest': the package parses import attributes (fw pins 2023).
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.worker },
        },
        rules: { ...fwSrc.rules, 'no-unused-vars': UNUSED },
    },

    // tests/** and co-located tests — real rules, restrictions off.
    {
        files: ['tests/**/*.js', '**/*.test.js', '**/*.integration.test.js'],
        plugins: { fw },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser, Bun: 'readonly' },
        },
        rules: {
            'no-unused-vars': UNUSED,
            'no-restricted-globals': 'off',
            'no-restricted-properties': 'off',
            'no-restricted-syntax': 'off',
            'no-eval': 'off',
            'fw/no-factory-capture': 'off',
        },
    },

    // tools/**, the e2e/** browser-smoke harness and this config — node scripts.
    {
        files: ['tools/**/*.mjs', 'tools/**/*.js', 'e2e/**/*.mjs', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, Bun: 'readonly' },
        },
        rules: { 'no-unused-vars': UNUSED, eqeqeq: ['warn', 'smart'], 'no-var': 'error' },
    },

    // demos/** + playground/** — browser entry scripts (see header).
    {
        files: ['demos/**/*.js', 'playground/**/*.js'],
        languageOptions: {
            // 'latest': several demos import JSON with an import attribute.
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.worker },
        },
        rules: {
            'no-unused-vars': UNUSED,
            eqeqeq: ['warn', 'smart'],
            'no-var': 'error',
            'no-eval': 'error',
            // Same rationale as fw's src block: text/binary illustrations.
            'no-control-regex': 'off',
        },
    },

    // **/*.d.ts — fw's typescript-eslint blocks, reused as they are.
    ...fwTs,
];
