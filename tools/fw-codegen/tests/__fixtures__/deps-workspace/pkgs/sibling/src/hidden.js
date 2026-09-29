// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// In the sibling's `modules` guard but ABSENT from its `exports` map — must
// never be reached through a private deep path.
export const siblingHidden = {
    name: 'siblingHidden',
    dependencies: [],
    factory() { return { h: 1 }; },
};
