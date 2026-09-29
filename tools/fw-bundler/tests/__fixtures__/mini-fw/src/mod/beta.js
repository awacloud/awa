// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — depends on alpha (exercises the deps ↔ dependencies invariant).
import { alpha } from './alpha.js';

export const beta = {
    name: 'beta',
    version: '1.0.0',
    dependencies: ['alpha'],
    deps: [alpha],
    factory(alpha) {
        return { b: 2, base: alpha };
    },
};
