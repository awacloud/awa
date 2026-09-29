// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';

// Reuses the committed shim from `@awacloud/fw` (see integrations/vitest/README.md).
const shim = createRequire(import.meta.url).resolve('@awacloud/fw/vitest/shim');

export default defineConfig({
    resolve: {
        alias: [{ find: /^bun:test$/, replacement: shim }],
    },
    test: {
        environment: 'node',
    },
});
