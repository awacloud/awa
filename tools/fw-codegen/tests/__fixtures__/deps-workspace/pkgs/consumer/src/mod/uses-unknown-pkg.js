// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Reached only through `...ghost.modules`, whose package does not exist — must
// resolve to unresolved without throwing.
export const usesUnknownPkg = {
    name: 'usesUnknownPkg',
    dependencies: ['ghostModule'],
    factory(ghostModule) { return { g: ghostModule }; },
};
