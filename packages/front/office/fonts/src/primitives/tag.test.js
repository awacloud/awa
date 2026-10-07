// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { fontTag } from './tag.js';
import { testRuntime } from './_test-runtime.js';
const { ContractError } = testRuntime.resolve('fontErrors');
const { tag, untag, tagEquals } = testRuntime.resolve('fontTag');

describe('fontTag', () => {
    test('module metadata', () => {
        expect(fontTag.name).toBe('fontTag');
        expect(fontTag.dependencies).toEqual(['fontErrors']);
    });

    test('tag pack', () => {
        expect(tag('head')).toBe(0x68656164);
        expect(tag('OS/2')).toBe(0x4F532F32);
        expect(tag('cvt ')).toBe(0x63767420);
    });

    test('untag unpack', () => {
        expect(untag(0x68656164)).toBe('head');
        expect(untag(0x4F532F32)).toBe('OS/2');
        expect(untag(0x63767420)).toBe('cvt ');
    });

    test('roundtrip', () => {
        for (const s of ['glyf', 'loca', 'CFF ', 'CFF2', 'GSUB', 'fvar']) {
            expect(untag(tag(s))).toBe(s);
        }
    });

    test('tagEquals accepts string or uint32', () => {
        expect(tagEquals('head', 0x68656164)).toBe(true);
        expect(tagEquals('head', 'head')).toBe(true);
        expect(tagEquals('head', 'hhea')).toBe(false);
    });

    test('rejects bad inputs', () => {
        expect(() => tag('toolong')).toThrow(ContractError);
        expect(() => tag('')).toThrow(ContractError);
        expect(() => tag(42)).toThrow(ContractError);
    });
});
