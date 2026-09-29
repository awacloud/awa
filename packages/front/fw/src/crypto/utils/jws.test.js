// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { jws } from './jws.js';
import { hmac } from '../hash/hmac.js';
import { sha256 } from '../hash/sha256.js';
import { sha512 } from '../hash/sha512.js';
import { ed25519 } from '../pkc/ed25519.js';
import { bitArray } from './bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hex } from '../../io/codec/hex.js';
import { b64 } from '../../io/codec/b64.js';

const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _hex = hex.factory();
const _b64 = b64.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _sha512 = sha512.factory(_ba, _utf8);
const _hmac = hmac.factory(_ba, _utf8, _sha256);
const _ed = ed25519.factory(_sha512, _ba);
const J = jws.factory(_ba, _utf8, _b64, _hmac, _sha256, _sha512, _ed);

describe('jws / jwt module', () => {

    test('module metadata', () => {
        expect(jws.name).toBe('jws');
    });

    describe('base64url codec', () => {
        test('round-trip arbitrary bytes', () => {
            const data = new Uint8Array([0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa]);
            const enc = J._b64uEnc(data);
            expect(enc).not.toContain('=');
            expect(enc).not.toContain('+');
            expect(enc).not.toContain('/');
            expect(_hex.fromBytes(J._b64uDec(enc))).toBe('ffeeddccbbaa');
        });

        // RFC 4648 §10 test vectors (base64url, no padding)
        test('RFC 4648 §10', () => {
            expect(J._b64uEnc(new TextEncoder().encode('foobar'))).toBe('Zm9vYmFy');
            expect(J._b64uEnc(new TextEncoder().encode('fooba'))).toBe('Zm9vYmE');
            expect(J._b64uEnc(new TextEncoder().encode('foob'))).toBe('Zm9vYg');
        });
    });

    describe('HS256 sign/verify', () => {
        // RFC 7515 §A.1 - JWT with HS256 and the canonical example secret.
        // The exact compact form is sensitive to header byte order, so we
        // only assert round-trip correctness here.
        const key = new TextEncoder().encode('the-shared-secret');

        test('sign produces three parts', () => {
            const tok = J.signJwt({ sub: '1234', admin: true }, 'HS256', key);
            expect(tok.split('.').length).toBe(3);
        });

        test('verifyJwt returns the original claims', () => {
            const claims = { sub: 'alice', iat: 1700000000, scope: ['read', 'write'] };
            const tok = J.signJwt(claims, 'HS256', key);
            const r = J.verifyJwt(tok, key);
            expect(r).not.toBe(false);
            expect(r.claims).toEqual(claims);
            expect(r.header.alg).toBe('HS256');
            expect(r.header.typ).toBe('JWT');
        });

        test('verify rejects tampered payload', () => {
            const tok = J.signJwt({ sub: 'alice' }, 'HS256', key);
            const parts = tok.split('.');
            // Modify payload (re-encode "sub: bob") then keep the same signature.
            const evilPayload = J._b64uEnc(new TextEncoder().encode(JSON.stringify({ sub: 'bob' })));
            const tampered = parts[0] + '.' + evilPayload + '.' + parts[2];
            expect(J.verifyJwt(tampered, key)).toBe(false);
        });

        test('verify rejects wrong key', () => {
            const tok = J.signJwt({ x: 1 }, 'HS256', key);
            const wrong = new TextEncoder().encode('other-secret');
            expect(J.verifyJwt(tok, wrong)).toBe(false);
        });
    });

    describe('HS512 sign/verify', () => {
        test('round-trip', () => {
            const key = new TextEncoder().encode('hs512-secret');
            const tok = J.signJwt({ kind: 'session' }, 'HS512', key);
            expect(J.verifyJwt(tok, key).claims).toEqual({ kind: 'session' });
        });
    });

    describe('EdDSA sign/verify', () => {
        const seed = _hex.toBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');

        test('round-trip', () => {
            const kp = _ed.keyPair(seed);
            const tok = J.signJwt({ sub: 'eddsa-user', exp: 9999999999 }, 'EdDSA', kp.privateKey);
            const r = J.verifyJwt(tok, kp.publicKey);
            expect(r).not.toBe(false);
            expect(r.claims.sub).toBe('eddsa-user');
            expect(r.header.alg).toBe('EdDSA');
        });

        test('rejects token signed with different key', () => {
            const kp1 = _ed.keyPair(seed);
            const otherSeed = new Uint8Array(32).fill(7);
            const kp2 = _ed.keyPair(otherSeed);
            const tok = J.signJwt({ a: 1 }, 'EdDSA', kp1.privateKey);
            expect(J.verifyJwt(tok, kp2.publicKey)).toBe(false);
        });
    });

    describe('error handling', () => {
        test('rejects unknown algorithm', () => {
            expect(J.sign(new Uint8Array(0), 'NONE', new Uint8Array(0))).toBe(false);
        });

        test('rejects malformed token', () => {
            expect(J.verify('not.a.token.too.many', new Uint8Array(0))).toBe(false);
        });
    });
});
