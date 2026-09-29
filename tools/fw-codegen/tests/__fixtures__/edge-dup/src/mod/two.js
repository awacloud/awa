// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — second of the DUPLICATE-NAME pair; re-declares `twin`.
export const two = {
    name: 'twin',
    version: '1.0.0',
    dependencies: [],
    factory() {
        return { which: 'two' };
    },
};
