// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — NON-CANONICAL on purpose.
//
// `dependencies` holds an IDENTIFIER instead of a string literal, which is
// exactly the condition modlib's `parseFile` flags as `_unparseable`
// (tools/fw-bundler/src/modlib/scan-modules.js:156-169: every entry must match
// /^['"]([^'"]+)['"]$/, and a single `null` aborts the parse cleanly).
// Consumers must REPORT it, never silently mis-rewrite it.
const FINE = 'fine';

export const broken = {
    name: 'broken',
    version: '1.0.0',
    dependencies: [FINE],
    factory() {
        return { broken: true };
    },
};
