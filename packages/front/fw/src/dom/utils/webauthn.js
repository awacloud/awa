// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Ergonomic wrapper over the Credential Management API (W3C WebAuthn Level 3)
 * for Passkey / FIDO2 registration and authentication.
 *
 * All binary I/O is exchanged as base64url (RFC 4648 §5, URL-safe, no padding)
 * via the fw `b64` module - apps never handle raw `ArrayBuffer`s.
 *
 * Scope:
 *   - `register`       → navigator.credentials.create (PublicKeyCredential)
 *   - `authenticate`   → navigator.credentials.get    (PublicKeyCredential)
 *   - `support`        → browser capability detection
 *
 * Out of scope: signature verification on the browser side - this is the
 * server's responsibility (RP or `sde_auth_webauthn`), which validates the
 * attestation and the assertion. The client does not hold the public key
 * stored by the RP.
 *
 * Worker-safe: no - Credential Management API requires main thread + user activation.
 *
 * @example
 * const webauthn = runtime.resolve('webauthn');
 * const { id, response } = await webauthn.register({
 *     rp:   { id: 'example.com', name: 'Example' },
 *     user: { id: 'uid-123', name: 'alice', displayName: 'Alice' },
 * });
 * // Send { id, response.clientDataJSON, response.attestationObject } to the RP server.
 */
import { random } from '../../crypto/utils/random.js';
import { b64 } from '../../io/codec/b64.js';

/**
 * Browser WebAuthn capability report.
 * @typedef {object} WebAuthnSupport
 * @property {boolean} available - Credential Management API present.
 * @property {boolean} userVerifyingPlatformAuthenticator - Platform authenticator (e.g. Touch ID) available.
 * @property {boolean} conditionalMediation - Conditional UI (autofill) available.
 */

/**
 * WebAuthn API returned by `factory()`. Registration/authentication results
 * are all-base64url plain objects destined for the RP server.
 * @typedef {object} WebAuthnAPI
 * @property {(opts: Object) => Promise<Object>} register - Run credential creation (navigator.credentials.create).
 * @property {(opts?: Object) => Promise<Object>} authenticate - Run credential assertion (navigator.credentials.get).
 * @property {() => Promise<WebAuthnSupport>} support - Detect browser WebAuthn capabilities.
 */

