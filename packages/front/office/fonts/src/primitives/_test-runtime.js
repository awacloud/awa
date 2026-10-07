// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * wiring the `primitives/` dependency graph (errors + fw binary
 * reader/writer + fontFixed + the primitives themselves). Used by
 * sibling tests that need to call `<descriptor>.factory(...deps)`.
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { binaryReader as fwBinaryReader } from '@awacloud/fw/io/binary/reader.js';
import { binaryWriter as fwBinaryWriter } from '@awacloud/fw/io/binary/writer.js';
import { fontErrors } from '../errors.js';
import { fontFixed } from './fixed.js';
import { fontTag } from './tag.js';
import { fontChecksum } from './checksum.js';
import { fontEncoding } from './encoding.js';
import { fontReader } from './reader.js';
import { fontWriter } from './writer.js';

const _rt = new ModuleRuntime();
// Register fw modules under the names primitives factories request.
_rt.register({ name: 'binaryReader', dependencies: [], factory: () => fwBinaryReader.factory() });
_rt.register({ name: 'binaryWriter', dependencies: [], factory: () => fwBinaryWriter.factory() });
_rt.register(fontErrors);
_rt.register(fontFixed);
_rt.register(fontTag);
_rt.register(fontChecksum);
_rt.register(fontEncoding);
_rt.register(fontReader);
_rt.register(fontWriter);

export const testRuntime = _rt;
