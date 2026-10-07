// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `encodings/` dependency graph (errors + the six named
 * encoding tables + `encodingLookup` dispatcher + the AGL name→Unicode
 * seam: `encodingAglTable` + `encodingAgl`). Used by sibling
 * tests that need to call `<descriptor>.factory(...)` results without
 * relying on shims.
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fontErrors } from '../errors.js';
import { encodingWinAnsi } from './winAnsi.js';
import { encodingMacRoman } from './macRoman.js';
import { encodingMacExpert } from './macExpert.js';
import { encodingStandard } from './standard.js';
import { encodingSymbol } from './symbol.js';
import { encodingZapfDingbats } from './zapfDingbats.js';
import { encodingLookup } from './lookup.js';
import { encodingAglTable } from './aglTable.js';
import { encodingAgl } from './agl.js';

const _rt = new ModuleRuntime();
for (const m of [
    fontErrors,
    encodingWinAnsi, encodingMacRoman, encodingMacExpert,
    encodingStandard, encodingSymbol, encodingZapfDingbats,
    encodingLookup,
    encodingAglTable, encodingAgl
]) _rt.register(m);

export const testRuntime = _rt;
