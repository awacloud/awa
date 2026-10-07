// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { pmlTransitions } from './pml-transitions.js';

const xml = ooxmlXml.factory();
const ext = pmlTransitions.factory(xml);

describe('extra/pml-transitions', () => {
    test('roundtrip fade', () => {
        const t = { attrs: { spd: 'med' }, effect: { kind: 'fade', attrs: { thruBlk: '1' } } };
        const el = ext.renderTransition(t);
        const back = ext.parseTransition(el);
        expect(back.attrs.spd).toBe('med');
        expect(back.effect.kind).toBe('fade');
        expect(back.effect.attrs.thruBlk).toBe('1');
    });

    test('with sound', () => {
        const t = {
            attrs: {},
            effect: { kind: 'wipe', attrs: { dir: 'l' } },
            sndAc: { startSound: { 'r:embed': 'rId1', name: 'snap' }, endSound: true }
        };
        const el = ext.renderTransition(t);
        const back = ext.parseTransition(el);
        expect(back.sndAc.startSound['r:embed']).toBe('rId1');
        expect(back.sndAc.endSound).toBe(true);
    });

    test('roundtrips every effect kind with its specific attrs', () => {
        const cases = [
            { kind: 'cut',       attrs: {} },
            { kind: 'fade',      attrs: { thruBlk: '1' } },
            { kind: 'wipe',      attrs: { dir: 'l' } },
            { kind: 'push',      attrs: { dir: 'u' } },
            { kind: 'split',     attrs: { orient: 'horz', dir: 'in' } },
            { kind: 'dissolve',  attrs: {} },
            { kind: 'pull',      attrs: { dir: 'r' } },
            { kind: 'wedge',     attrs: {} },
            { kind: 'wheel',     attrs: { spokes: '4' } },
            { kind: 'cover',     attrs: { dir: 'd' } },
            { kind: 'uncover',   attrs: { dir: 'u' } },
            { kind: 'zoom',      attrs: { dir: 'in' } },
            { kind: 'randomBar', attrs: { dir: 'horz' } },
            { kind: 'comb',      attrs: { dir: 'horz' } },
            { kind: 'flash',     attrs: {} },
            { kind: 'circle',    attrs: {} },
            { kind: 'diamond',   attrs: {} },
            { kind: 'plus',      attrs: {} },
            { kind: 'newsflash', attrs: {} },
            { kind: 'random',    attrs: {} },
            { kind: 'blinds',    attrs: { dir: 'horz' } },
            { kind: 'checker',   attrs: { dir: 'horz' } },
            { kind: 'strips',    attrs: { dir: 'ld' } }
        ];
        for (const eff of cases) {
            const el = ext.renderTransition({ attrs: { spd: 'fast' }, effect: eff });
            const back = ext.parseTransition(el);
            expect(back.effect.kind).toBe(eff.kind);
            expect(back.effect.attrs).toEqual(eff.attrs);
        }
    });
});
