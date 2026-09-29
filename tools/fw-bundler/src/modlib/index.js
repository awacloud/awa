// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/modlib/index.js
/**
 * @fileoverview `@awacloud/tool-fw-bundler/modlib` — the shared fw-tools substrate.
 *
 * Home of the reuse nucleus both this package (`bundle` / `standalone`) and
 * `@awacloud/tool-fw-codegen` consume. Ratifies the fw-tools-mutualization W0 §5
 * open decision: the shared `_lib` lives here under the `./modlib` subpath
 * export, NOT as a standalone `@awacloud/tool-fw-modlib` package.
 *
 * Surface (frozen call contract, W1a → G1):
 *   - `scanAll`, `parseFile`, `listSourceFiles`, `relativeImport`  (scan-modules)
 *   - `printHelp`, `wantsHelp`, `isMainModule`                     (cli-help)
 */

export { scanAll, parseFile, listSourceFiles, relativeImport } from './scan-modules.js';
export { printHelp, wantsHelp, isMainModule } from './cli-help.js';
