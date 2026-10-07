// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `standard14/` dependency graph (errors + the 5 font
 * families + `standard14Lookup` dispatcher).
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fontErrors } from '../errors.js';
import { standard14Helvetica } from './helvetica.js';
import { standard14Times } from './times.js';
import { standard14Courier } from './courier.js';
import { standard14Symbol } from './symbol.js';
import { standard14ZapfDingbats } from './zapfDingbats.js';
import { standard14Lookup } from './lookup.js';

const _rt = new ModuleRuntime();
for (const m of [
    fontErrors,
    standard14Helvetica, standard14Times, standard14Courier,
    standard14Symbol, standard14ZapfDingbats, standard14Lookup
]) _rt.register(m);

export const testRuntime = _rt;
