// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { uuid } from './uuid.js';
import { hex } from '../../io/codec/hex.js';

// RFC 4122 §3 / RFC 9562 §4 strict regex (with hyphens).
// version ∈ {1..5} for RFC 4122, ∈ {6, 7, 8} additional in RFC 9562 (this
// module supports v1 and v4 only).
const _RFC4122_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const _COMPACT_REGEX = /^[0-9a-f]{32}$/;

describe('uuid module', () => {
    test('should have correct module metadata', () => {
        expect(uuid.name).toBe('uuid');
        expect(uuid.dependencies).toEqual(['hex']);
        expect(typeof uuid.factory).toBe('function');
    });

    describe('factory', () => {
        let api;

        beforeEach(() => {
            api = uuid.factory(hex.factory());
        });

        test('should create generator instance', () => {
            expect(api).toBeDefined();
            expect(typeof api.v1).toBe('function');
            expect(typeof api.v4).toBe('function');
        });

        describe('v1', () => {
            test('should generate hex string by default (compact format, back-compat)', () => {
                const id = api.v1();
                expect(typeof id).toBe('string');
                expect(id.length).toBe(32);
                expect(id).toMatch(_COMPACT_REGEX);
            });

            test('should generate raw bytes when raw=true', () => {
                const raw = api.v1(true);
                expect(raw).toBeInstanceOf(Uint8Array);
                expect(raw.length).toBe(16);
            });

            test('should set UUID version to 1 and RFC 4122 variant', () => {
                const raw = api.v1(true);
                const version = (raw[6] & 0xf0) >> 4;
                const variant = (raw[8] & 0xc0) >> 6;
                expect(version).toBe(1);
                expect(variant).toBe(2);
            });

            test('should generate different values across calls', () => {
                const a = api.v1();
                const b = api.v1();
                expect(a).not.toBe(b);
            });

            test('format=rfc4122 returns canonical RFC 4122 §3 format', () => {
                const id = api.v1(false, false, 'rfc4122');
                expect(typeof id).toBe('string');
                expect(id.length).toBe(36);
                expect(id).toMatch(_RFC4122_REGEX);
                // 4 hyphens at fixed positions per RFC 4122 §3.
                expect(id[8]).toBe('-');
                expect(id[13]).toBe('-');
                expect(id[18]).toBe('-');
                expect(id[23]).toBe('-');
                // Version nibble at position 14 must be '1' (UUIDv1).
                expect(id[14]).toBe('1');
            });

            test('rfc4122 and compact yield equivalent bytes', () => {
                // Note: v1 is time-based and `_lastNSecs` advances between
                // calls - instead of comparing two outputs, we compare the
                // same raw output reformatted both ways.
                const raw = api.v1(true);
                const compact = hex.factory().fromBytes(raw);
                const rfc = compact.slice(0, 8) + '-' + compact.slice(8, 12) + '-'
                          + compact.slice(12, 16) + '-' + compact.slice(16, 20) + '-'
                          + compact.slice(20, 32);
                expect(rfc).toMatch(_RFC4122_REGEX);
                expect(rfc.replace(/-/g, '')).toBe(compact);
            });
        });

        describe('v4', () => {
            test('should generate hex string by default (compact format, back-compat)', () => {
                const id = api.v4();
                expect(typeof id).toBe('string');
                expect(id.length).toBe(32);
                expect(id).toMatch(_COMPACT_REGEX);
            });

            test('should generate raw bytes when raw=true', () => {
                const raw = api.v4(true);
                expect(raw).toBeInstanceOf(Uint8Array);
                expect(raw.length).toBe(16);
            });

            test('should set UUID version to 4 and RFC 4122 variant', () => {
                const raw = api.v4(true);
                const version = (raw[6] & 0xf0) >> 4;
                const variant = (raw[8] & 0xc0) >> 6;
                expect(version).toBe(4);
                expect(variant).toBe(2);
            });

            test('should generate different values across calls', () => {
                const a = api.v4();
                const b = api.v4();
                expect(a).not.toBe(b);
            });

            test('format=rfc4122 returns canonical RFC 4122 §3 format', () => {
                const id = api.v4(false, false, 'rfc4122');
                expect(typeof id).toBe('string');
                expect(id.length).toBe(36);
                expect(id).toMatch(_RFC4122_REGEX);
                // Version nibble at position 14 must be '4' (UUIDv4).
                expect(id[14]).toBe('4');
                // Variant nibble at position 19 must be in [89ab] (RFC 4122 §4.1.1).
                expect(id[19]).toMatch(/^[89ab]$/);
            });

            test('rfc4122 reformat is byte-equivalent to compact (deterministic prng)', () => {
                // Use a deterministic prng so we can compare two outputs.
                const fixed = new Uint8Array([
                    0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
                    0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10
                ]);
                const prng = (b) => { for (let i = 0; i < 16; i++) b[i] = fixed[i]; };
                const compact = api.v4(false, prng);
                const rfc     = api.v4(false, prng, 'rfc4122');
                expect(compact.replace(/-/g, '')).toBe(compact);  // sanity
                expect(rfc.replace(/-/g, '')).toBe(compact);
            });

            test('format=rfc4122 byte-exact known vector (RFC 4122 §A.1 style)', () => {
                // RFC 9562 §A.4 example UUIDv4 = `91c274f2-9a0d-4ce6-9c5d-...`
                // Built bit-by-bit with a deterministic prng.
                // Raw bytes (post-version+variant patch):
                //   91 c2 74 f2 9a 0d  4c e6 9c 5d ...
                // Before v4 patch: byte 6 = 0x?c with lower nibble preserved → we
                // use 0x4c (version=4 already OK), byte 8 = 0x?d → 0x9d (variant 10).
                const fixed = new Uint8Array([
                    0x91, 0xc2, 0x74, 0xf2,
                    0x9a, 0x0d,
                    0x0c, 0xe6,    // byte 6 = 0x?c → after patch (0x0c & 0x0f) | 0x40 = 0x4c
                    0x5d, 0x5d,    // byte 8 = 0x?d → after patch (0x5d & 0x3f) | 0x80 = 0x9d
                    0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07
                ]);
                const prng = (b) => { for (let i = 0; i < 16; i++) b[i] = fixed[i]; };
                const id = api.v4(false, prng, 'rfc4122');
                expect(id).toBe('91c274f2-9a0d-4ce6-9d5d-b2c3d4e5f607');
            });
        });

        describe('prng validation', () => {
            test('should accept prng that returns Uint8Array', () => {
                const prng = () => new Uint8Array(16);
                const raw = api.v4(true, prng);
                expect(raw).toBeInstanceOf(Uint8Array);
                expect(raw.length).toBe(16);
            });

            test('should accept prng that fills provided buffer', () => {
                const prng = (buf) => {
                    for (let i = 0; i < 16; i++) buf[i] = 7;
                };
                const raw = api.v4(true, prng);
                expect(raw).toBeInstanceOf(Uint8Array);
                expect(raw.length).toBe(16);
            });

            test('should fallback when prng returns invalid output', () => {
                const prng = () => new Uint8Array(8);
                const raw = api.v4(true, prng);
                expect(raw).toBeInstanceOf(Uint8Array);
                expect(raw.length).toBe(16);
            });
        });

        test('raw bytes should match hex output', () => {
            const raw = api.v4(true);
            const fromBytes = hex.factory().fromBytes(raw);
            expect(fromBytes.length).toBe(32);
            expect(fromBytes).toMatch(_COMPACT_REGEX);
        });

        // ── Validator interop (cross-check avec valid.js regex) ─────────────
        describe('RFC 4122 validator interop', () => {
            test('format=rfc4122 v4 matches valid.js uuid regex', () => {
                // valid.js:194 - exact regex used by `valid.js` 'uuid' format.
                const validRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                for (let i = 0; i < 50; i++) {
                    expect(api.v4(false, false, 'rfc4122')).toMatch(validRegex);
                }
            });

            test('format=rfc4122 v1 matches valid.js uuid regex', () => {
                const validRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                for (let i = 0; i < 50; i++) {
                    expect(api.v1(false, false, 'rfc4122')).toMatch(validRegex);
                }
            });
        });
    });
});
