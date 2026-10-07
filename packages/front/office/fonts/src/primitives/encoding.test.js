// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontEncoding } from './encoding.js';
import { testRuntime } from './_test-runtime.js';
const { ParseError } = testRuntime.resolve('fontErrors');
const { decodeUtf16Be, encodeUtf16Be, decodeMacRoman, encodeMacRoman } = testRuntime.resolve('fontEncoding');

describe('fontEncoding', () => {
    test('module metadata', () => {
        expect(fontEncoding.name).toBe('fontEncoding');
    });

    test('UTF-16BE roundtrip ASCII', () => {
        const s = 'Roboto';
        const u = encodeUtf16Be(s);
        expect(decodeUtf16Be(u)).toBe(s);
    });

    test('UTF-16BE roundtrip non-ASCII BMP', () => {
        const s = 'café';
        const u = encodeUtf16Be(s);
        expect(decodeUtf16Be(u)).toBe(s);
        expect(u[2]).toBe(0x00);
        expect(u[3]).toBe(0x61);
    });

    test('UTF-16BE rejects odd length', () => {
        expect(() => decodeUtf16Be(new Uint8Array(3))).toThrow(ParseError);
    });

    test('Mac Roman decodes ASCII', () => {
        expect(decodeMacRoman(new Uint8Array([0x48, 0x69]))).toBe('Hi');
    });

    test('Mac Roman decodes high byte', () => {
        // 0x80 -> U+00C4
        expect(decodeMacRoman(new Uint8Array([0x80]))).toBe('Ä');
        // 0xA9 -> U+00A9
        expect(decodeMacRoman(new Uint8Array([0xA9]))).toBe('©');
    });

    test('Mac Roman roundtrip', () => {
        const s = 'AÄ©';
        const u = encodeMacRoman(s);
        expect(decodeMacRoman(u)).toBe(s);
    });
});
