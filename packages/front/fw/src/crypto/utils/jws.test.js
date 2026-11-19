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

    describe('base64url', () => {
        test('the token parts are b64.url (no padding, the URL-safe alphabet)', () => {
            const payload = new Uint8Array([0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xfb]);
            const tok = J.sign(payload, 'HS256', new TextEncoder().encode('k'));
            expect(tok.split('.')[1]).toBe(_b64.url.fromBytes(payload));
            expect(tok).not.toMatch(/[=+/]/);
        });

        test('the API carries no `_` hatch (D35)', () => {
            expect(Object.keys(J).sort()).toEqual(['sign', 'signJwt', 'verify', 'verifyJwt']);
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
            const r = J.verifyJwt(tok, key, { expectedAlg: 'HS256' });
            expect(r).not.toBe(false);
            expect(r.claims).toEqual(claims);
            expect(r.header.alg).toBe('HS256');
            expect(r.header.typ).toBe('JWT');
        });

        test('verify rejects tampered payload', () => {
            const tok = J.signJwt({ sub: 'alice' }, 'HS256', key);
            const parts = tok.split('.');
            // Modify payload (re-encode "sub: bob") then keep the same signature.
            const evilPayload = _b64.url.fromBytes(new TextEncoder().encode(JSON.stringify({ sub: 'bob' })));
            const tampered = parts[0] + '.' + evilPayload + '.' + parts[2];
            expect(J.verifyJwt(tampered, key, { expectedAlg: 'HS256' })).toBe(false);
        });

        test('verify rejects wrong key', () => {
            const tok = J.signJwt({ x: 1 }, 'HS256', key);
            const wrong = new TextEncoder().encode('other-secret');
            expect(J.verifyJwt(tok, wrong, { expectedAlg: 'HS256' })).toBe(false);
        });
    });

    describe('HS512 sign/verify', () => {
        test('round-trip', () => {
            const key = new TextEncoder().encode('hs512-secret');
            const tok = J.signJwt({ kind: 'session' }, 'HS512', key);
            expect(J.verifyJwt(tok, key, { expectedAlg: 'HS512' }).claims).toEqual({ kind: 'session' });
        });
    });

    describe('EdDSA sign/verify', () => {
        const seed = _hex.toBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');

        test('round-trip', () => {
            const kp = _ed.keyPair(seed);
            const tok = J.signJwt({ sub: 'eddsa-user', exp: 9999999999 }, 'EdDSA', kp.privateKey);
            const r = J.verifyJwt(tok, kp.publicKey, { expectedAlg: 'EdDSA' });
            expect(r).not.toBe(false);
            expect(r.claims.sub).toBe('eddsa-user');
            expect(r.header.alg).toBe('EdDSA');
        });

        test('rejects token signed with different key', () => {
            const kp1 = _ed.keyPair(seed);
            const otherSeed = new Uint8Array(32).fill(7);
            const kp2 = _ed.keyPair(otherSeed);
            const tok = J.signJwt({ a: 1 }, 'EdDSA', kp1.privateKey);
            expect(J.verifyJwt(tok, kp2.publicKey, { expectedAlg: 'EdDSA' })).toBe(false);
        });
    });

    describe('error handling', () => {
        test('rejects unknown algorithm', () => {
            expect(J.sign(new Uint8Array(0), 'NONE', new Uint8Array(0))).toBe(false);
        });

        test('rejects malformed token', () => {
            expect(J.verify('not.a.token.too.many', new Uint8Array(0), { expectedAlg: 'HS256' })).toBe(false);
        });
    });
});

