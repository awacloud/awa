// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { xlsxThreadedComments } from './threadedComments.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const tc = xlsxThreadedComments.factory(_errors, xml, _shared);

describe('xlsxThreadedComments — comments part', () => {
    test('roundtrip top-level comment + reply', () => {
        const entries = [
            { id: '{C1}', ref: 'A1',
              date: '2024-01-15T10:30:00Z',
              personId: '{P1}',
              text: 'What about the totals?' },
            { id: '{C2}', ref: 'A1',
              date: '2024-01-15T10:35:00Z',
              personId: '{P2}',
              parentId: '{C1}',
              text: 'Updated, see row 12.',
              done: true }
        ];
        const back = tc.parseThreadedComments(tc.serializeThreadedComments(entries));
        expect(back).toEqual(entries);
    });

    test('roundtrip with mentions', () => {
        const entries = [{
            id: '{C1}', ref: 'B5',
            date: '2024-01-15T11:00:00Z',
            personId: '{P1}',
            text: '@Alice please review',
            mentions: [{
                mentionpersonId: '{P2}',
                mentionId: '0',
                startIndex: 0,
                length: 6
            }]
        }];
        const back = tc.parseThreadedComments(tc.serializeThreadedComments(entries));
        expect(back[0].mentions).toEqual(entries[0].mentions);
    });
});

describe('xlsxThreadedComments — persons part', () => {
    test('roundtrip with userId + providerId', () => {
        const persons = [
            { id: '{P1}', displayName: 'Alice',
              userId: 'alice@example.com', providerId: 'AD' },
            { id: '{P2}', displayName: 'Bob',
              providerId: 'None' }
        ];
        const back = tc.parsePersons(tc.serializePersons(persons));
        expect(back).toEqual(persons);
    });

    test('default providerId is None when absent', () => {
        const persons = [{ id: '{P1}', displayName: 'X' }];
        const xmlText = tc.serializePersons(persons);
        expect(xmlText).toContain('providerId="None"');
    });
});

describe('xlsxThreadedComments — generateId', () => {
    test('produces well-formed GUIDs', () => {
        const id = tc.generateId();
        expect(id).toMatch(
            /^\{[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}$/);
    });

    test('two consecutive returns are distinct', () => {
        expect(tc.generateId()).not.toBe(tc.generateId());
    });
});

describe('xlsxThreadedComments — generateId random source (fail closed)', () => {
    const realDesc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    function stubCrypto(value) {
        Object.defineProperty(globalThis, 'crypto',
            { value, configurable: true, writable: true });
    }
    function restoreCrypto() {
        if (realDesc) Object.defineProperty(globalThis, 'crypto', realDesc);
        else delete globalThis.crypto;
    }

    test('throws xlsx/no-random-source when crypto is unavailable', () => {
        stubCrypto(undefined);
        try {
            let err;
            try { tc.generateId(); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(_errors.RenderError);
            expect(err.code).toBe('xlsx/no-random-source');
        } finally { restoreCrypto(); }
    });

    test('throws xlsx/no-random-source when getRandomValues is not a function', () => {
        stubCrypto({});
        try {
            expect(() => tc.generateId()).toThrow(_errors.RenderError);
        } finally { restoreCrypto(); }
    });

    test('a known pattern yields the expected GUID (version 4, variant 10xx)', () => {
        stubCrypto({
            getRandomValues(b) { for (let i = 0; i < b.length; i++) b[i] = i; return b; }
        });
        try {
            expect(tc.generateId())
                .toBe('{00010203-0405-4607-8809-0a0b0c0d0e0f}');
        } finally { restoreCrypto(); }
    });
});
