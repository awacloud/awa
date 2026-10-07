// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfDocument } from './document.js';
import { pdfShared } from '../_shared/index.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfTrailer } from '../syntax/trailer.js';
import { pdfCatalog } from './catalog.js';
import { pdfPage } from './page.js';
import { pdfPages } from './pages.js';
import { buildDocument } from '../../tests/_helpers/build.js';
import { pdfErrors } from '../errors.js';
import { pdfWriter } from './writer.js';
import { pdfEncryptedWriter } from './encryptedWriter.js';
import { pdfStandardV5 } from '../crypto/standardV5.js';
import { pdfSerializer } from '../syntax/serializer.js';

import { aes }      from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc }      from '@awacloud/fw/crypto/mode/cbc.js';
import { sha256 }   from '@awacloud/fw/crypto/hash/sha256.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 }     from '@awacloud/fw/io/codec/utf8.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const errors = _pdfErrors_TD1;
const { ParseError } = errors;
const _shared    = pdfShared.factory();
const _tokenizer = pdfTokenizer.factory(errors, _shared);
const _parserObj = pdfParserObj.factory();
const _parser    = pdfParser.factory(errors, _parserObj, _tokenizer);
const _xref      = pdfXref.factory(errors, _tokenizer, _parser);
const _trailer   = pdfTrailer.factory(errors, _parserObj);
const _catalog   = pdfCatalog.factory(errors, _parserObj);
const _page      = pdfPage.factory(errors, _parserObj);
const _pages     = pdfPages.factory(errors, _parserObj);
const { readDocument, readHeader } = pdfDocument.factory(
    errors, _tokenizer, _parser, _xref, _trailer, _catalog, _page, _pages
);

// --- encrypted-fixture wiring — mirrors document/encryptedWriter.test.js ---
const _rtEnc = new ModuleRuntime();
_rtEnc.register(bitArray); _rtEnc.register(utf8);
_rtEnc.register(aes); _rtEnc.register(cbc);
_rtEnc.register(sha256);
const _aesFw  = _rtEnc.resolve('aes');
const _cbcFw  = _rtEnc.resolve('cbc');
const _sha256Fw = _rtEnc.resolve('sha256');
const _baFw   = _rtEnc.resolve('bitArray');

const _serializerMod = pdfSerializer.factory(errors);
const _writerMod = pdfWriter.factory(errors, _serializerMod);
const _v5Mod = pdfStandardV5.factory(errors, _aesFw, _cbcFw, _sha256Fw, _baFw);
const _encMod = pdfEncryptedWriter.factory(
    errors, _writerMod, _v5Mod, null, null, null);

function _deterministicRand(seed) {
    let n = seed | 0;
    return function(len) {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            n = (n * 1103515245 + 12345) & 0x7fffffff;
            out[i] = n & 0xff;
        }
        return out;
    };
}

function buildEncryptedDocument() {
    const streamPayload = te.encode('BT /F1 12 Tf (Encrypted) Tj ET');
    const indirects = [
        { num: 1, gen: 0, value: { type: 'dict', entries: {
            Type:  { type: 'name', value: 'Catalog' },
            Pages: { type: 'ref',  num: 2, gen: 0 }
        } } },
        { num: 2, gen: 0, value: { type: 'dict', entries: {
            Type:  { type: 'name', value: 'Pages' },
            Kids:  { type: 'array', items: [{ type: 'ref', num: 3, gen: 0 }] },
            Count: { type: 'int', value: 1 }
        } } },
        { num: 3, gen: 0, value: { type: 'dict', entries: {
            Type:     { type: 'name', value: 'Page' },
            Parent:   { type: 'ref',  num: 2, gen: 0 },
            MediaBox: { type: 'array', items: [
                { type: 'int', value: 0 }, { type: 'int', value: 0 },
                { type: 'int', value: 612 }, { type: 'int', value: 792 }
            ] },
            Contents: { type: 'ref',  num: 4, gen: 0 }
        } } },
        { num: 4, gen: 0, value: {
            type: 'stream',
            dict: { type: 'dict', entries: {} },
            raw:  streamPayload
        } }
    ];
    const out = _encMod.writeEncryptedDocument({
        indirects,
        root: { num: 1, gen: 0 },
        encrypt: {
            version: 5,
            revision: 5,
            ownerPassword: 'owner-pwd',
            userPassword: 'user-pwd',
            permissions: -1 | 0xFFFFFFFC,
            randomBytes: _deterministicRand(0xC0DEFACE)
        }
    });
    return out.bytes;
}

const te = new TextEncoder();

