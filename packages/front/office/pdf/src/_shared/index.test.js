// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfShared } from './index.js';

describe('pdfShared module', () => {
    test('module metadata', () => {
        expect(pdfShared.name).toBe('pdfShared');
        expect(pdfShared.dependencies).toEqual([]);
        expect(typeof pdfShared.factory).toBe('function');
    });

    test('factory exposes expected API', () => {
        const s = pdfShared.factory();
        // magic
        expect(s.HEADER_PREFIX).toBeInstanceOf(Uint8Array);
        expect(s.EOF_MARKER).toBeInstanceOf(Uint8Array);
        expect(s.BINARY_MARKER).toBeInstanceOf(Uint8Array);
        expect(typeof s.ASCII).toBe('object');
        // char classes
        expect(typeof s.isWs).toBe('function');
        expect(typeof s.isEol).toBe('function');
        expect(typeof s.isDigit).toBe('function');
        expect(typeof s.isHex).toBe('function');
        expect(typeof s.isDelim).toBe('function');
        expect(typeof s.isRegular).toBe('function');
        expect(typeof s.hexNibble).toBe('function');
        // codec
        expect(s.te).toBeDefined();
        expect(s.tdUtf8).toBeDefined();
        expect(s.tdUtf8Lenient).toBeDefined();
        expect(s.tdLatin1).toBeDefined();
        expect(typeof s.encodeAscii).toBe('function');
        // byte helpers
        expect(typeof s.pad10).toBe('function');
        expect(typeof s.hexLit).toBe('function');
        expect(typeof s.bytesEqual).toBe('function');
        expect(typeof s.concatBytes).toBe('function');
    });

    describe('magic bytes', () => {
        const s = pdfShared.factory();
        test('HEADER_PREFIX is %PDF-', () => {
            expect(Array.from(s.HEADER_PREFIX))
                .toEqual([0x25, 0x50, 0x44, 0x46, 0x2D]);
        });
        test('EOF_MARKER is %%EOF', () => {
            expect(Array.from(s.EOF_MARKER))
                .toEqual([0x25, 0x25, 0x45, 0x4F, 0x46]);
        });
        test('BINARY_MARKER is the 6-byte high-bit comment', () => {
            expect(Array.from(s.BINARY_MARKER))
                .toEqual([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]);
        });
    });

    describe('character class predicates', () => {
        const { isWs, isEol, isDigit, isHex, isDelim, isRegular } = pdfShared.factory();

        test('isWs covers PDF whitespace set', () => {
            for (const b of [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20]) expect(isWs(b)).toBe(true);
            for (const b of [0x21, 0x41, 0x30, 0x2F]) expect(isWs(b)).toBe(false);
        });
        test('isEol matches LF/CR only', () => {
            expect(isEol(0x0A)).toBe(true);
            expect(isEol(0x0D)).toBe(true);
            expect(isEol(0x20)).toBe(false);
        });
        test('isDigit matches 0..9', () => {
            for (let c = 0x30; c <= 0x39; c++) expect(isDigit(c)).toBe(true);
            expect(isDigit(0x2F)).toBe(false);
            expect(isDigit(0x3A)).toBe(false);
        });
        test('isHex matches 0-9 / A-F / a-f', () => {
            expect(isHex(0x30)).toBe(true);
            expect(isHex(0x41)).toBe(true);
            expect(isHex(0x66)).toBe(true);
            expect(isHex(0x47)).toBe(false);
            expect(isHex(0x67)).toBe(false);
        });
        test('isDelim covers PDF delimiters', () => {
            for (const b of [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x2F, 0x25, 0x7B, 0x7D])
                expect(isDelim(b)).toBe(true);
            expect(isDelim(0x41)).toBe(false);
        });
        test('isRegular is the negation of ws ∪ delim', () => {
            expect(isRegular(0x41)).toBe(true);
            expect(isRegular(0x20)).toBe(false);
            expect(isRegular(0x2F)).toBe(false);
        });
    });

    describe('hexNibble + HEX_LO', () => {
        const { hexNibble, HEX_LO } = pdfShared.factory();
        test('hexNibble values', () => {
            expect(hexNibble(0x30)).toBe(0);
            expect(hexNibble(0x39)).toBe(9);
            expect(hexNibble(0x41)).toBe(10);
            expect(hexNibble(0x46)).toBe(15);
            expect(hexNibble(0x61)).toBe(10);
            expect(hexNibble(0x66)).toBe(15);
            expect(hexNibble(0x20)).toBe(-1);
        });
        test('HEX_LO table agrees with hexNibble for ASCII', () => {
            for (let c = 0; c < 128; c++) expect(HEX_LO[c]).toBe(hexNibble(c));
        });
    });

    describe('codec singletons', () => {
        const s = pdfShared.factory();
        test('encodeAscii round-trips with decodeUtf8', () => {
            const b = s.encodeAscii('hello PDF');
            expect(b).toBeInstanceOf(Uint8Array);
            expect(s.decodeUtf8(b)).toBe('hello PDF');
        });
        test('decodeLatin1 reads raw bytes as latin1', () => {
            expect(s.decodeLatin1(new Uint8Array([0x41, 0xE9]))).toBe('Aé');
        });
        test('decodeUtf8Lenient tolerates invalid sequences', () => {
            // 0xFF is invalid UTF-8 lead byte ; lenient decoder uses U+FFFD
            const out = s.decodeUtf8Lenient(new Uint8Array([0x41, 0xFF, 0x42]));
            expect(out.length).toBeGreaterThan(0);
        });
        test('singletons are stable across calls inside one factory instance', () => {
            expect(s.te).toBe(s.te);
            expect(s.tdLatin1).toBe(s.tdLatin1);
        });
    });

    describe('byte helpers', () => {
        const { pad10, hexLit, bytesEqual, concatBytes } = pdfShared.factory();
        test('pad10 pads to 10 digits', () => {
            expect(pad10(0)).toBe('0000000000');
            expect(pad10(42)).toBe('0000000042');
            expect(pad10(1234567890)).toBe('1234567890');
        });
        test('hexLit emits PDF hex string literal', () => {
            expect(hexLit(new Uint8Array([0xAB, 0xCD, 0x01]))).toBe('<ABCD01>');
            expect(hexLit(new Uint8Array([]))).toBe('<>');
        });
        test('bytesEqual matches identical arrays', () => {
            const a = new Uint8Array([1, 2, 3]);
            const b = new Uint8Array([1, 2, 3]);
            const c = new Uint8Array([1, 2, 4]);
            expect(bytesEqual(a, b)).toBe(true);
            expect(bytesEqual(a, c)).toBe(false);
            expect(bytesEqual(a, new Uint8Array([1, 2]))).toBe(false);
        });
        test('bytesEqual with explicit prefix length', () => {
            const a = new Uint8Array([1, 2, 3, 9]);
            const b = new Uint8Array([1, 2, 3, 8]);
            expect(bytesEqual(a, b, 3)).toBe(true);
            expect(bytesEqual(a, b, 4)).toBe(false);
        });
        test('concatBytes merges Uint8Arrays', () => {
            const out = concatBytes([
                new Uint8Array([1, 2]),
                new Uint8Array([3]),
                new Uint8Array([4, 5])
            ]);
            expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe('ASCII constant table', () => {
        const { ASCII } = pdfShared.factory();
        test('canonical bytes', () => {
            expect(ASCII.SP).toBe(0x20);
            expect(ASCII.LF).toBe(0x0A);
            expect(ASCII.CR).toBe(0x0D);
            expect(ASCII.PERCENT).toBe(0x25);
            expect(ASCII.SLASH).toBe(0x2F);
            expect(ASCII.ZERO).toBe(0x30);
            expect(ASCII.A_UP).toBe(0x41);
            expect(ASCII.A_LO).toBe(0x61);
        });
        test('ASCII table is frozen', () => {
            expect(Object.isFrozen(ASCII)).toBe(true);
        });
    });
});
