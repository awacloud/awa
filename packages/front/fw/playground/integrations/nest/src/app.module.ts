// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { FwModule } from '@awacloud/fw/nest';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { cbor } from '@awacloud/fw/io/codec/cbor.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { hex } from '@awacloud/fw/io/codec/hex.js';

import { SignService } from './sign.service.js';

/**
 * Registers the fw crypto/codec primitives as Nest providers.
 *
 * `FwModule.forFeature([sha256, cbor, bitArray, hex])` takes the **imported
 * module objects** (tree-shakable), instantiates their factories through the
 * fw runtime, and exposes each one under a token equal to its module `name`
 * (`'sha256'`, `'cbor'`, `'bitArray'`, `'hex'`). Transitive deps (`utf8`)
 * register automatically, but only **head modules** become injectable Nest
 * providers - hence `bitArray`/`hex` listed explicitly (we inject them in
 * `SignService`). DOM-only modules would be rejected at bootstrap by the
 * guard.
 */
@Module({
    imports: [FwModule.forFeature([sha256, cbor, bitArray, hex])],
    providers: [SignService],
})
export class AppModule {}
