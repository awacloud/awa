// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — dependency-free local sibling target.
export const alpha = {
    name: 'alpha',
    dependencies: [],
    factory() { return { a: 1 }; },
};
