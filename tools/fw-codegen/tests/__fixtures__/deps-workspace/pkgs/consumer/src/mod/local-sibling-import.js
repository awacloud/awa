// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Layer 1 generalization: the descriptor already imports from a SIBLING
// package, so that in-scope binding wins and no import is added.
import { siblingThing } from '@fx/sibling/thing';

export const localSiblingImport = {
    name: 'localSiblingImport',
    dependencies: ['siblingThing'],
    factory(t) { return { t }; },
};
