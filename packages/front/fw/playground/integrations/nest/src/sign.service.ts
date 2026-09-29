// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable } from '@nestjs/common';

/**
 * Signs/digests an arbitrary payload by hashing its CBOR encoding.
 *
 * All collaborators are fw module API objects injected by `FwModule`
 * under their module `name` as token (`@Inject('sha256')`, `@Inject('cbor')`,
 * `@Inject('bitArray')`, `@Inject('hex')`). Tokens map to the
 * runtime-instantiated factory output, so we call the **API** methods here,
 * not the raw module descriptors.
 */
@Injectable()
export class SignService {
    constructor(
        // `cbor.encode(value)` -> Uint8Array (CborAPI.encode, cbor.js).
        @Inject('cbor') private readonly cbor: { encode(value: unknown): Uint8Array },
        // `sha256.hash(data)` -> number[] bitArray digest (Sha256API.hash, sha256.js).
        @Inject('sha256') private readonly sha256: { hash(data: number[] | string): number[] },
        // bitArray bridge: bytes <-> SJCL bit arrays (BitArrayAPI, bitArray.js).
        @Inject('bitArray') private readonly bitArray: {
            ui8_to_ba(arr: Uint8Array | number[]): number[];
            ba_to_ui8(arr: number[]): Uint8Array;
        },
        // `hex.fromBytes(bytes)` -> lowercase hex string (HexAPI, hex.js).
        @Inject('hex') private readonly hex: { fromBytes(bytes: Uint8Array | number[]): string },
    ) {}

    /**
     * Returns the SHA-256 digest of the deterministic-ish CBOR encoding of
     * `payload`, as a bitArray (8 x 32-bit words).
     *
     * `sha256.hash` expects a UTF-8 string OR a bitArray (32-bit words), NOT
     * raw bytes - hence the `bitArray.ui8_to_ba` bridge on the CBOR bytes.
     */
    digest(payload: unknown): number[] {
        const bytes = this.cbor.encode(payload);
        return this.sha256.hash(this.bitArray.ui8_to_ba(bytes));
    }

    /**
     * Same digest, rendered as a lowercase hex string (64 chars): the
     * bitArray digest is mapped back to bytes (`bitArray.ba_to_ui8`) then
     * encoded with the fw `hex` codec.
     */
    digestHex(payload: unknown): string {
        return this.hex.fromBytes(this.bitArray.ba_to_ui8(this.digest(payload)));
    }
}
