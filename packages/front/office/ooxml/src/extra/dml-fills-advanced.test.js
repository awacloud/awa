// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlFillsAdvanced } from './dml-fills-advanced.js';
import { ooxmlShared } from '../_shared/index.js';

const xml = ooxmlXml.factory();
const _shared = ooxmlShared.factory();
const m = dmlFillsAdvanced.factory(xml, _shared);

describe('extra/dml-fills-advanced — gradFill', () => {
    test('linear with srgb stops', () => {
        const g = {
            attrs: { rotWithShape: '1', flip: 'none' },
            stops: [
                { pos: '0',      color: { kind: 'srgbClr',   attrs: { val: 'FF0000' } } },
                { pos: '50000',  color: { kind: 'schemeClr', attrs: { val: 'accent1' } } },
                { pos: '100000', color: { kind: 'srgbClr',   attrs: { val: '0000FF' } } }
            ],
            lin: { ang: '5400000', scaled: '0' },
            tileRect: { l: '0', t: '0', r: '0', b: '0' }
        };
        const back = m.parseGradFill(m.renderGradFill(g));
        expect(back.stops.length).toBe(3);
        expect(back.stops[1].color.kind).toBe('schemeClr');
        expect(back.lin.ang).toBe('5400000');
        expect(back.tileRect.l).toBe('0');
        expect(back.attrs.rotWithShape).toBe('1');
    });

    test('path gradient with fillToRect', () => {
        const g = { stops: [],
                    path: { attrs: { path: 'circle' }, fillToRect: { l: '50000', t: '50000', r: '50000', b: '50000' } } };
        const back = m.parseGradFill(m.renderGradFill(g));
        expect(back.path.attrs.path).toBe('circle');
        expect(back.path.fillToRect.l).toBe('50000');
    });
});

describe('extra/dml-fills-advanced — blipFill', () => {
    test('stretch with fillRect & srcRect', () => {
        const b = {
            attrs: { dpi: '96', rotWithShape: '1' },
            blip: { 'r:embed': 'rId1', cstate: 'print' },
            srcRect: { l: '5', t: '5', r: '5', b: '5' },
            mode: 'stretch',
            fillRect: { l: '0', t: '0', r: '0', b: '0' }
        };
        const back = m.parseBlipFill(m.renderBlipFill(b));
        expect(back.blip['r:embed']).toBe('rId1');
        expect(back.blip.cstate).toBe('print');
        expect(back.srcRect.l).toBe('5');
        expect(back.mode).toBe('stretch');
        expect(back.fillRect.l).toBe('0');
        expect(back.attrs.dpi).toBe('96');
    });

    test('tile mode with attrs', () => {
        const b = {
            blip: { 'r:embed': 'rId2' },
            mode: 'tile',
            tile: { algn: 'ctr', flip: 'none', sx: '100000', sy: '100000', tx: '0', ty: '0' }
        };
        const back = m.parseBlipFill(m.renderBlipFill(b));
        expect(back.mode).toBe('tile');
        expect(back.tile.algn).toBe('ctr');
        expect(back.tile.sx).toBe('100000');
    });
});

describe('extra/dml-fills-advanced — pattFill', () => {
    test('roundtrip with fg/bg', () => {
        const p = { attrs: { prst: 'pct50' },
            fgClr: { kind: 'srgbClr', attrs: { val: '000000' } },
            bgClr: { kind: 'srgbClr', attrs: { val: 'FFFFFF' } } };
        const back = m.parsePattFill(m.renderPattFill(p));
        expect(back.attrs.prst).toBe('pct50');
        expect(back.fgClr.attrs.val).toBe('000000');
        expect(back.bgClr.attrs.val).toBe('FFFFFF');
    });
});

describe('extra/dml-fills-advanced — color zoo', () => {
    test('all color kinds', () => {
        for (const c of [
            { kind: 'srgbClr',   attrs: { val: 'FF0000' } },
            { kind: 'schemeClr', attrs: { val: 'bg1' } },
            { kind: 'prstClr',   attrs: { val: 'red' } },
            { kind: 'hslClr',    attrs: { hue: '0',  sat: '100', lum: '50' } },
            { kind: 'scrgbClr',  attrs: { r: '50', g: '50', b: '50' } },
            { kind: 'sysClr',    attrs: { val: 'windowText', lastClr: '000000' } }
        ]) {
            const back = m.parseColor(m.renderColor(c));
            expect(back.kind).toBe(c.kind);
        }
    });
});
