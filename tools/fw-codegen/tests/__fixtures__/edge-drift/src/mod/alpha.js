// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — the resolvable half of `populated.js`'s dependency list.
export const alpha = {
    name: 'alpha',
    version: '1.0.0',
    dependencies: [],
    factory() {
        return { a: 1 };
    },
};
