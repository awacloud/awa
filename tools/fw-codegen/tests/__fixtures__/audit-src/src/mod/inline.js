// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — anonymous object-literal `@returns {{ foo: string }}` → INLINE bucket.
export const inlineMod = {
    name: 'inlineMod',
    version: '1.0.0',
    dependencies: [],
    /**
     * @returns {{ foo: string }}
     */
    factory() {
        return { foo: 'bar' };
    },
};
