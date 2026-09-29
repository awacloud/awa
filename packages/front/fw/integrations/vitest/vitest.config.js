// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/vitest/vitest.config.js
/**
 * @fileoverview Vitest config to run the `@awacloud/fw` suite under Node, without
 * touching the tests.
 *
 * How the swap works :
 *   - `alias` maps the `bun:test` specifier to `bun-test-shim.js` (re-exports
 *     the 7 used symbols from `vitest`). Every `import … from 'bun:test'` in
 *     the suite resolves to Vitest. No test file changes.
 *   - `environment: 'node'` mirrors the bun runtime exactly : bun has no DOM
 *     preload, and the DOM tests register happy-dom THEMSELVES via
 *     `GlobalRegistrator.register()` at the top of each file. So Node + those
 *     self-registrations reproduce the same environment — no `environment:
 *     'happy-dom'`, no `environmentMatchGlobs` needed.
 *
 * Run :  `bun run test:vitest`  (→ `vitest run -c integrations/vitest/vitest.config.js`)
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const HERE = dirname(fileURLToPath(import.meta.url));
const FW_ROOT = resolve(HERE, '..', '..');
const SHIM = resolve(HERE, 'bun-test-shim.js');

export default defineConfig({
    test: {
        root: FW_ROOT,
        include: ['src/**/*.test.js'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/*.kat.js'],
        // `bun:test` → Vitest, transparently.
        alias: [{ find: /^bun:test$/, replacement: SHIM }],
        environment: 'node',
    },
});
