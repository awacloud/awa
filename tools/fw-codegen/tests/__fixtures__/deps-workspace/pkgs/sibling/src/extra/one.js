// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Publicly exported through the WILDCARD pattern `"./extra/*"`.
export const siblingExtra = {
    name: 'siblingExtra',
    dependencies: [],
    factory() { return { e: 1 }; },
};
