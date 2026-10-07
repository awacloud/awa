// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `glyph/` dependency graph (errors + fontPath + fontGlyph
 * + fontCompositeResolve). Used by sibling tests that need to call
 * `<descriptor>.factory(...deps)` results without relying on shims.
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fontErrors } from '../errors.js';
import { fontPath } from './path.js';
import { fontGlyph } from './glyph.js';
import { fontCompositeResolve } from './compositeResolve.js';

const _rt = new ModuleRuntime();
_rt.register(fontErrors);
_rt.register(fontPath);
_rt.register(fontGlyph);
_rt.register(fontCompositeResolve);

export const testRuntime = _rt;
