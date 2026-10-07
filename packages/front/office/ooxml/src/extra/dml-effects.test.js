// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlEffects } from './dml-effects.js';
import { ooxmlShared } from '../_shared/index.js';

const xml = ooxmlXml.factory();
const _shared = ooxmlShared.factory();
const m = dmlEffects.factory(xml, _shared);

describe('extra/dml-effects — effectLst', () => {
    test('outerShdw with srgbClr', () => {
        const e = { effects: [{
            kind: 'outerShdw',
            attrs: { blurRad: '40000', dist: '20000', dir: '5400000',
                     sx: '100000', sy: '100000', kx: '0', ky: '0',
                     algn: 'b', rotWithShape: '0' },
            color: { kind: 'srgbClr', attrs: { val: '000000' }, mods: [{ kind: 'alphaMod', attrs: { val: '50000' } }] }
        }]};
        const back = m.parseEffectLst(m.renderEffectLst(e));
        expect(back.effects.length).toBe(1);
        expect(back.effects[0].kind).toBe('outerShdw');
        expect(back.effects[0].attrs.blurRad).toBe('40000');
        expect(back.effects[0].color.kind).toBe('srgbClr');
        expect(back.effects[0].color.mods.length).toBe(1);
    });

    test('innerShdw + glow + reflection + softEdge + blur', () => {
        const e = { effects: [
            { kind: 'innerShdw', attrs: { blurRad: '1' }, color: { kind: 'schemeClr', attrs: { val: 'accent1' } } },
            { kind: 'glow',      attrs: { rad: '5' }, color: { kind: 'srgbClr', attrs: { val: 'FF0000' } } },
            { kind: 'reflection', attrs: { blurRad: '0', stA: '50000', endA: '300', stPos: '0', endPos: '50000', dist: '5000', dir: '5400000', sy: '-100000', algn: 'bl', rotWithShape: '0' } },
            { kind: 'softEdge',   attrs: { rad: '12700' } },
            { kind: 'blur',       attrs: { rad: '5', grow: '1' } },
            { kind: 'prstShdw',   attrs: { prst: 'shdw1', dist: '1', dir: '0' }, color: { kind: 'srgbClr', attrs: { val: '808080' } } }
        ]};
        const back = m.parseEffectLst(m.renderEffectLst(e));
        const kinds = back.effects.map(x => x.kind).sort();
        expect(kinds).toEqual(['blur','glow','innerShdw','prstShdw','reflection','softEdge']);
    });

    test('fillOverlay roundtrip', () => {
        const e = { effects: [{
            kind: 'fillOverlay', attrs: { blend: 'over' },
            fills: [xml.el('a:solidFill', {}, [xml.el('a:srgbClr', { val: 'FF00FF' })])]
        }]};
        const back = m.parseEffectLst(m.renderEffectLst(e));
        expect(back.effects[0].kind).toBe('fillOverlay');
        expect(back.effects[0].attrs.blend).toBe('over');
    });
});

describe('extra/dml-effects — effectDag', () => {
    test('roundtrip', () => {
        const e = { attrs: {}, effects: [
            { kind: 'glow', attrs: { rad: '1' }, color: { kind: 'srgbClr', attrs: { val: '00FF00' } } }
        ]};
        const back = m.parseEffectDag(m.renderEffectDag(e));
        expect(back.effects.length).toBe(1);
    });
});

describe('extra/dml-effects — color transforms', () => {
    test('lum / tint / shade / grayscl', () => {
        for (const c of [
            { kind: 'lum', attrs: { bright: '0', contrast: '0' } },
            { kind: 'tint', attrs: { hue: '0', amt: '50000' } },
            { kind: 'shade', attrs: { amt: '30000' } },
            { kind: 'grayscl', attrs: {} }
        ]) {
            const back = m.parseColorMod(m.renderColorMod(c));
            expect(back.kind).toBe(c.kind);
        }
    });
    test('alpha set', () => {
        for (const c of [
            { kind: 'alphaMod', attrs: { amt: '50000' } },
            { kind: 'alphaModFix', attrs: { amt: '50000' } },
            { kind: 'alphaCeiling' },
            { kind: 'alphaFloor' },
            { kind: 'alphaRepl', attrs: { a: '100000' } },
            { kind: 'biLevel', attrs: { thresh: '50000' } }
        ]) {
            const back = m.parseColorMod(m.renderColorMod(c));
            expect(back.kind).toBe(c.kind);
        }
    });
    test('duotone with two colors', () => {
        const c = { kind: 'duotone', colors: [
            { kind: 'srgbClr', attrs: { val: 'FF0000' } },
            { kind: 'srgbClr', attrs: { val: '0000FF' } }
        ]};
        const back = m.parseColorMod(m.renderColorMod(c));
        expect(back.colors.length).toBe(2);
    });
    test('clrChange clrFrom→clrTo', () => {
        const c = { kind: 'clrChange', attrs: { useA: '1' },
            clrFrom: { kind: 'srgbClr', attrs: { val: '000000' } },
            clrTo:   { kind: 'srgbClr', attrs: { val: 'FFFFFF' } } };
        const back = m.parseColorMod(m.renderColorMod(c));
        expect(back.clrFrom.attrs.val).toBe('000000');
        expect(back.clrTo.attrs.val).toBe('FFFFFF');
    });
    test('clrRepl roundtrip', () => {
        const c = { kind: 'clrRepl', color: { kind: 'srgbClr', attrs: { val: 'FF0000' } } };
        const back = m.parseColorMod(m.renderColorMod(c));
        expect(back.color.attrs.val).toBe('FF0000');
    });
});

describe('extra/dml-effects — xfrm', () => {
    test('attrs roundtrip', () => {
        const x = { attrs: { rot: '5400000', flipH: '1', flipV: '0' } };
        const back = m.parseXfrm(m.renderXfrm(x));
        expect(back.attrs.rot).toBe('5400000');
        expect(back.attrs.flipH).toBe('1');
    });
});
