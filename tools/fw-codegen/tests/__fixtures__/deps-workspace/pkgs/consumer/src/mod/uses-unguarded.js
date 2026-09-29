// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// In the sibling's `extras`, which the consumer does NOT spread — the spread
// field is the guard, so this stays unresolved.
export const usesUnguarded = {
    name: 'usesUnguarded',
    dependencies: ['siblingUnguarded'],
    factory(siblingUnguarded) { return { u: siblingUnguarded }; },
};
