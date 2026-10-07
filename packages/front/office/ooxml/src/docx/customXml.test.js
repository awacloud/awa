// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxCustomXml } from './customXml.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const cx = docxCustomXml.factory(_errors, xml, _shared);

describe('docxCustomXml — props', () => {
    test('parse storeItemID + schemaRefs', () => {
        const text = '<?xml version="1.0"?>'
            + '<ds:datastoreItem'
            + ' xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"'
            + ' ds:itemID="{12345678-90AB-CDEF-1234-567890ABCDEF}">'
            + '<ds:schemaRefs>'
            + '<ds:schemaRef ds:uri="http://example.com/schema"/>'
            + '<ds:schemaRef ds:uri="http://example.com/other"/>'
            + '</ds:schemaRefs>'
            + '</ds:datastoreItem>';
        const props = cx.parseProps(text);
        expect(props.storeItemID).toBe('{12345678-90AB-CDEF-1234-567890ABCDEF}');
        expect(props.schemaRefs).toEqual([
            'http://example.com/schema',
            'http://example.com/other'
        ]);
    });

    test('roundtrip render → parse', () => {
        const props = {
            storeItemID: '{ABCDEF12-3456-7890-ABCD-EF1234567890}',
            schemaRefs: ['http://my.schema']
        };
        const back = cx.parseProps(cx.renderProps(props));
        expect(back).toEqual(props);
    });

    test('generateStoreItemID produces well-formed GUID', () => {
        const id = cx.generateStoreItemID();
        expect(id).toMatch(
            /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/
        );
    });

    test('two consecutive generateStoreItemID return distinct values', () => {
        expect(cx.generateStoreItemID()).not.toBe(cx.generateStoreItemID());
    });
});

describe('docxCustomXml — random source (fail closed)', () => {
    const realDesc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    function stubCrypto(value) {
        Object.defineProperty(globalThis, 'crypto',
            { value, configurable: true, writable: true });
    }
    function restoreCrypto() {
        if (realDesc) Object.defineProperty(globalThis, 'crypto', realDesc);
        else delete globalThis.crypto;
    }

    test('throws docx/no-random-source when crypto is unavailable', () => {
        stubCrypto(undefined);
        try {
            let err;
            try { cx.generateStoreItemID(); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(_errors.RenderError);
            expect(err.code).toBe('docx/no-random-source');
        } finally { restoreCrypto(); }
    });

    test('throws docx/no-random-source when getRandomValues is not a function', () => {
        stubCrypto({});
        try {
            expect(() => cx.generateStoreItemID()).toThrow(_errors.RenderError);
        } finally { restoreCrypto(); }
    });

    test('reads globalThis.crypto at call time and sets version + variant bits', () => {
        stubCrypto({
            getRandomValues(b) { for (let i = 0; i < b.length; i++) b[i] = 0xFF; return b; }
        });
        try {
            expect(cx.generateStoreItemID())
                .toBe('{FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF}');
        } finally { restoreCrypto(); }
    });

    test('a known pattern yields the expected GUID', () => {
        stubCrypto({
            getRandomValues(b) { for (let i = 0; i < b.length; i++) b[i] = i; return b; }
        });
        try {
            expect(cx.generateStoreItemID())
                .toBe('{00010203-0405-4607-8809-0A0B0C0D0E0F}');
        } finally { restoreCrypto(); }
    });
});
