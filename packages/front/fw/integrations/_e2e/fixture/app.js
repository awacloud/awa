// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/_e2e/fixture/app.js
// E2E fixture : a minimal consumer entry that imports a virtual preset.
// Built by every bundler adapter (esbuild / rollup / webpack / bun) to prove
// the virtual module resolves AND its `@awacloud/fw/*` subpath imports resolve to
// real source files through the package `exports` map.

import { runtime, moduleNames } from 'virtual:@awacloud/fw/preset/core';

// Reference both bindings so nothing is tree-shaken : `runtime` is built from a
// top-level `registerAllDeep([...])` side-effect, `moduleNames` lists the preset.
export const result = {
    count: moduleNames.length,
    names: moduleNames,
    hasResolve: typeof runtime.resolve === 'function',
};