export const webauthn = {
    name: 'webauthn',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: ['random', 'b64'],
    deps: [random, b64],

    /**
     * @param {Object} random - fw `random` module
     * @param {Object} b64    - fw `b64` module
     * @returns {WebAuthnAPI} webauthn API
     */
    factory(random, b64) {

        // ── base64url helpers (RFC 4648 §5 - URL-safe, no padding) ──────────

        /**
         * Encode a Uint8Array as a base64url string without padding.
         * Uses b64.fromBytes then replaces non-URL-safe characters.
         *
         * @param {Uint8Array} bytes
         * @returns {string}
         */
        function _toBase64url(bytes) {
            return b64.fromBytes(bytes)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
        }

        /**
         * Decode a base64url string (with or without padding) into a Uint8Array.
         *
         * @param {string} str
         * @returns {Uint8Array}
         */
        function _fromBase64url(str) {
            // Restore standard characters and re-add padding
            let s = str.replace(/-/g, '+').replace(/_/g, '/');
            const rem = s.length % 4;
            if (rem === 2) s += '==';
            else if (rem === 3) s += '=';
            return b64.toBytes(s);
        }

        /**
         * Convert an ArrayBuffer to a base64url string.
         *
         * @param {ArrayBuffer} buf
         * @returns {string}
         */
        function _abToBase64url(buf) {
            return _toBase64url(new Uint8Array(buf));
        }

        /**
         * Convert a user.id (string or Uint8Array) to a Uint8Array (≤ 64 bytes).
         * If a string, encodes it as UTF-8 via TextEncoder.
         *
         * @param {string|Uint8Array} id
         * @returns {Uint8Array}
         */
        function _toUserIdBytes(id) {
            if (id instanceof Uint8Array) return id;
            // string → UTF-8
            return new TextEncoder().encode(String(id));
        }

        /**
         * Convert a challenge (Uint8Array, base64url string, or absent) to a Uint8Array.
         * If absent, generates 32 bytes via random.bytes(32).
         *
         * @param {Uint8Array|string|undefined} challenge
         * @returns {Uint8Array}
         */
        function _resolveChallenge(challenge) {
            if (!challenge) return random.bytes(32);
            if (challenge instanceof Uint8Array) return challenge;
            return _fromBase64url(String(challenge));
        }

        /**
         * Convert a list of credential IDs (base64url string or Uint8Array)
         * into an array of `{ type: 'public-key', id: ArrayBuffer }`.
         *
         * @param {Array<string|Uint8Array>} list
         * @returns {Array<{type: string, id: ArrayBuffer}>}
         */
        function _toCredDescriptors(list) {
            if (!list || !list.length) return [];
            // @ts-ignore - SharedArrayBuffer vs ArrayBuffer; WebAuthn only gets ArrayBuffer at runtime
            return list.map(item => {
                const bytes = item instanceof Uint8Array ? item : _fromBase64url(String(item));
                // @ts-ignore - buffer.slice returns ArrayBuffer|SharedArrayBuffer; WebAuthn only uses ArrayBuffer
                return { type: 'public-key', id: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
            });
        }

        /**
         * Serialize the result of a PublicKeyCredential (create) into an
         * all-base64url object.
         *
         * @param {PublicKeyCredential} cred
         * @returns {Object}
         */
        function _serializeRegistration(cred) {
            // @ts-ignore - cred.response is AuthenticatorAttestationResponse; TS types it as AuthenticatorResponse
            const resp = /** @type {AuthenticatorAttestationResponse} */ (cred.response);
            const out = {
                id:   cred.id,
                rawId: _abToBase64url(cred.rawId),
                type: cred.type,
                response: {
                    clientDataJSON:    _abToBase64url(resp.clientDataJSON),
                    attestationObject: _abToBase64url(resp.attestationObject),
                }
            };
            if (resp.getTransports && typeof resp.getTransports === 'function') {
                // @ts-ignore - out.response is a plain object; TS narrows it too strictly
                out.response.transports = resp.getTransports();
            }
            if (cred.authenticatorAttachment) {
                out.authenticatorAttachment = cred.authenticatorAttachment;
            }
            return out;
        }

        /**
         * Serialize the result of a PublicKeyCredential (get) into an
         * all-base64url object.
         *
         * @param {PublicKeyCredential} cred
         * @returns {Object}
         */
        function _serializeAuthentication(cred) {
            // @ts-ignore - cred.response is AuthenticatorAssertionResponse; TS types it as AuthenticatorResponse
            const resp = /** @type {AuthenticatorAssertionResponse} */ (cred.response);
            const out = {
                id:   cred.id,
                rawId: _abToBase64url(cred.rawId),
                type: cred.type,
                response: {
                    clientDataJSON:    _abToBase64url(resp.clientDataJSON),
                    authenticatorData: _abToBase64url(resp.authenticatorData),
                    signature:         _abToBase64url(resp.signature),
                }
            };
            if (resp.userHandle) {
                // @ts-ignore - out.response is a plain object; TS narrows it too strictly
                out.response.userHandle = _abToBase64url(resp.userHandle);
            }
            return out;
        }

        // ── Public API ──────────────────────────────────────────────────────

        /**
         * Run a WebAuthn registration (navigator.credentials.create).
         *
         * Returns an all-base64url object to send to the RP server for
         * verification. The signature is NOT verified on the client side.
         *
         * @param {Object}  opts
         * @param {Object}  opts.rp                    - { id: string, name: string }
         * @param {Object}  opts.user                  - { id: string|Uint8Array, name, displayName }
         * @param {Uint8Array|string} [opts.challenge] - 32+ bytes; generated if absent
         * @param {Array}   [opts.pubKeyCredParams]    - defaults to ES256 + RS256
         * @param {Object}  [opts.authenticatorSelection]
         * @param {string}  [opts.attestation]         - 'none'|'indirect'|'direct'|'enterprise'
         * @param {number}  [opts.timeout]             - ms, defaults to 60_000
         * @param {Array}   [opts.excludeCredentials]  - list of base64url IDs to exclude
         * @returns {Promise<Object>} Serialized credential (all base64url)
         */
        async function register(opts) {
            const {
                rp,
                user,
                challenge,
                pubKeyCredParams = [
                    { type: 'public-key', alg: -7   },   // ES256
                    { type: 'public-key', alg: -257 },   // RS256
                ],
                authenticatorSelection,
                attestation = 'none',
                timeout = 60_000,
                excludeCredentials,
            } = opts;

            const challengeBytes = _resolveChallenge(challenge);
            const userIdBytes    = _toUserIdBytes(user.id);

            const publicKeyOptions = {
                rp,
                user: {
                    id:          userIdBytes.buffer.slice(userIdBytes.byteOffset, userIdBytes.byteOffset + userIdBytes.byteLength),
                    name:        user.name,
                    displayName: user.displayName,
                },
                challenge:   challengeBytes.buffer.slice(challengeBytes.byteOffset, challengeBytes.byteOffset + challengeBytes.byteLength),
                pubKeyCredParams,
                attestation,
                timeout,
            };

            if (authenticatorSelection) {
                publicKeyOptions.authenticatorSelection = authenticatorSelection;
            }
            if (excludeCredentials && excludeCredentials.length) {
                publicKeyOptions.excludeCredentials = _toCredDescriptors(excludeCredentials);
            }

            // @ts-ignore - publicKeyOptions is a valid PublicKeyCredentialCreationOptions; SharedArrayBuffer from buffer.slice is safe here
            const cred = await navigator.credentials.create({ publicKey: publicKeyOptions });
            // @ts-ignore - cred is PublicKeyCredential; TS types credentials.create as Credential | null
            return _serializeRegistration(cred);
        }

        /**
         * Run a WebAuthn authentication (navigator.credentials.get).
         *
         * Returns an all-base64url object to send to the RP server for
         * signature verification. Verification is NOT performed on the
         * client side.
         *
         * @param {Object}  [opts={}]
         * @param {Uint8Array|string} [opts.challenge]      - generated if absent
         * @param {string}  [opts.rpId]
         * @param {Array}   [opts.allowCredentials]         - allowed base64url IDs
         * @param {string}  [opts.userVerification]         - 'required'|'preferred'|'discouraged'
         * @param {number}  [opts.timeout]                  - ms, defaults to 60_000
         * @returns {Promise<Object>} Serialized assertion (all base64url)
         */
        async function authenticate(opts = {}) {
            const {
                challenge,
                rpId,
                allowCredentials,
                userVerification = 'preferred',
                timeout = 60_000,
            } = opts;

            const challengeBytes = _resolveChallenge(challenge);

            const publicKeyOptions = {
                challenge:        challengeBytes.buffer.slice(challengeBytes.byteOffset, challengeBytes.byteOffset + challengeBytes.byteLength),
                userVerification,
                timeout,
            };

            if (rpId) publicKeyOptions.rpId = rpId;
            if (allowCredentials && allowCredentials.length) {
                publicKeyOptions.allowCredentials = _toCredDescriptors(allowCredentials);
            }

            // @ts-ignore - publicKeyOptions is a valid PublicKeyCredentialRequestOptions; SharedArrayBuffer from buffer.slice is safe here
            const cred = await navigator.credentials.get({ publicKey: publicKeyOptions });
            // @ts-ignore - cred is PublicKeyCredential; TS types credentials.get as Credential | null
            return _serializeAuthentication(cred);
        }

        /**
         * Detect the browser's WebAuthn capabilities.
         *
         * The method is async because `isUserVerifyingPlatformAuthenticatorAvailable`
         * returns a Promise.
         *
         * @returns {Promise<{
         *   available: boolean,
         *   userVerifyingPlatformAuthenticator: boolean,
         *   conditionalMediation: boolean
         * }>}
         */
        async function support() {
            const available = typeof navigator !== 'undefined'
                && !!navigator.credentials
                && typeof navigator.credentials.create === 'function';

            if (!available) {
                return {
                    available: false,
                    userVerifyingPlatformAuthenticator: false,
                    conditionalMediation: false,
                };
            }

            const hasPKC = typeof window !== 'undefined' && !!window.PublicKeyCredential;

            let uvpa = false;
            try {
                if (hasPKC
                    && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
                    uvpa = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                }
            } catch (_) {
                uvpa = false;
            }

            let cm = false;
            try {
                if (hasPKC
                    && typeof window.PublicKeyCredential.isConditionalMediationAvailable === 'function') {
                    cm = await window.PublicKeyCredential.isConditionalMediationAvailable();
                }
            } catch (_) {
                cm = false;
            }

            return {
                available: true,
                userVerifyingPlatformAuthenticator: !!uvpa,
                conditionalMediation: !!cm,
            };
        }

        return { register, authenticate, support };
    }
};
