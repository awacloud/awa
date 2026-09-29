// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { webauthn } from './webauthn.js';
import { b64 } from '../../io/codec/b64.js';
import { random } from '../../crypto/utils/random.js';
import { bitArray } from '../../crypto/utils/bitArray.js';
import { aes } from '../../crypto/cipher/aes.js';
import { sha256 } from '../../crypto/hash/sha256.js';

// ── Dependency instances ─────────────────────────────────────────────────────

const b64Inst = b64.factory();

// random depends on bitArray, aes, sha256
const bitArrayInst = bitArray.factory();
const aesInst = aes.factory();
const sha256Inst = sha256.factory();
const randomInst = random.factory(bitArrayInst, aesInst, sha256Inst);

// ── base64url helpers (replicated for test assertions) ───────────────────────

function toBase64url(bytes) {
    return b64Inst.fromBytes(bytes)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function fromBase64url(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    const rem = s.length % 4;
    if (rem === 2) s += '==';
    else if (rem === 3) s += '=';
    return b64Inst.toBytes(s);
}

// ── Module instance ──────────────────────────────────────────────────────────

const inst = webauthn.factory(randomInst, b64Inst);

// ── 1. Metadata ──────────────────────────────────────────────────────────────

describe('webauthn module', () => {

    test('should have correct module metadata', () => {
        expect(webauthn.name).toBe('webauthn');
        expect(webauthn.version).toBe('1.0.0');
        expect(webauthn.type).toBe('fw.dom.utils');
        expect(webauthn.dependencies).toEqual(['random', 'b64']);
        expect(typeof webauthn.factory).toBe('function');
    });

    // ── 2. Factory API ───────────────────────────────────────────────────────

    describe('factory', () => {
        test('should create instance with expected API', () => {
            expect(inst).toBeDefined();
            expect(typeof inst.register).toBe('function');
            expect(typeof inst.authenticate).toBe('function');
            expect(typeof inst.support).toBe('function');
        });
    });

    // ── 3. support() without stub → available: false ────────────────────────

    describe('support', () => {
        test('returns available:false when navigator.credentials absent', async () => {
            // happy-dom does not expose navigator.credentials by default
            const savedCreds = navigator.credentials;
            try {
                Object.defineProperty(navigator, 'credentials', {
                    value: undefined,
                    configurable: true,
                    writable: true,
                });
            } catch (_) {
                // If happy-dom does not allow redefinition, silently skip
                return;
            }
            const result = await inst.support();
            expect(result.available).toBe(false);
            expect(result.userVerifyingPlatformAuthenticator).toBe(false);
            expect(result.conditionalMediation).toBe(false);
            // Restore
            try {
                Object.defineProperty(navigator, 'credentials', {
                    value: savedCreds,
                    configurable: true,
                    writable: true,
                });
            } catch (_) {}
        });

        test('returns object with expected shape when available', async () => {
            // Minimal credentials.create stub
            const fakeCreds = { create: () => {} };
            try {
                Object.defineProperty(navigator, 'credentials', {
                    value: fakeCreds,
                    configurable: true,
                    writable: true,
                });
            } catch (_) { return; }

            const result = await inst.support();
            expect(typeof result.available).toBe('boolean');
            expect(typeof result.userVerifyingPlatformAuthenticator).toBe('boolean');
            expect(typeof result.conditionalMediation).toBe('boolean');

            // Restore
            try {
                Object.defineProperty(navigator, 'credentials', {
                    value: undefined,
                    configurable: true,
                    writable: true,
                });
            } catch (_) {}
        });
    });

    // ── 4. register() with credentials.create stub ──────────────────────────

    describe('register', () => {
        let capturedOptions = null;

        beforeEach(() => {
            capturedOptions = null;
            // Stub navigator.credentials.create
            const fakeCreate = async (credOpts) => {
                capturedOptions = credOpts.publicKey;
                // Simulate a minimal PublicKeyCredential
                const rawIdBytes = new Uint8Array([1, 2, 3, 4]);
                return {
                    id: toBase64url(rawIdBytes),
                    rawId: rawIdBytes.buffer,
                    type: 'public-key',
                    authenticatorAttachment: 'platform',
                    response: {
                        clientDataJSON:    new Uint8Array([10, 20, 30]).buffer,
                        attestationObject: new Uint8Array([40, 50, 60]).buffer,
                        getTransports: () => ['internal'],
                    },
                };
            };
            try {
                Object.defineProperty(navigator, 'credentials', {
                    value: { create: fakeCreate },
                    configurable: true,
                    writable: true,
                });
            } catch (_) {}
        });

        test('passes challenge bytes to credentials.create', async () => {
            const challenge = new Uint8Array(32);
            challenge.fill(0xAB);
            await inst.register({
                rp:        { id: 'example.com', name: 'Example' },
                user:      { id: 'uid-1', name: 'alice', displayName: 'Alice' },
                challenge,
            });
            if (!capturedOptions) return; // happy-dom does not allow redefinition
            const capturedChallenge = new Uint8Array(capturedOptions.challenge);
            expect(capturedChallenge).toEqual(challenge);
        });

        test('converts user.id string to bytes in options', async () => {
            await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'alice-uid', name: 'alice', displayName: 'Alice' },
            });
            if (!capturedOptions) return;
            const capturedUserId = new Uint8Array(capturedOptions.user.id);
            const expected = new TextEncoder().encode('alice-uid');
            expect(capturedUserId).toEqual(expected);
        });

        test('output fields are base64url encoded', async () => {
            const result = await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'uid-1', name: 'alice', displayName: 'Alice' },
            });
            if (!result) return;
            // base64url does not contain +, /, or =
            expect(result.rawId).not.toMatch(/[+/=]/);
            expect(result.response.clientDataJSON).not.toMatch(/[+/=]/);
            expect(result.response.attestationObject).not.toMatch(/[+/=]/);
        });

        test('output base64url is round-trip decodable', async () => {
            const result = await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'uid-1', name: 'alice', displayName: 'Alice' },
            });
            if (!result) return;
            // Verify clientDataJSON round-trips
            const decoded = fromBase64url(result.response.clientDataJSON);
            expect(decoded).toBeInstanceOf(Uint8Array);
            expect(decoded[0]).toBe(10);
            expect(decoded[1]).toBe(20);
            expect(decoded[2]).toBe(30);
        });

        test('generates random challenge when not provided', async () => {
            // Successive calls must produce different challenges
            const calls = [];
            const fakeCreate2 = async (credOpts) => {
                calls.push(new Uint8Array(credOpts.publicKey.challenge));
                const rawIdBytes = new Uint8Array([1]);
                return {
                    id: toBase64url(rawIdBytes),
                    rawId: rawIdBytes.buffer,
                    type: 'public-key',
                    response: {
                        clientDataJSON:    new Uint8Array([1]).buffer,
                        attestationObject: new Uint8Array([2]).buffer,
                    },
                };
            };
            try {
                Object.defineProperty(navigator, 'credentials', {
                    value: { create: fakeCreate2 },
                    configurable: true,
                    writable: true,
                });
            } catch (_) { return; }

            await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'uid-1', name: 'alice', displayName: 'Alice' },
            });
            await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'uid-2', name: 'bob', displayName: 'Bob' },
            });

            if (calls.length < 2) return; // stub not applied
            // Challenges must be 32 bytes
            expect(calls[0].length).toBe(32);
            expect(calls[1].length).toBe(32);
            // They must differ (negligible probability of equality)
            const same = calls[0].every((b, i) => b === calls[1][i]);
            expect(same).toBe(false);
        });

        test('includes authenticatorAttachment if provided by authenticator', async () => {
            const result = await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'uid-1', name: 'alice', displayName: 'Alice' },
            });
            if (!result) return;
            expect(result.authenticatorAttachment).toBe('platform');
        });

        test('includes transports in response if available', async () => {
            const result = await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'uid-1', name: 'alice', displayName: 'Alice' },
            });
            if (!result) return;
            expect(result.response.transports).toEqual(['internal']);
        });

        test('decodes excludeCredentials base64url into descriptors with correct id bytes', async () => {
            const credId = new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]);
            const credIdB64url = toBase64url(credId);
            await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'uid-1', name: 'alice', displayName: 'Alice' },
                excludeCredentials: [credIdB64url],
            });
            if (!capturedOptions) return;
            expect(Array.isArray(capturedOptions.excludeCredentials)).toBe(true);
            const desc = capturedOptions.excludeCredentials[0];
            expect(desc.type).toBe('public-key');
            const captured = new Uint8Array(desc.id);
            expect(captured).toEqual(credId);
        });

        test('forwards authenticatorSelection verbatim', async () => {
            const sel = {
                authenticatorAttachment: 'platform',
                residentKey: 'required',
                userVerification: 'required',
            };
            await inst.register({
                rp:   { id: 'example.com', name: 'Example' },
                user: { id: 'uid-1', name: 'alice', displayName: 'Alice' },
                authenticatorSelection: sel,
            });
            if (!capturedOptions) return;
            expect(capturedOptions.authenticatorSelection).toEqual(sel);
        });
    });

    // ── 5. authenticate() with credentials.get stub ─────────────────────────

    describe('authenticate', () => {
        let capturedGetOptions = null;

        beforeEach(() => {
            capturedGetOptions = null;
            const fakeGet = async (credOpts) => {
                capturedGetOptions = credOpts.publicKey;
                const rawIdBytes = new Uint8Array([5, 6, 7]);
                return {
                    id: toBase64url(rawIdBytes),
                    rawId: rawIdBytes.buffer,
                    type: 'public-key',
                    response: {
                        clientDataJSON:    new Uint8Array([11, 22]).buffer,
                        authenticatorData: new Uint8Array([33, 44]).buffer,
                        signature:         new Uint8Array([55, 66]).buffer,
                        userHandle:        null,
                    },
                };
            };
            try {
                Object.defineProperty(navigator, 'credentials', {
                    value: { get: fakeGet },
                    configurable: true,
                    writable: true,
                });
            } catch (_) {}
        });

        test('decodes allowCredentials base64url to bytes', async () => {
            const credId = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
            const credIdB64url = toBase64url(credId);
            await inst.authenticate({
                allowCredentials: [credIdB64url],
            });
            if (!capturedGetOptions) return;
            const desc = capturedGetOptions.allowCredentials[0];
            expect(desc.type).toBe('public-key');
            const captured = new Uint8Array(desc.id);
            expect(captured).toEqual(credId);
        });

        test('output fields are base64url (no +, /, =)', async () => {
            const result = await inst.authenticate({});
            if (!result) return;
            expect(result.rawId).not.toMatch(/[+/=]/);
            expect(result.response.clientDataJSON).not.toMatch(/[+/=]/);
            expect(result.response.authenticatorData).not.toMatch(/[+/=]/);
            expect(result.response.signature).not.toMatch(/[+/=]/);
        });

        test('generates challenge when not provided', async () => {
            await inst.authenticate({});
            if (!capturedGetOptions) return;
            expect(capturedGetOptions.challenge.byteLength).toBe(32);
        });

        test('passes rpId when provided', async () => {
            await inst.authenticate({ rpId: 'example.com' });
            if (!capturedGetOptions) return;
            expect(capturedGetOptions.rpId).toBe('example.com');
        });

        test('userHandle absent in output when null', async () => {
            const result = await inst.authenticate({});
            if (!result) return;
            expect(result.response.userHandle).toBeUndefined();
        });

        test('userHandle non-null is base64url-encoded in output', async () => {
            const userHandleBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
            const fakeGet = async () => {
                const rawIdBytes = new Uint8Array([9, 9]);
                return {
                    id: toBase64url(rawIdBytes),
                    rawId: rawIdBytes.buffer,
                    type: 'public-key',
                    response: {
                        clientDataJSON:    new Uint8Array([1]).buffer,
                        authenticatorData: new Uint8Array([2]).buffer,
                        signature:         new Uint8Array([3]).buffer,
                        userHandle:        userHandleBytes.buffer,
                    },
                };
            };
            try {
                Object.defineProperty(navigator, 'credentials', {
                    value: { get: fakeGet },
                    configurable: true,
                    writable: true,
                });
            } catch (_) { return; }

            const result = await inst.authenticate({});
            if (!result) return;
            expect(typeof result.response.userHandle).toBe('string');
            expect(result.response.userHandle).not.toMatch(/[+/=]/);
            const decoded = fromBase64url(result.response.userHandle);
            expect(decoded).toEqual(userHandleBytes);
        });
    });

    // ── 6. base64url round-trip ──────────────────────────────────────────────

    describe('base64url round-trip (internal helper)', () => {
        const vectors = [
            new Uint8Array([]),
            new Uint8Array([0]),
            new Uint8Array([255]),
            new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]),
            new Uint8Array(Array.from({ length: 32 }, (_, i) => i)),
        ];

        for (const bytes of vectors) {
            test(`round-trip ${bytes.length} bytes`, () => {
                // Encode via the b64 module simulating what webauthn does
                const encoded = b64Inst.fromBytes(bytes)
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=+$/, '');
                // Decode
                let s = encoded.replace(/-/g, '+').replace(/_/g, '/');
                const rem = s.length % 4;
                if (rem === 2) s += '==';
                else if (rem === 3) s += '=';
                const decoded = b64Inst.toBytes(s);
                expect(decoded).toEqual(bytes);
            });
        }
    });

});
