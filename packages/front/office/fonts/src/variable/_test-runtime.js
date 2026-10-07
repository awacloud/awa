// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `variable/` dependency graph (errors + primitives +
 * tableAvar + varInstance + varCoordsConvert).
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { fontErrors } from '../errors.js';
import { fontFixed } from '../primitives/fixed.js';
import { fontReader } from '../primitives/reader.js';
import { fontWriter } from '../primitives/writer.js';
import { tableAvar } from '../table/avar.js';
import { varInstance } from './instance.js';
import { varCoordsConvert } from './coordsConvert.js';

const _rt = new ModuleRuntime();
_rt.register({ name: 'binaryReader', dependencies: [], factory: () => fwBinaryReader.factory() });
_rt.register({ name: 'binaryWriter', dependencies: [], factory: () => fwBinaryWriter.factory() });
for (const m of [
    fontErrors, fontFixed, fontReader, fontWriter,
    tableAvar, varInstance, varCoordsConvert
]) _rt.register(m);

export const testRuntime = _rt;
