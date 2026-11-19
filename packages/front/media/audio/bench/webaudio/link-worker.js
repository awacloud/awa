// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview A worker entry that runs `audio.link` (row B1b), for the
 * loop-back page. A module worker does not see the page's import map: the
 * page loads this entry built (`bun run build:workers`, into
 * `dist/workers/`). The timer is the worker's own clock (a bench page; an
 * app under the sanity layer gives its own).
 */

import { ModuleRuntime } from '../../../../fw/src/core/runtime.js';
import { linkModule } from '../../src/link/link.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(linkModule);
runtime.resolve('audio.link').attach(self, { now: () => performance.now() });
