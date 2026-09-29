// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Resolves through the `...sib.modules` spread to the sibling's PUBLIC subpath.
export const usesSibling = {
    name: 'usesSibling',
    dependencies: ['siblingThing'],
    factory(siblingThing) { return { s: siblingThing }; },
};
