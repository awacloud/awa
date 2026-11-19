// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Keys generated through the WebCrypto tier are non-extractable unless the
// caller asks (D9 G4): the secret or private half cannot be exported, so a
// script that reaches the CryptoKey cannot read its material. Public keys of
// a pair stay exportable (WebCrypto makes them so). `true` still exports.

import { describe, test, expect } from 'bun:test';
import { webcryptoAes } from './aes.js';
import { webcryptoAesKw } from './aeskw.js';
import { webcryptoEcc } from './ecc.js';
import { webcryptoEd25519 } from './ed25519.js';
import { webcryptoHmac } from './hmac.js';
import { webcryptoRsa } from './rsa.js';
import { webcryptoX25519 } from './x25519.js';

const secretOf = (k) => (k && k.privateKey) ? k.privateKey : k;

const CASES = [
    ['aes.generateKey', (x) => webcryptoAes.factory().generateKey('GCM', 256, x)],
    ['aeskw.generateKek', (x) => webcryptoAesKw.factory().generateKek(256, x)],
    ['ecc.generateKey', (x) => webcryptoEcc.factory().generateKey('ECDSA', 'P-256', x)],
    ['ed25519.generateKey', (x) => webcryptoEd25519.factory().generateKey(x)],
    ['hmac.generateKey', (x) => webcryptoHmac.factory().generateKey('SHA-256', undefined, x)],
    ['rsa.generateKey', (x) => webcryptoRsa.factory().generateKey('PSS', 2048, 'SHA-256', x)],
    ['x25519.generateKey', (x) => webcryptoX25519.factory().generateKey(x)],
];

describe('webcrypto generateKey: non-extractable by default', () => {
    for (const [name, gen] of CASES) {
        test(name + ': the default key is not extractable; `true` makes it so', async () => {
            const byDefault = await gen(undefined);
            expect(byDefault).not.toBe(false);
            expect(secretOf(byDefault).extractable).toBe(false);
            if (byDefault.publicKey) expect(byDefault.publicKey.extractable).toBe(true);
            const asked = await gen(true);
            expect(secretOf(asked).extractable).toBe(true);
        }, 60000);
    }
});
