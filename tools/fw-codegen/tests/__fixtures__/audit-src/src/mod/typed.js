// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — precise named `@returns {SomeTypedef}` → TYPED bucket.
export const typedMod = {
    name: 'typedMod',
    version: '1.0.0',
    dependencies: [],
    /**
     * @returns {SomeTypedef}
     */
    factory() {
        return { z: 3 };
    },
};
