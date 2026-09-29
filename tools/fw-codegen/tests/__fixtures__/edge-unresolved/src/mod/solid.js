// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — the nearest neighbour of `needs.js`: same fixture, same
// scan, but every name it declares is resolvable (none), so it never appears in
// the SKIPPED report. Keeps the "exactly one module is skipped" assertion
// discriminating rather than trivially true.
export const solid = {
    name: 'solid',
    version: '1.0.0',
    dependencies: [],
    factory() {
        return { solid: true };
    },
};
