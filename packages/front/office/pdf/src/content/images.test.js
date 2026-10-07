// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfImages } from './images.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfErrors } from '../errors.js';

const _pdfErrors_TD1 = pdfErrors.factory();
const errMod = _pdfErrors_TD1;
const { ParseError } = errMod;
const parserObjMod = pdfParserObj.factory();
const { obj } = parserObjMod;
const { typeImageXObject, typeFormXObject, typeXObject } = pdfImages.factory(errMod, parserObjMod);

const te = new TextEncoder();

function imgStream(extra) {
    return obj.stream(
        obj.dict({
            Type:    obj.name('XObject'),
            Subtype: obj.name('Image'),
            Width:   obj.int(100),
            Height:  obj.int(50),
            BitsPerComponent: obj.int(8),
            ColorSpace: obj.name('DeviceRGB'),
            ...extra
        }),
        te.encode('binary-jpeg-bytes')
    );
}

function formStream(extra) {
    return obj.stream(
        obj.dict({
            Type:    obj.name('XObject'),
            Subtype: obj.name('Form'),
            BBox:    obj.array([obj.int(0), obj.int(0), obj.int(100), obj.int(100)]),
            ...extra
        }),
        te.encode('content')
    );
}

describe('typeImageXObject', () => {
    test('basic image', () => {
        const im = typeImageXObject(imgStream());
        expect(im.kind).toBe('image');
        expect(im.width).toBe(100);
        expect(im.height).toBe(50);
        expect(im.bitsPerComponent).toBe(8);
        expect(im.colorSpace.value).toBe('DeviceRGB');
    });

    test('image mask', () => {
        const im = typeImageXObject(imgStream({ ImageMask: obj.bool(true) }));
        expect(im.imageMask).toBe(true);
    });

    test('mask + sMask', () => {
        const im = typeImageXObject(imgStream({
            Mask:  obj.ref(20, 0),
            SMask: obj.ref(21, 0)
        }));
        expect(im.mask).toEqual({ type: 'ref', num: 20, gen: 0 });
        expect(im.sMask).toEqual({ type: 'ref', num: 21, gen: 0 });
    });

    test('rejects non-stream', () => {
        expect(() => typeImageXObject(obj.dict({}))).toThrow(ParseError);
    });

    test('rejects wrong subtype', () => {
        const s = obj.stream(obj.dict({ Subtype: obj.name('Form') }), new Uint8Array(0));
        expect(() => typeImageXObject(s)).toThrow(ParseError);
    });

    test('rejects missing Width', () => {
        const s = obj.stream(obj.dict({
            Subtype: obj.name('Image'),
            Height:  obj.int(10)
        }), new Uint8Array(0));
        expect(() => typeImageXObject(s)).toThrow(ParseError);
    });
});

describe('typeFormXObject', () => {
    test('basic form', () => {
        const f = typeFormXObject(formStream());
        expect(f.kind).toBe('form');
        expect(f.bbox).toEqual([0, 0, 100, 100]);
        expect(f.matrix).toEqual([1, 0, 0, 1, 0, 0]);
    });

    test('formType default + custom', () => {
        expect(typeFormXObject(formStream()).formType).toBe(1);
        expect(typeFormXObject(formStream({ FormType: obj.int(1) })).formType).toBe(1);
    });

    test('explicit Matrix + Resources', () => {
        const res = obj.dict({ Font: obj.dict({}) });
        const f = typeFormXObject(formStream({
            Matrix: obj.array([
                obj.int(2), obj.int(0), obj.int(0),
                obj.int(2), obj.int(0), obj.int(0)
            ]),
            Resources: res
        }));
        expect(f.matrix).toEqual([2, 0, 0, 2, 0, 0]);
        expect(f.resources).toBe(res);
    });

    test('rejects wrong subtype', () => {
        const s = obj.stream(obj.dict({ Subtype: obj.name('Image') }), new Uint8Array(0));
        expect(() => typeFormXObject(s)).toThrow(ParseError);
    });
});

describe('typeXObject — dispatch', () => {
    test('dispatches Image', () => {
        expect(typeXObject(imgStream()).kind).toBe('image');
    });

    test('dispatches Form', () => {
        expect(typeXObject(formStream()).kind).toBe('form');
    });

    test('unknown subtype passes through opaque', () => {
        const s = obj.stream(obj.dict({ Subtype: obj.name('PS') }), te.encode('ps'));
        const r = typeXObject(s);
        expect(r.kind).toBe('PS');
        expect(r.raw).toBeInstanceOf(Uint8Array);
    });

    test('rejects missing Subtype', () => {
        const s = obj.stream(obj.dict({}), new Uint8Array(0));
        expect(() => typeXObject(s)).toThrow(ParseError);
    });

    test('rejects bad Type', () => {
        const s = obj.stream(obj.dict({
            Type: obj.name('Catalog'),
            Subtype: obj.name('Image')
        }), new Uint8Array(0));
        expect(() => typeXObject(s)).toThrow(ParseError);
    });
});

describe('pdfImages module', () => {
    test('module shape', () => {
        expect(pdfImages.name).toBe('pdfImages');
        expect(pdfImages.dependencies).toEqual(['pdfErrors', 'pdfParser']);
        expect(pdfImages.factory.toString()).toContain('function');
        const m = pdfImages.factory(_pdfErrors_TD1, {});
        expect(typeof m.typeImageXObject).toBe('function');
        expect(typeof m.typeFormXObject).toBe('function');
        expect(typeof m.typeXObject).toBe('function');
    });
});
