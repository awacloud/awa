// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The fw modules the video bench uses, resolved once.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { zlib } from '@awacloud/fw/io/compress/zlib.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(zlib);
runtime.registerDeep(crc32);

export const fw = {
    /** `deflateSync` / `inflateSync`: the lossless stage of the stream. */
    deflate: runtime.resolve('deflate'),
    /** `zlibSync` / `unzlibSync`: the container PNG asks for. */
    zlib: runtime.resolve('zlib'),
    /** CRC-32 constructor: `append(bytes)`, `get()`. */
    Crc32: runtime.resolve('crc32'),
};
