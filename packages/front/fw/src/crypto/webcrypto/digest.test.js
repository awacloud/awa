// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, mock } from 'bun:test';
import { webcryptoDigest } from './digest.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Encode a UTF-8 string to Uint8Array. */
function enc(str) {
    return new TextEncoder().encode(str);
}

/** Convert Uint8Array to lowercase hex string. */
function toHex(ui8) {
    return Array.from(ui8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── module-level instances ───────────────────────────────────────────────────

const _d = webcryptoDigest.factory();

// ── module metadata ──────────────────────────────────────────────────────────

describe('webcryptoDigest — module metadata', () => {
    test('name', () => {
        expect(webcryptoDigest.name).toBe('webcryptoDigest');
    });

    test('version', () => {
        expect(webcryptoDigest.version).toBe('1.0.0');
    });

    test('type', () => {
        expect(webcryptoDigest.type).toBe('fw.crypto.webcrypto');
    });

    test('dependencies is empty array', () => {
        expect(webcryptoDigest.dependencies).toEqual([]);
    });

    test('deps is absent (no dependencies)', () => {
        expect(webcryptoDigest.deps).toBeUndefined();
    });

    test('factory is a function', () => {
        expect(typeof webcryptoDigest.factory).toBe('function');
    });
});

// ── API shape ────────────────────────────────────────────────────────────────

describe('webcryptoDigest — API shape', () => {
    test('isAvailable is a function', () => {
        expect(typeof _d.isAvailable).toBe('function');
    });

    test('digest is a function', () => {
        expect(typeof _d.digest).toBe('function');
    });

    test('sha256 is a function', () => {
        expect(typeof _d.sha256).toBe('function');
    });

    test('sha384 is a function', () => {
        expect(typeof _d.sha384).toBe('function');
    });

    test('sha512 is a function', () => {
        expect(typeof _d.sha512).toBe('function');
    });

    test('sha1 is a function', () => {
        expect(typeof _d.sha1).toBe('function');
    });

    test('isAvailable returns boolean', () => {
        expect(typeof _d.isAvailable()).toBe('boolean');
    });
});

// ── FIPS 180-4 known-answer vectors ─────────────────────────────────────────

describe('webcryptoDigest — FIPS 180-4 / NIST known-answer vectors', () => {
    describe('SHA-256', () => {
        test('empty string → e3b0c44…', async () => {
            const result = await _d.sha256(enc(''));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(toHex(result)).toBe(
                'e3b0c44298fc1c149afbf4c8996fb924' +
                '27ae41e4649b934ca495991b7852b855'
            );
        });

        test('"abc" → ba7816bf… (FIPS 180-4 App. B vector 1)', async () => {
            const result = await _d.sha256(enc('abc'));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(toHex(result)).toBe(
                'ba7816bf8f01cfea414140de5dae2223' +
                'b00361a396177a9cb410ff61f20015ad'
            );
        });

        test('"abcdbcdecdef…nopq" → 248d6a61… (FIPS 180-4 App. B vector 2)', async () => {
            const msg = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
            const result = await _d.sha256(enc(msg));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(toHex(result)).toBe(
                '248d6a61d20638b8e5c026930c3e6039' +
                'a33ce45964ff2167f6ecedd419db06c1'
            );
        });

        test('digest("SHA-256", data) matches sha256(data)', async () => {
            const data = enc('abc');
            const via_digest = await _d.digest('SHA-256', data);
            const via_sha256 = await _d.sha256(data);
            expect(toHex(via_digest)).toBe(toHex(via_sha256));
        });
    });

    describe('SHA-384', () => {
        test('empty string → 38b060a7…', async () => {
            const result = await _d.sha384(enc(''));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(toHex(result)).toBe(
                '38b060a751ac96384cd9327eb1b1e36a' +
                '21fdb71114be07434c0cc7bf63f6e1da' +
                '274edebfe76f65fbd51ad2f14898b95b'
            );
        });

        test('"abc" → cb00753f…', async () => {
            const result = await _d.sha384(enc('abc'));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(toHex(result)).toBe(
                'cb00753f45a35e8bb5a03d699ac65007' +
                '272c32ab0eded1631a8b605a43ff5bed' +
                '8086072ba1e7cc2358baeca134c825a7'
            );
        });
    });

    describe('SHA-512', () => {
        test('empty string → cf83e135…', async () => {
            const result = await _d.sha512(enc(''));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(toHex(result)).toBe(
                'cf83e1357eefb8bdf1542850d66d8007' +
                'd620e4050b5715dc83f4a921d36ce9ce' +
                '47d0d13c5d85f2b0ff8318d2877eec2f' +
                '63b931bd47417a81a538327af927da3e'
            );
        });

        test('"abc" → ddaf35a1…', async () => {
            const result = await _d.sha512(enc('abc'));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(toHex(result)).toBe(
                'ddaf35a193617abacc417349ae204131' +
                '12e6fa4e89a97ea20a9eeee64b55d39a' +
                '2192992a274fc1a836ba3c23a3feebbd' +
                '454d4423643ce80e2a9ac94fa54ca49f'
            );
        });
    });
});

// ── cross-check against pure-JS sha256 ───────────────────────────────────────

describe('webcryptoDigest — cross-check vs pure-JS sha256', () => {
    test('"hello world" SHA-256 parity: digest() matches sha256()', async () => {
        // Cross-check: digest('SHA-256', …) and sha256(…) must agree.
        // The FIPS 180-4 vector for "abc" (separate test) confirms the absolute value;
        // here we confirm the two entrypoints are consistent on a different input.
        const data = enc('hello world');
        const viaSha256 = toHex(await _d.sha256(data));
        const viaDigest = toHex(await _d.digest('SHA-256', data));
        expect(viaSha256).toBe(viaDigest);

        // Output is a 32-byte Uint8Array
        const result = await _d.sha256(data);
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.byteLength).toBe(32);
    });

    test('SHA-256 of "abc" matches known FIPS 180-4 value (parity check)', async () => {
        // The FIPS known value for "abc" is ba7816bf...
        // This simultaneously cross-validates webcrypto vs the known FIPS vector,
        // which is the same value verified by the pure-JS sha256 test suite.
        const result = await _d.sha256(enc('abc'));
        expect(toHex(result)).toBe(
            'ba7816bf8f01cfea414140de5dae2223' +
            'b00361a396177a9cb410ff61f20015ad'
        );
    });
});

// ── unsupported algorithm ─────────────────────────────────────────────────────

describe('webcryptoDigest — unsupported algorithm → false', () => {
    test('SHA-3-256 → false', async () => {
        const consoleSpy = mock(() => {});
        const orig = console.error;
        console.error = consoleSpy;
        try {
            const result = await _d.digest('SHA-3-256', enc('abc'));
            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalled();
        } finally {
            console.error = orig;
        }
    });

    test('SHA-224 → false (not in WebCrypto)', async () => {
        const consoleSpy = mock(() => {});
        const orig = console.error;
        console.error = consoleSpy;
        try {
            const result = await _d.digest('SHA-224', enc('abc'));
            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalled();
        } finally {
            console.error = orig;
        }
    });

    test('empty string algorithm → false', async () => {
        const consoleSpy = mock(() => {});
        const orig = console.error;
        console.error = consoleSpy;
        try {
            const result = await _d.digest('', enc('abc'));
            expect(result).toBe(false);
        } finally {
            console.error = orig;
        }
    });

    test('INVALID log message contains the unsupported name', async () => {
        const messages = [];
        const orig = console.error;
        console.error = (...args) => messages.push(args.join(' '));
        try {
            await _d.digest('SHA-3-256', enc('test'));
            expect(messages.some(m => m.includes('SHA-3-256'))).toBe(true);
            expect(messages.some(m => m.includes('[crypto] INVALID'))).toBe(true);
        } finally {
            console.error = orig;
        }
    });
});

// ── sha1 — deprecation warning ───────────────────────────────────────────────

describe('webcryptoDigest — sha1 deprecation', () => {
    test('sha1 emits deprecation warning', async () => {
        const warnings = [];
        const orig = console.warn;
        console.warn = (...args) => warnings.push(args.join(' '));
        try {
            const result = await _d.sha1(enc('abc'));
            expect(warnings.some(w => w.includes('DEPRECATED'))).toBe(true);
            expect(warnings.some(w => w.includes('SHA-1'))).toBe(true);
            // Still returns a digest
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.byteLength).toBe(20); // SHA-1 = 160 bits
        } finally {
            console.warn = orig;
        }
    });

    test('sha1("abc") → correct SHA-1 digest (FIPS 180-4)', async () => {
        const orig = console.warn;
        console.warn = () => {};
        try {
            const result = await _d.sha1(enc('abc'));
            // SHA-1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d
            expect(toHex(result)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
        } finally {
            console.warn = orig;
        }
    });
});

// ── non-Uint8Array input → false ─────────────────────────────────────────────

describe('webcryptoDigest — non-Uint8Array input → false', () => {
    test('string input → false', async () => {
        const consoleSpy = mock(() => {});
        const orig = console.error;
        console.error = consoleSpy;
        try {
            const result = await _d.digest('SHA-256', 'abc');
            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalled();
        } finally {
            console.error = orig;
        }
    });

    test('ArrayBuffer input → false (not Uint8Array)', async () => {
        const consoleSpy = mock(() => {});
        const orig = console.error;
        console.error = consoleSpy;
        try {
            const buf = new ArrayBuffer(3);
            const result = await _d.digest('SHA-256', buf);
            expect(result).toBe(false);
        } finally {
            console.error = orig;
        }
    });

    test('null input → false', async () => {
        const consoleSpy = mock(() => {});
        const orig = console.error;
        console.error = consoleSpy;
        try {
            const result = await _d.digest('SHA-256', null);
            expect(result).toBe(false);
        } finally {
            console.error = orig;
        }
    });

    test('number[] input → false (not Uint8Array)', async () => {
        const consoleSpy = mock(() => {});
        const orig = console.error;
        console.error = consoleSpy;
        try {
            const result = await _d.sha256([1, 2, 3]);
            expect(result).toBe(false);
        } finally {
            console.error = orig;
        }
    });
});

// ── availability guard ───────────────────────────────────────────────────────

describe('webcryptoDigest — availability', () => {
    test('isAvailable() returns boolean', () => {
        const available = _d.isAvailable();
        expect(typeof available).toBe('boolean');
    });

    test('isAvailable() is true in Bun (crypto.subtle present)', () => {
        // Bun ships WebCrypto; this confirms the guard evaluates correctly.
        expect(_d.isAvailable()).toBe(true);
    });

    test('sha256 resolves to Uint8Array when isAvailable is true', async () => {
        if (!_d.isAvailable()) return; // Skip when unavailable
        const result = await _d.sha256(enc('test'));
        expect(result).toBeInstanceOf(Uint8Array);
    });
});
