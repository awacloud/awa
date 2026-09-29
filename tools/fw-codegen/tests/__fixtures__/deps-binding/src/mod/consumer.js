// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — depends on a module whose name ≠ exported binding.
// The injector must emit an ALIASED import so that `deps` still reads as the
// dependency name (validate-deps compares deps[i] to dependencies[i]).
export const consumer = {
    name: 'consumer',
    version: '1.0.0',
    dependencies: ['renamed'],
    factory(renamed) {
        return { c: 2, base: renamed };
    },
};
