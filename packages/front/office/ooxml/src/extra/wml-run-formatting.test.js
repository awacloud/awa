// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';
import { wmlRunFormatting } from './wml-run-formatting.js';

const xml = ooxmlXml.factory();
const core = docxProperties.factory(xml);
const ext = wmlRunFormatting.factory(xml, core);

describe('extra/wml-run-formatting — toggles', () => {
    test('promotes caps/smallCaps/vanish from _extras', () => {
        const src = '<w:rPr xmlns:w="x"><w:b/><w:caps/><w:smallCaps w:val="0"/><w:vanish/></w:rPr>';
        const r = ext.parseRunProperties(xml.parse(src));
        expect(r.bold).toBe(true);
        expect(r.caps).toBe(true);
        expect(r.smallCaps).toBe(false);
        expect(r.vanish).toBe(true);
        expect(r._extras).toBeUndefined();
    });

    test('roundtrip: caps + kern + position + lang', () => {
        const rPr = {
            bold: true, caps: true, kern: 22, position: '4',
            lang: { val: 'fr-FR', eastAsia: 'ja-JP' }
        };
        const el = ext.renderRunProperties(rPr);
        const parsed = ext.parseRunProperties(el);
        expect(parsed.bold).toBe(true);
        expect(parsed.caps).toBe(true);
        expect(parsed.kern).toBe(22);
        expect(parsed.position).toBe('4');
        expect(parsed.lang).toEqual({ val: 'fr-FR', eastAsia: 'ja-JP' });
    });
});

describe('extra/wml-run-formatting — shd / fitText / eastAsianLayout', () => {
    test('shd typed fields', () => {
        const rPr = { shd: { pattern: 'clear', color: 'auto', fill: 'FFFF00' } };
        const el = ext.renderRunProperties(rPr);
        const back = ext.parseRunProperties(el);
        expect(back.shd).toEqual(rPr.shd);
    });

    test('fitText with id + val', () => {
        const rPr = { fitText: { val: 1440, id: 5 } };
        const el = ext.renderRunProperties(rPr);
        const back = ext.parseRunProperties(el);
        expect(back.fitText).toEqual(rPr.fitText);
    });

    test('eastAsianLayout', () => {
        const rPr = { eastAsianLayout: { id: '1', vert: 'true', combine: 'lettersOnly' } };
        const el = ext.renderRunProperties(rPr);
        const back = ext.parseRunProperties(el);
        expect(back.eastAsianLayout).toEqual(rPr.eastAsianLayout);
    });

    test('stylisticSets list', () => {
        const rPr = { stylisticSets: [1, 4, 7] };
        const el = ext.renderRunProperties(rPr);
        const back = ext.parseRunProperties(el);
        expect(back.stylisticSets).toEqual([1, 4, 7]);
    });
});

describe('extra/wml-run-formatting — phase 1 toggles full set', () => {
    test('outline/emboss/imprint/shadow/noProof', () => {
        const rPr = { outline: true, emboss: true, imprint: false, shadow: true, noProof: true };
        const back = ext.parseRunProperties(ext.renderRunProperties(rPr));
        expect(back.outline).toBe(true);
        expect(back.emboss).toBe(true);
        expect(back.imprint).toBe(false);
        expect(back.shadow).toBe(true);
        expect(back.noProof).toBe(true);
    });

    test('cs/bCs/iCs complex-script flags', () => {
        const rPr = { cs: true, bCs: true, iCs: true };
        const back = ext.parseRunProperties(ext.renderRunProperties(rPr));
        expect(back.cs).toBe(true);
        expect(back.bCs).toBe(true);
        expect(back.iCs).toBe(true);
    });

    test('dstrike/oMath/cntxtAlts/webHidden/snapToGrid', () => {
        const rPr = { dstrike: true, oMath: true, cntxtAlts: true, webHidden: true, snapToGrid: false };
        const back = ext.parseRunProperties(ext.renderRunProperties(rPr));
        expect(back.dstrike).toBe(true);
        expect(back.oMath).toBe(true);
        expect(back.cntxtAlts).toBe(true);
        expect(back.webHidden).toBe(true);
        expect(back.snapToGrid).toBe(false);
    });
});

describe('extra/wml-run-formatting — phase 1 val-bearing full set', () => {
    test('szCs / scale (w) / em / effect', () => {
        const rPr = { szCs: 24, scale: 150, em: 'dot', effect: 'blinkBackground' };
        const back = ext.parseRunProperties(ext.renderRunProperties(rPr));
        expect(back.szCs).toBe(24);
        expect(back.scale).toBe(150);
        expect(back.em).toBe('dot');
        expect(back.effect).toBe('blinkBackground');
    });

    test('ligatures / numForm / numSpacing', () => {
        const rPr = { ligatures: 'standardContextual', numForm: 'oldStyle', numSpacing: 'tabular' };
        const back = ext.parseRunProperties(ext.renderRunProperties(rPr));
        expect(back.ligatures).toBe('standardContextual');
        expect(back.numForm).toBe('oldStyle');
        expect(back.numSpacing).toBe('tabular');
    });

    test('lang with bidi', () => {
        const rPr = { lang: { val: 'en-US', eastAsia: 'zh-CN', bidi: 'ar-SA' } };
        const back = ext.parseRunProperties(ext.renderRunProperties(rPr));
        expect(back.lang).toEqual(rPr.lang);
    });
});

describe('extra/wml-run-formatting — backward compat', () => {
    test('still preserves truly unknown extras', () => {
        const src = '<w:rPr xmlns:w="x"><w:caps/><w:zzUnknown w:val="x"/></w:rPr>';
        const r = ext.parseRunProperties(xml.parse(src));
        expect(r.caps).toBe(true);
        expect(r._extras).toHaveLength(1);
        expect(r._extras[0].name).toBe('w:zzUnknown');
    });

    test('document parsed with core stays parsable; extra hydrates', () => {
        const rPr = core.parseRunProperties(xml.parse(
            '<w:rPr xmlns:w="x"><w:b/><w:caps/></w:rPr>'
        ));
        // Core sees caps as extra:
        expect(rPr._extras).toHaveLength(1);
        // Extra promotes it:
        ext.hydrate(rPr);
        expect(rPr.caps).toBe(true);
        expect(rPr._extras).toBeUndefined();
    });

    test('paragraph properties wrap inline rPr', () => {
        const pPr = {
            align: 'center',
            rPr: { bold: true, caps: true, kern: 24 }
        };
        const el = ext.renderParagraphProperties(pPr);
        const back = ext.parseParagraphProperties(el);
        expect(back.align).toBe('center');
        expect(back.rPr.bold).toBe(true);
        expect(back.rPr.caps).toBe(true);
        expect(back.rPr.kern).toBe(24);
    });
});
