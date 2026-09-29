// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Listed in the sibling's `extras`, NOT in `modules` — the consumer spreads
// only `...sib.modules`, so this name must stay unresolved.
export const siblingUnguarded = {
    name: 'siblingUnguarded',
    dependencies: [],
    factory() { return { u: 1 }; },
};
