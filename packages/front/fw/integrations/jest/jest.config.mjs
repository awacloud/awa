// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/jest/jest.config.mjs
/**
 * @fileoverview Jest config to run the `@awacloud/fw` suite under Node, without
 * touching the tests. ESM-native (the package is `"type": "module"`), so it
 * requires `node --experimental-vm-modules` (wired in the `test:jest` script).
 *
 * - `moduleNameMapper` aliases `bun:test` → the shim (re-exports `@jest/globals`).
 * - `transform: {}` disables Babel → Jest runs the source as native ESM.
 * - `testEnvironment: 'node'` mirrors bun : no DOM preload ; the DOM tests
 *   register happy-dom themselves via `GlobalRegistrator.register()`.
 *
 * Run :  `bun run test:jest`
 *   (= `node --experimental-vm-modules node_modules/jest/bin/jest.js -c integrations/jest/jest.config.mjs`)
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

export default {
    rootDir: ROOT,
    testMatch: ['<rootDir>/src/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/', '\\.kat\\.js$'],
    moduleNameMapper: {
        '^bun:test$': '<rootDir>/integrations/jest/bun-test-shim.js',
    },
    testEnvironment: 'node',
    // Native ESM : no Babel/ts-jest transform.
    transform: {},
};
