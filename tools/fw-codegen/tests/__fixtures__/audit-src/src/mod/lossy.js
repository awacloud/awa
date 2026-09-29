// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — wide `@returns {Object}` on the factory → LOSSY bucket.
export const lossyMod = {
    name: 'lossyMod',
    version: '1.0.0',
    dependencies: [],
    /**
     * @returns {Object}
     */
    factory() {
        return { x: 1 };
    },
};
