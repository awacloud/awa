// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// In the sibling's guard but absent from its `exports` — must stay unresolved
// rather than be reached with a private deep path.
export const usesHidden = {
    name: 'usesHidden',
    dependencies: ['siblingHidden'],
    factory(siblingHidden) { return { h: siblingHidden }; },
};
