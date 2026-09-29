// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — the fw name is aliased in the package entry
// (`sanitize as sanitizeFw`, guarded under that alias). Resolution matches the
// imported name and emits the un-aliased binding.
export const aliasedMain = {
    name: 'aliasedMain',
    version: '1.0.0',
    dependencies: ['sanitize'],
    factory(sanitize) {
        return { s: sanitize };
    },
};
