// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { mathAdvanced } from './math-advanced.js';

const xml = ooxmlXml.factory();
const m = mathAdvanced.factory(xml);

describe('extra/math-advanced — eqArr', () => {
    test('roundtrip with full eqArrPr', () => {
        const arr = {
            pr: { maxDist: '1', objDist: '0', rSp: '0', rSpRule: '4', baseJc: 'center',
                  ctrlPr: { rPr: xml.el('w:rPr', {}) } },
            rows: [xml.el('m:e', {}), xml.el('m:e', {})]
        };
        const back = m.parseEqArr(m.renderEqArr(arr));
        expect(back.pr.maxDist).toBe('1');
        expect(back.pr.baseJc).toBe('center');
        expect(back.rows.length).toBe(2);
    });
});

describe('extra/math-advanced — groupChr', () => {
    test('roundtrip', () => {
        const g = { pr: { chr: '⏞', pos: 'top', vertJc: 'bot' }, e: xml.el('m:e', {}) };
        const back = m.parseGroupChr(m.renderGroupChr(g));
        expect(back.pr.chr).toBe('⏞');
        expect(back.pr.pos).toBe('top');
        expect(back.pr.vertJc).toBe('bot');
    });
});

describe('extra/math-advanced — limLow / limUpp', () => {
    test('limLow roundtrip', () => {
        const back = m.parseLimLow(m.renderLimLow({ pr: { ctrlPr: {} } }));
        expect(back.pr).toBeTruthy();
        expect(back.e).toBeTruthy();
        expect(back.lim).toBeTruthy();
    });
    test('limUpp roundtrip', () => {
        const back = m.parseLimUpp(m.renderLimUpp({}));
        expect(back.e).toBeTruthy();
        expect(back.lim).toBeTruthy();
    });
});

describe('extra/math-advanced — phant', () => {
    test('roundtrip', () => {
        const p = { pr: { show: '0', zeroAsc: '1', zeroDesc: '0', zeroWid: '1', transp: '1' } };
        const back = m.parsePhant(m.renderPhant(p));
        expect(back.pr.show).toBe('0');
        expect(back.pr.zeroAsc).toBe('1');
        expect(back.pr.transp).toBe('1');
    });
});

describe('extra/math-advanced — borderBox', () => {
    test('roundtrip with strikes & hides', () => {
        const b = { pr: { hideTop: '1', hideBot: '0', hideLeft: '1', hideRight: '0',
                          strikeBLTR: '1', strikeTLBR: '0', strikeH: '1', strikeV: '0' } };
        const back = m.parseBorderBox(m.renderBorderBox(b));
        expect(back.pr.hideTop).toBe('1');
        expect(back.pr.strikeBLTR).toBe('1');
        expect(back.pr.strikeH).toBe('1');
    });
});

describe('extra/math-advanced — box', () => {
    test('roundtrip', () => {
        const b = { pr: { opEmu: '1', noBreak: '0', diff: '1', aln: '1' } };
        const back = m.parseBox(m.renderBox(b));
        expect(back.pr.opEmu).toBe('1');
        expect(back.pr.diff).toBe('1');
        expect(back.pr.aln).toBe('1');
    });
});

describe('extra/math-advanced — mathPr (extended)', () => {
    test('all keys roundtrip', () => {
        const mp = { brkBin: 'before', brkBinSub: '--', defJc: 'centerGroup',
                     dispDef: '1', intLim: 'subSup', mathFont: 'Cambria Math',
                     naryLim: 'undOvr', lMargin: '0', rMargin: '0',
                     preSp: '144', postSp: '144', interSp: '36', intraSp: '0',
                     smallFrac: '0', wrapIndent: '1440', wrapRight: '0' };
        const back = m.parseMathPr(m.renderMathPr(mp));
        expect(back).toEqual(mp);
    });
});

describe('extra/math-advanced — oMathParaPr', () => {
    test('jc roundtrip', () => {
        const back = m.parseOMathParaPr(m.renderOMathParaPr({ jc: 'left' }));
        expect(back.jc).toBe('left');
    });
});

describe('extra/math-advanced — argPr / ctrlPr', () => {
    test('argPr', () => {
        const back = m.parseArgPr(m.renderArgPr({ argSz: '-1' }));
        expect(back.argSz).toBe('-1');
    });
});

describe('extra/math-advanced — matrix mPr/mcs', () => {
    test('mPr with mcs roundtrip', () => {
        const mp = {
            baseJc: 'center', plcHide: '0', rSpRule: '4', cGpRule: '4',
            rSp: '0', cSp: '0', cGp: '0',
            mcs: { mcs: [{ pr: { count: '2', mcJc: 'center' } }] }
        };
        const back = m.parseMPr(m.renderMPr(mp));
        expect(back.baseJc).toBe('center');
        expect(back.mcs.mcs.length).toBe(1);
        expect(back.mcs.mcs[0].pr.count).toBe('2');
    });
});

describe('extra/math-advanced — val helpers', () => {
    test('aln/alnScr/lit/nor/scr/show/shp/subHide/supHide/transp/intLim', () => {
        for (const fn of ['Aln','AlnScr','Lit','Nor','Scr','Show','Shp','SubHide','SupHide','Transp']) {
            const p = m['parse' + fn];
            const r = m['render' + fn];
            expect(p(r({ val: '1' })).val).toBe('1');
        }
        expect(m.parseIntLim(m.renderIntLim({ val: 'subSup' })).val).toBe('subSup');
    });
});

describe('extra/math-advanced — dispatcher', () => {
    test('parseMathElement', () => {
        const e = m.parseMathElement(xml.el('m:eqArr', {}));
        expect(e.kind).toBe('eqArr');
    });
});
