// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `cmap/` dependency graph (errors + cmapToUnicode).
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fontErrors } from '../errors.js';
import { cmapToUnicode } from './toUnicode.js';

const _rt = new ModuleRuntime();
_rt.register(fontErrors);
_rt.register(cmapToUnicode);

export const testRuntime = _rt;
