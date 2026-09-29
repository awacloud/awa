// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — ALREADY carries a `deps` field (so `rewriteFile` short-
// circuits on `hasDepsField` and it never enters the injection plan), but its
// `dependencies` names `ghost`, which resolves nowhere. `computeContentDrift`
// therefore cannot RE-DERIVE the expected identifier list at all:
// `resolveExpectedIdentifiers` returns `{ unresolved: ['ghost'] }` and the
// drift row is reported with `expected: null` → the `(unresolvable)` label.
import { alpha } from './alpha.js';

export const populated = {
    name: 'populated',
    version: '1.0.0',
    dependencies: ['alpha', 'ghost'],
    deps: [alpha],
    factory(alpha, ghost) {
        return { alpha, ghost };
    },
};