describe('readHeader', () => {
    test('reads %PDF-2.0', () => {
        const { version, end } = readHeader(te.encode('%PDF-2.0\n%bin\n'));
        expect(version).toBe('2.0');
        expect(end).toBe(9);
    });

    test('reads %PDF-1.7', () => {
        expect(readHeader(te.encode('%PDF-1.7\n')).version).toBe('1.7');
    });

    test('tolerates leading junk', () => {
        const b = new Uint8Array([0xFF, 0xFE, 0xFD,
            ...te.encode('%PDF-2.0\n')]);
        expect(readHeader(b).version).toBe('2.0');
    });

    test('rejects no header', () => {
        expect(() => readHeader(te.encode('No PDF here'))).toThrow(ParseError);
    });

    test('rejects too-short input', () => {
        expect(() => readHeader(te.encode('%PDF'))).toThrow(ParseError);
    });
});

describe('readDocument', () => {
    test('reads a one-page doc end to end', () => {
        const b = buildDocument({ pages: ['BT /F1 12 Tf (Hi) Tj ET'] });
        const doc = readDocument(b);
        expect(doc.version).toBe('2.0');
        expect(doc.pages.length).toBe(1);
        expect(doc.pages[0].mediaBox).toEqual([0, 0, 612, 792]);
        expect(doc.catalog.pages.num).toBe(2);
    });

    test('reads multi-page doc', () => {
        const b = buildDocument({ pages: ['a', 'b', 'c', 'd'] });
        const doc = readDocument(b);
        expect(doc.pages.length).toBe(4);
        expect(doc.trailer.size).toBeGreaterThan(0);
    });

    test('exposes a working resolver in _raw', () => {
        const b = buildDocument({ pages: ['x'] });
        const doc = readDocument(b);
        const ref = doc.catalog.pages;
        const dict = doc._raw.resolve({ type: 'ref', num: ref.num, gen: ref.gen });
        expect(dict.type).toBe('dict');
        expect(dict.entries.Type.value).toBe('Pages');
    });

    test('caches resolved objects', () => {
        const b = buildDocument({ pages: ['x'] });
        const doc = readDocument(b);
        const ref = { type: 'ref', num: 1, gen: 0 };
        const a = doc._raw.resolve(ref);
        const b2 = doc._raw.resolve(ref);
        expect(a).toBe(b2);
    });

    test('rejects non-Uint8Array input', () => {
        expect(() => readDocument('hello')).toThrow(ParseError);
    });

    test('rejects input without xref', () => {
        const garbage = te.encode('%PDF-2.0\nbut nothing else useful');
        expect(() => readDocument(garbage)).toThrow(ParseError);
    });

    test('rejects input without header', () => {
        expect(() => readDocument(te.encode('not a pdf'))).toThrow(ParseError);
    });
});

describe('readDocument — encrypted documents (BL-329, fail-loud arm)', () => {
    test('throws pdf/document/encrypted for an encrypted document', () => {
        const encryptedBytes = buildEncryptedDocument();
        let caught = null;
        try { readDocument(encryptedBytes); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ParseError);
        expect(caught.code).toBe('pdf/document/encrypted');
    });

    test('{ allowEncrypted: true } preserves the raw ciphertext read', () => {
        const encryptedBytes = buildEncryptedDocument();
        const doc = readDocument(encryptedBytes, { allowEncrypted: true });
        expect(doc.trailer.encrypt).toBeTruthy();
        expect(doc.pages.length).toBe(1);
        // The content stream (object 4 in the fixture) comes back as
        // ciphertext, not the plaintext operator stream that was
        // encrypted — no decrypt path composed for readDocument.
        const plain = te.encode('BT /F1 12 Tf (Encrypted) Tj ET');
        const contents = doc._raw.resolve({ type: 'ref', num: 4, gen: 0 });
        expect(contents.type).toBe('stream');
        expect(contents.raw).not.toEqual(plain);
    });

    test('unencrypted document reads unchanged (no opts)', () => {
        const b = buildDocument({ pages: ['x'] });
        const doc = readDocument(b);
        expect(doc.trailer.encrypt).toBeUndefined();
        expect(doc.pages.length).toBe(1);
    });

    test('unencrypted document reads unchanged with opts omitted vs {}', () => {
        const b = buildDocument({ pages: ['x'] });
        const withoutOpts = readDocument(b);
        const withEmptyOpts = readDocument(b, {});
        expect(withoutOpts.trailer.size).toBe(withEmptyOpts.trailer.size);
        expect(withoutOpts.pages.length).toBe(withEmptyOpts.pages.length);
    });
});

describe('pdfDocument module', () => {
    test('module shape', () => {
        expect(pdfDocument.name).toBe('pdfDocument');
        expect(pdfDocument.dependencies).toEqual(['pdfErrors', 'pdfTokenizer', 'pdfParser', 'pdfXref', 'pdfTrailer', 'pdfCatalog', 'pdfPage', 'pdfPages', 'pdfCrossRefStream', 'pdfObjStream', 'pdfFilterDispatch']);
        expect(pdfDocument.factory.toString()).toContain('function');
        const m = pdfDocument.factory(_pdfErrors_TD1, {}, {}, {}, {}, {}, {}, {});
        expect(typeof m.readDocument).toBe('function');
        expect(typeof m.readHeader).toBe('function');
    });
});
