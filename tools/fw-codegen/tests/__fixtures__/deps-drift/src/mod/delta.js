// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — ALREADY carries a `deps` field that correctly mirrors
// `dependencies` (BL-5 content-leg baseline: `hasDepsField` alone cannot
// tell a correct field from a stale one, so the tests exercising drift
// mutate a COPY of this file rather than starting from a missing field).
import { alpha } from './alpha.js';

export const delta = {
    name: 'delta',
    version: '1.0.0',
    dependencies: ['alpha'],
    deps: [alpha],
    factory(alpha) {
        return { d: 4, base: alpha };
    },
};
