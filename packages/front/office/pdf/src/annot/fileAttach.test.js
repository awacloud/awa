// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfFileAttachAnnot } from './fileAttach.js';
import { pdfAnnot } from './annot.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const _errors = _pdfErrors_TD1;
const _parserObj = pdfParserObj.factory();
const _annot = pdfAnnot.factory(_errors, _parserObj);
const { typeFileAttachAnnot } = pdfFileAttachAnnot.factory(_errors, _parserObj, _annot);
const { obj } = _parserObj;
const { ParseError } = _errors;

describe('typeFileAttachAnnot', () => {
    test('minimal', () => {
        const d = obj.dict({ Subtype: obj.name('FileAttachment') });
        const a = typeFileAttachAnnot(d);
        expect(a.subtype).toBe('FileAttachment');
        expect(a.fs).toBeNull();
        expect(a.iconName).toBeNull();
    });

    test('with FS dict and icon', () => {
        const d = obj.dict({
            Subtype: obj.name('FileAttachment'),
            FS: obj.dict({ Type: obj.name('Filespec') }),
            Name: obj.name('Paperclip')
        });
        const a = typeFileAttachAnnot(d);
        expect(a.fs.type).toBe('dict');
        expect(a.iconName).toBe('Paperclip');
    });

    test('with FS as indirect ref', () => {
        const d = obj.dict({
            Subtype: obj.name('FileAttachment'),
            FS: obj.ref(9, 0)
        });
        expect(typeFileAttachAnnot(d).fs.type).toBe('ref');
    });

    test('preserves _extras', () => {
        const d = obj.dict({ Subtype: obj.name('FileAttachment'), Foo: obj.int(1) });
        expect(typeFileAttachAnnot(d)._extras.Foo.value).toBe(1);
    });

    test('rejects bad FS type', () => {
        const d = obj.dict({ Subtype: obj.name('FileAttachment'),
            FS: obj.int(0) });
        expect(() => typeFileAttachAnnot(d)).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const d = obj.dict({ Subtype: obj.name('Text') });
        expect(() => typeFileAttachAnnot(d)).toThrow(ParseError);
    });
});

describe('pdfFileAttachAnnot module', () => {
    test('shape', () => {
        expect(pdfFileAttachAnnot.name).toBe('pdfFileAttachAnnot');
        expect(pdfFileAttachAnnot.dependencies).toEqual(['pdfErrors', 'pdfParser', 'pdfAnnot']);
        expect(pdfFileAttachAnnot.factory.toString()).toContain('function');
        expect(typeof pdfFileAttachAnnot.factory(_pdfErrors_TD1, {}, {}).typeFileAttachAnnot).toBe('function');
    });
});
