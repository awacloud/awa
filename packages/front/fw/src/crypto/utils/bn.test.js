// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { bn } from './bn.js';
import { random } from './random.js';
import { bitArray } from './bitArray.js';
import { aes } from '../cipher/aes.js';
import { sha256 } from '../hash/sha256.js';
import { utf8 } from '../../io/codec/utf8.js';

const _ba = bitArray.factory();
const _utf8 = utf8.factory(_ba);
const _aes = aes.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _rng = random.factory(_ba, _aes, _sha256);
const _bn = bn.factory(_ba, _rng);

describe('bn module', () => {

    test('module metadata', () => {
        expect(bn.name).toBe('bn');
        expect(bn.dependencies).toEqual(['bitArray', 'random']);
    });

    describe('construction & equality', () => {
        test('numeric initialization', () => {
            const a = new _bn.bn(42);
            expect(a.equals(42)).toBe(true);
        });

        test('hex string initialization round-trips through equals', () => {
            const a = new _bn.bn('0x1234');
            const b = new _bn.bn(0x1234);
            expect(a.equals(b)).toBe(true);
        });

        test('different values are not equal', () => {
            expect(new _bn.bn(1).equals(2)).toBe(false);
        });

        test('copy yields an independent equal object', () => {
            const a = new _bn.bn(123);
            const b = a.copy();
            expect(a.equals(b)).toBe(true);
            expect(a).not.toBe(b);
        });
    });

    describe('add / sub / mul', () => {
        test('add basic', () => {
            const a = new _bn.bn(7);
            expect(a.add(5).equals(12)).toBe(true);
        });

        test('sub basic', () => {
            const a = new _bn.bn(20);
            expect(a.sub(8).equals(12)).toBe(true);
        });

        test('mul basic', () => {
            const a = new _bn.bn(6);
            expect(a.mul(7).equals(42)).toBe(true);
        });

        test('square equals self-mul', () => {
            const a = new _bn.bn(13);
            expect(a.square().equals(a.mul(a))).toBe(true);
        });
    });

    describe('greaterEquals', () => {
        test('greater', () => {
            expect(new _bn.bn(10).greaterEquals(5)).toBeTruthy();
        });

        test('equal', () => {
            expect(new _bn.bn(5).greaterEquals(5)).toBeTruthy();
        });

        test('less', () => {
            expect(new _bn.bn(3).greaterEquals(5)).toBeFalsy();
        });
    });

    describe('prime classes', () => {
        test('p256 prime exists and is a constructor', () => {
            expect(typeof _bn.prime.p256).toBe('function');
        });

        test('p256 instance reduces below the prime', () => {
            const x = new _bn.prime.p256('0x1');
            expect(x.equals(1)).toBe(true);
        });
    });

    describe('random', () => {
        test('produces a value strictly less than the modulus', () => {
            const modulus = new _bn.bn('0x10000');
            const r = _bn.random(modulus);
            expect(r.greaterEquals(modulus)).toBeFalsy();
        });
    });

    describe('fromBits', () => {
        test('round-trip with toBits', () => {
            const a = new _bn.bn('0xdeadbeef');
            const bits = a.toBits();
            const b = _bn.fromBits(bits);
            expect(a.equals(b)).toBe(true);
        });
    });
});
