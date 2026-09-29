// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture — a `core/` file that is NOT a module definition (skipped by the
// scanner's SKIP_DIRS). Present to prove core/ is excluded from the registry.
export function runtime() {
    return { boot() { return true; } };
}