// ── canonical base64url, one warning per call, expectedAlg, log levels ────
describe('jws - hardening', () => {
    const KEY = _utf8.toBytes('a-32-byte-secret-for-hs256-tests');
    const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    /** Run `fn` with console.warn / console.error captured. */
    function captured(fn) {
        const warns = [];
        const errors = [];
        const w = console.warn;
        const e = console.error;
        console.warn = (...a) => { warns.push(a.join(' ')); };
        console.error = (...a) => { errors.push(a.join(' ')); };
        try {
            return { result: fn(), warns, errors };
        } finally {
            console.warn = w;
            console.error = e;
        }
    }

    /** Same bytes, other spelling: set the unused low bits of the last char. */
    function nonCanonical(part) {
        const unused = { 2: 4, 3: 2 }[part.length % 4];
        const last = ALPHA.indexOf(part[part.length - 1]);
        const variant = ALPHA[last | ((1 << unused) - 1)];
        return part.slice(0, -1) + variant;
    }

    test('a signature whose last character carries non-zero padding bits is refused', () => {
        const tok = J.sign(_utf8.toBytes('{"a":1}'), 'HS256', KEY);
        const [h, p, s] = tok.split('.');
        const bad = [h, p, nonCanonical(s)].join('.');
        expect(bad).not.toBe(tok);
        const r = captured(() => J.verify(bad, KEY, { expectedAlg: 'HS256' }));
        expect(r.result).toBe(false);
        expect(captured(() => J.verify(tok, KEY, { expectedAlg: 'HS256' })).result).not.toBe(false);
    });

    test('a non-canonical header or payload part is refused too', () => {
        const tok = J.sign(_utf8.toBytes('{"ab":12}'), 'HS256', KEY);
        const [h, p, s] = tok.split('.');
        for (const parts of [[h, nonCanonical(p), s], [nonCanonical(h), p, s]]) {
            if (parts[0].length % 4 === 0 && parts[1].length % 4 === 0) continue;
            const r = captured(() => J.verify(parts.join('.'), KEY, { expectedAlg: 'HS256' }));
            expect(r.result).toBe(false);
        }
    });

    test('a part whose length is 1 mod 4 is refused', () => {
        const tok = J.sign(_utf8.toBytes('{"a":1}'), 'HS256', KEY);
        const [h, p, s] = tok.split('.');
        const r = captured(() => J.verify([h, p, s + 'A'].join('.'), KEY, { expectedAlg: 'HS256' }));
        expect(r.result).toBe(false);
    });

    test('a token with three malformed parts warns once, not three times', () => {
        const r = captured(() => J.verify('*.*.*', KEY, { expectedAlg: 'HS256' }));
        expect(r.result).toBe(false);
        expect(r.warns.filter((m) => m.includes('base64url')).length).toBe(1);
    });

    test('verify and verifyJwt require expectedAlg: a TypeError before the token is read (D7)', () => {
        const tok = J.sign(_utf8.toBytes('{"a":1}'), 'HS256', KEY);
        for (const opts of [undefined, {}, { expectedAlg: undefined }, { expectedAlg: '' }, { expectedAlg: [] }, { expectedAlg: ['HS256', 5] }]) {
            expect(() => J.verify(tok, KEY, opts)).toThrow(TypeError);
            expect(() => J.verifyJwt(tok, KEY, opts)).toThrow(TypeError);
            expect(() => J.verify('not a token', KEY, opts)).toThrow(TypeError);
        }
        const pinned = captured(() => J.verify(tok, KEY, { expectedAlg: ['HS512', 'HS256'] }));
        expect(pinned.result).not.toBe(false);
        expect(pinned.warns.length).toBe(0);
    });

    test('algorithm confusion: an HS256 token MAC-ed with an Ed25519 public key', () => {
        const kp = _ed.keyPair(new Uint8Array(32).fill(7));
        const forged = J.sign(_utf8.toBytes('{"admin":true}'), 'HS256', kp.publicKey);
        // The header can no longer decide (D7): without expectedAlg, a throw.
        expect(() => J.verify(forged, kp.publicKey)).toThrow(TypeError);
        // Pinned to the key's real algorithm: refused.
        const pinned = captured(() => J.verify(forged, kp.publicKey, { expectedAlg: 'EdDSA' }));
        expect(pinned.result).toBe(false);
    });

    test('a signature that does not verify is reported at warn level, not error', () => {
        const tok = J.sign(_utf8.toBytes('{"a":1}'), 'HS256', KEY);
        const [h, p] = tok.split('.');
        const other = J.sign(_utf8.toBytes('{"a":2}'), 'HS256', KEY).split('.')[2];
        const r = captured(() => J.verify([h, p, other].join('.'), KEY, { expectedAlg: 'HS256' }));
        expect(r.result).toBe(false);
        expect(r.errors.length).toBe(0);
        expect(r.warns.some((m) => m.includes('CORRUPT'))).toBe(true);
    });
});

// ── RFC 8037 Appendix A.4: the Ed25519 JWS example, byte-exact ──────────────
// Key from RFC 8037 A.1 (d = private seed, x = public key), payload
// "Example of Ed25519 signing", protected header {"alg":"EdDSA"}. Ed25519 is
// deterministic, so the signature over the A.4 signing input must match
// byte-exact. (`jws.sign` always writes a `typ` header, so its own token
// differs from A.4 by the header, not by the signature algorithm.)
describe('jws - RFC 8037 A.4', () => {
    const fromB64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
    const D = 'nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A';
    const X = '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo';
    const TOKEN = 'eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc.'
        + 'hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg';

    test('the A.1 seed gives the A.1 public key', () => {
        const kp = _ed.keyPair(fromB64u(D));
        expect(Buffer.from(kp.publicKey).toString('base64url')).toBe(X);
    });

    test('the A.4 signature is reproduced byte-exact and the A.4 token verifies', () => {
        const kp = _ed.keyPair(fromB64u(D));
        const [h, p, s] = TOKEN.split('.');
        const sig = _ed.sign(kp.privateKey, _utf8.toBytes(h + '.' + p));
        expect(Buffer.from(sig).toString('base64url')).toBe(s);
        const out = J.verify(TOKEN, fromB64u(X), { expectedAlg: 'EdDSA' });
        expect(out).not.toBe(false);
        expect(_utf8.fromBytes(out.payload)).toBe('Example of Ed25519 signing');
    });
});
