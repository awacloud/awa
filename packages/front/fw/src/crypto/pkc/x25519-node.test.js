// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// x25519 after the unrolled field and the inversion chain: shared secrets and
// public keys equal node:crypto's for random scalars and peers.

import { describe, test, expect } from 'bun:test';
import nodeCrypto from 'node:crypto';
import { x25519 } from './x25519.js';

const xc = x25519.factory();
let s = 0x2545F491;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rnd() & 255; return b; };
const b64u = (u8) => Buffer.from(u8).toString('base64url');
const PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex');

describe('x25519 against node:crypto', () => {
    test('scalarMultBase and scalarMult equal node for 150 random key pairs', () => {
        for (let i = 0; i < 150; i++) {
            const k = bytes(32), peerK = bytes(32);
            const pub = xc.scalarMultBase(k), peer = xc.scalarMultBase(peerK);
            const priv = nodeCrypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(k)]), format: 'der', type: 'pkcs8' });
            expect(Buffer.from(pub).equals(nodeCrypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12))).toBe(true);
            const peerKey = nodeCrypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: b64u(peer) }, format: 'jwk' });
            const want = nodeCrypto.diffieHellman({ privateKey: priv, publicKey: peerKey });
            expect(Buffer.from(xc.scalarMult(k, peer)).equals(want)).toBe(true);
        }
    });
});
