// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The demo's worker: `audio.link` attached to its scope. A
 * module worker does not see the page's import map, so the page loads this
 * entry built (`bun run build:workers`, into `dist/workers/`). The
 * timer is the worker's own clock (a demo page; an app under the fw sanity
 * layer gives its own). The fw `deflate` module is given for the lossless
 * stage, used when the page asks for it.
 */

import { ModuleRuntime } from '../../../fw/src/core/runtime.js';
import { deflate } from '../../../fw/src/io/compress/deflate.js';
import { linkModule } from '../src/link/link.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(linkModule);
runtime.registerDeep(deflate);
runtime.resolve('audio.link').attach(self, { now: () => performance.now(), deflate: runtime.resolve('deflate') });
