// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Resolves through the sibling's WILDCARD export pattern `./extra/*`.
export const usesExtra = {
    name: 'usesExtra',
    dependencies: ['siblingExtra'],
    factory(siblingExtra) { return { e: siblingExtra }; },
};
