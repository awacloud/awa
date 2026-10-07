// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { wmlNumberingDetails } from './wml-numbering-details.js';

const xml = ooxmlXml.factory();
const ext = wmlNumberingDetails.factory(xml);

describe('extra/wml-numbering-details — lvl', () => {
    test('parse + render lvl with all fields', () => {
        const lvl = {
            attrs: { 'w:ilvl': '0', 'w:tplc': '040C0001' },
            start: '1',
            numFmt: 'decimal',
            lvlText: '%1.',
            lvlJc: 'left',
            nfc: '0',
            suff: 'tab',
            lvlPicBulletId: '1',
            lvlRestart: '0',
            pStyle: 'ListNumber',
            isLgl: true,
            legacy: { 'w:legacy': '1', 'w:legacySpace': '0', 'w:legacyIndent': '720' }
        };
        const el = ext.renderLvl(lvl);
        const back = ext.parseLvl(el);
        expect(back.start).toBe('1');
        expect(back.numFmt).toBe('decimal');
        expect(back.lvlText).toBe('%1.');
        expect(back.lvlJc).toBe('left');
        expect(back.nfc).toBe('0');
        expect(back.suff).toBe('tab');
        expect(back.lvlPicBulletId).toBe('1');
        expect(back.lvlRestart).toBe('0');
        expect(back.pStyle).toBe('ListNumber');
        expect(back.isLgl).toBe(true);
        expect(back.legacy).toEqual(lvl.legacy);
        expect(back.attrs['w:tplc']).toBe('040C0001');
    });
});

describe('extra/wml-numbering-details — abstractNum / num / lvlOverride', () => {
    test('roundtrip abstractNum', () => {
        const an = {
            attrs: { 'w:abstractNumId': '0' },
            nsid: 'ABCD1234',
            multiLevelType: 'hybridMultilevel',
            tmpl: 'F00FF00F',
            tplc: '040C0001',
            name: 'MyList',
            styleLink: 'Bullets',
            numStyleLink: 'BulletsLink',
            lvls: [{ attrs: { 'w:ilvl': '0' }, start: '1', numFmt: 'decimal' }]
        };
        const el = ext.renderAbstractNum(an);
        const back = ext.parseAbstractNum(el);
        expect(back.nsid).toBe('ABCD1234');
        expect(back.multiLevelType).toBe('hybridMultilevel');
        expect(back.tmpl).toBe('F00FF00F');
        expect(back.tplc).toBe('040C0001');
        expect(back.name).toBe('MyList');
        expect(back.styleLink).toBe('Bullets');
        expect(back.numStyleLink).toBe('BulletsLink');
        expect(back.lvls).toHaveLength(1);
        expect(back.lvls[0].numFmt).toBe('decimal');
    });

    test('roundtrip num + lvlOverride', () => {
        const n = {
            attrs: { 'w:numId': '5' },
            abstractNumId: '0',
            lvlOverrides: [{
                attrs: { 'w:ilvl': '0' },
                startOverride: '7',
                numStart: '7',
                numRestart: '1',
                lvl: { attrs: { 'w:ilvl': '0' }, start: '7', numFmt: 'decimal' }
            }]
        };
        const el = ext.renderNum(n);
        const back = ext.parseNum(el);
        expect(back.abstractNumId).toBe('0');
        expect(back.lvlOverrides[0].startOverride).toBe('7');
        expect(back.lvlOverrides[0].numStart).toBe('7');
        expect(back.lvlOverrides[0].numRestart).toBe('1');
        expect(back.lvlOverrides[0].lvl.start).toBe('7');
    });

    test('numPicBullet preserves children', () => {
        const b = { attrs: { 'w:numPicBulletId': '0' }, children: [xml.el('w:pict', {})] };
        const el = ext.renderNumPicBullet(b);
        const back = ext.parseNumPicBullet(el);
        expect(back.children).toHaveLength(1);
    });
});
