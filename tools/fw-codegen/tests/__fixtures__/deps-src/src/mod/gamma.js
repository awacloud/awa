// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — declares string-form `dependencies` but is MISSING the
// `deps: [...]` companion field AND the sibling import. The `deps` injector
// must add `import { alpha } from './alpha.js';` and `deps: [alpha]`.
export const gamma = {
    name: 'gamma',
    version: '1.0.0',
    dependencies: ['alpha'],
    factory(alpha) {
        return { g: 3, base: alpha };
    },
};
