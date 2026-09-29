// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — first of a DUPLICATE-NAME pair (`name: 'twin'`).
// `scanAll` (tools/fw-bundler/src/modlib/scan-modules.js:222-228) throws on the
// second module claiming a name already in `byName`; the `registry` / `audit`
// subcommands both go through `scanAll`, so this fixture reaches that throw
// through fw-codegen's own public API.
export const one = {
    name: 'twin',
    version: '1.0.0',
    dependencies: [],
    factory() {
        return { which: 'one' };
    },
};
