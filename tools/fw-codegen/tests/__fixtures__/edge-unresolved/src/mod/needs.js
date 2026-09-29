// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — depends on a name that resolves NOWHERE: not a sibling in
// this fixture's own `src/`, and no `src/main.js` entry exists to offer an
// fw / pkg_require guard. `rewriteFile` therefore returns `kind: 'skip'` and
// the module lands in `planDeps().unresolved`, which is what drives the
// `… module(s) SKIPPED — unresolvable dependency:` report in `runCli`.
export const needs = {
    name: 'needs',
    version: '1.0.0',
    dependencies: ['ghost'],
    factory(ghost) {
        return { ghost };
    },
};
