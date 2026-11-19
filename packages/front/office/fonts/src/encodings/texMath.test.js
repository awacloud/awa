// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { encodingTexMath } from './texMath.js';

const { OMS, OML, OMX, text } = encodingTexMath.factory();

describe('encodingTexMath', () => {
    test('module metadata', () => {
        expect(encodingTexMath.name).toBe('encodingTexMath');
        expect(encodingTexMath.dependencies).toEqual([]);
    });

    test('three frozen layouts of 128 positions', () => {
        for (const t of [OMS, OML, OMX]) {
            expect(t.length).toBe(128);
            expect(Object.isFrozen(t)).toBe(true);
        }
    });

    test('cmsy (OMS): positions the corpus attests', () => {
        expect(OMS[0x00]).toBe('−');
        expect(OMS[0x01]).toBe('·');
        expect(OMS[0x02]).toBe('×');
        expect(OMS[0x06]).toBe('±');
        expect(OMS[0x18]).toBe('∼');
        expect(OMS[0x21]).toBe('→');
        expect(OMS[0x31]).toBe('∞');
        expect(OMS[0x5B]).toBe('∪');
        expect(OMS[0x6A]).toBe('|');
        expect(OMS[0x41]).toBe('A');
    });

    test('cmmi (OML): positions the corpus attests', () => {
        expect(OML[0x0B]).toBe('α');
        expect(OML[0x0F]).toBe('ϵ');
        expect(OML[0x22]).toBe('ε');
        expect(OML[0x3A]).toBe('.');
        expect(OML[0x3B]).toBe(',');
        expect(OML[0x3D]).toBe('/');
        expect(OML[0x40]).toBe('∂');
        expect(OML[0x60]).toBe('ℓ');
        expect(OML[0x78]).toBe('x');
    });

    test('cmex (OMX): positions the corpus attests', () => {
        expect(OMX[0x00]).toBe('(');
        expect(OMX[0x03]).toBe(']');
        expect(OMX[0x12]).toBe('(');
        expect(OMX[0x50]).toBe('∑');
        expect(OMX[0x58]).toBe('∑');
        expect(OMX[0x5A]).toBe('∫');
        expect(OMX[0x70]).toBe('√');
    });

    test('a position with no character of its own is null', () => {
        expect(OMX[0x30]).toBeNull(); // parenlefttp, an assembly piece
        expect(OMX[0x3E]).toBeNull(); // braceex
        expect(OMX[0x7A]).toBeNull(); // a brace tip
        expect(OMS[0x36]).toBeNull(); // negationslash, an overlay
        expect(OML[0x7E]).toBeNull(); // the vector accent
    });

    test('text(layout, code): the layout\'s text, null past it or for an unknown layout', () => {
        expect(text('OMS', 0)).toBe('−');
        expect(text('OMX', 0)).toBe('(');
        expect(text('OML', 0x3D)).toBe('/');
        expect(text('OMS', 128)).toBeNull();
        expect(text('OMS', -1)).toBeNull();
        expect(text('OT1', 0)).toBeNull();
    });
});
