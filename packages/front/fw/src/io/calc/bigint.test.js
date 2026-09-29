// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { bigint } from './bigint.js';

describe('bigint module', () => {
    test('should have correct module metadata', () => {
        expect(bigint.name).toBe('bigint');
        expect(bigint.dependencies).toEqual([]);
        expect(typeof bigint.factory).toBe('function');
    });

    describe('factory', () => {
        const b = bigint.factory();

        describe('bitLength', () => {
            test('0n → 0', () => expect(b.bitLength(0n)).toBe(0));
            test('1n → 1', () => expect(b.bitLength(1n)).toBe(1));
            test('255n → 8', () => expect(b.bitLength(255n)).toBe(8));
            test('256n → 9', () => expect(b.bitLength(256n)).toBe(9));
        });

        describe('byteLength', () => {
            test('0n → 1', () => expect(b.byteLength(0n)).toBe(1));
            test('255n → 1', () => expect(b.byteLength(255n)).toBe(1));
            test('256n → 2', () => expect(b.byteLength(256n)).toBe(2));
        });

        describe('toBytes / fromBytes', () => {
            test('toBytes(0n)', () => expect(b.toBytes(0n)).toEqual(new Uint8Array([0])));
            test('toBytes(255n)', () => expect(b.toBytes(255n)).toEqual(new Uint8Array([255])));
            test('toBytes(256n)', () => expect(b.toBytes(256n)).toEqual(new Uint8Array([1, 0])));

            test('round-trip BE', () => {
                const v = 0xdeadbeefn;
                expect(b.fromBytes(b.toBytes(v))).toBe(v);
            });

            test('round-trip LE', () => {
                const v = 0xdeadbeefn;
                expect(b.fromBytes(b.toBytes(v, { endian: 'le' }), { endian: 'le' })).toBe(v);
            });

            test('signed -1n → all 0xff (4 bytes)', () => {
                expect(b.toBytes(-1n, { signed: true, byteLength: 4 }))
                    .toEqual(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
            });

            test('fromBytes signed round-trip', () => {
                const v = -42n;
                expect(b.fromBytes(b.toBytes(v, { signed: true }), { signed: true })).toBe(v);
            });

            test('throws on negative unsigned', () => {
                expect(() => b.toBytes(-1n)).toThrow();
            });

            test('throws when byteLength too small', () => {
                expect(() => b.toBytes(256n, { byteLength: 1 })).toThrow();
            });
        });

        describe('modPow', () => {
            test('2^10 mod 1000 = 24', () => expect(b.modPow(2n, 10n, 1000n)).toBe(24n));
            test('3^0 mod 7 = 1', () => expect(b.modPow(3n, 0n, 7n)).toBe(1n));
            test('any mod 1 = 0', () => expect(b.modPow(999n, 999n, 1n)).toBe(0n));
        });

        describe('modInv', () => {
            test('modInv(3, 11) = 4', () => expect(b.modInv(3n, 11n)).toBe(4n));
            test('modInv(2, 4) throws', () => expect(() => b.modInv(2n, 4n)).toThrow());
        });

        describe('gcd / lcm', () => {
            test('gcd(12, 18) = 6', () => expect(b.gcd(12n, 18n)).toBe(6n));
            test('gcd(7, 13) = 1', () => expect(b.gcd(7n, 13n)).toBe(1n));
            test('lcm(4, 6) = 12', () => expect(b.lcm(4n, 6n)).toBe(12n));
        });

        describe('isPrime', () => {
            test('2n is prime', () => expect(b.isPrime(2n)).toBe(true));
            test('3n is prime', () => expect(b.isPrime(3n)).toBe(true));
            test('7n is prime', () => expect(b.isPrime(7n)).toBe(true));
            test('97n is prime', () => expect(b.isPrime(97n)).toBe(true));
            test('1n is not prime', () => expect(b.isPrime(1n)).toBe(false));
            test('4n is not prime', () => expect(b.isPrime(4n)).toBe(false));
            test('9n is not prime', () => expect(b.isPrime(9n)).toBe(false));
            test('Mersenne prime 8191n (2^13-1)', () => expect(b.isPrime(8191n)).toBe(true));
            test('large composite', () => expect(b.isPrime(8190n)).toBe(false));
        });

        describe('randomBetween', () => {
            test('result in [min, max]', () => {
                const mockRng = (n) => new Uint8Array(n).fill(0xab);
                const v = b.randomBetween(10n, 100n, mockRng);
                expect(v >= 10n && v <= 100n).toBe(true);
            });

            test('min === max returns min', () => {
                const mockRng = (n) => new Uint8Array(n).fill(0);
                expect(b.randomBetween(42n, 42n, mockRng)).toBe(42n);
            });

            test('throws when min > max', () => {
                expect(() => b.randomBetween(5n, 3n, () => new Uint8Array(1))).toThrow();
            });
        });

        describe('parse / toString', () => {
            test('parse decimal', () => expect(b.parse('42')).toBe(42n));
            test('parse negative', () => expect(b.parse('-42')).toBe(-42n));
            test('parse hex with 0x prefix', () => expect(b.parse('0xff', 16)).toBe(255n));
            test('toString decimal', () => expect(b.toString(255n)).toBe('255'));
            test('toString hex', () => expect(b.toString(255n, 16)).toBe('ff'));
            test('toString negative hex', () => expect(b.toString(-255n, 16)).toBe('-ff'));
        });
    });
});
