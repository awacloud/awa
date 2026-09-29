// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — no `@returns` on the factory → INFER bucket.
export const inferMod = {
    name: 'inferMod',
    version: '1.0.0',
    dependencies: [],
    factory() {
        return { y: 2 };
    },
};
