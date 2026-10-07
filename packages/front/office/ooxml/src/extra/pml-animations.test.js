// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { pmlAnimations } from './pml-animations.js';

const xml = ooxmlXml.factory();
const ext = pmlAnimations.factory(xml);

describe('extra/pml-animations', () => {
    test('parses simple timing tree', () => {
        const text = `<p:timing xmlns:p="x">
          <p:tnLst>
            <p:par>
              <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
                <p:childTnLst>
                  <p:seq concurrent="1" nextAc="seek">
                    <p:cTn id="2" dur="indefinite" nodeType="mainSeq"/>
                  </p:seq>
                </p:childTnLst>
              </p:cTn>
            </p:par>
          </p:tnLst>
        </p:timing>`;
        const t = ext.parseTiming(xml.parse(text));
        expect(t.tnLst.length).toBe(1);
        expect(t.tnLst[0].kind).toBe('par');
        expect(t.tnLst[0].cTn.attrs.id).toBe('1');
        expect(t.tnLst[0].cTn.childTnLst.children.length).toBe(1);
        expect(t.tnLst[0].cTn.childTnLst.children[0].kind).toBe('seq');
    });

    test('roundtrips deep cTn (stCondLst/endCondLst/iterate)', () => {
        const timing = {
            kind: 'timing',
            tnLst: [{
                kind: 'par',
                attrs: {},
                cTn: {
                    kind: 'cTn',
                    attrs: { id: '1', dur: '5000', presetID: '1', presetClass: 'entr',
                             nodeType: 'tmRoot', fill: 'hold', restart: 'never',
                             accel: '50000', decel: '50000', autoRev: '1',
                             repeatCount: 'indefinite', repeatDur: '10000',
                             grpId: '0', afterEffect: '0', displayClr: '1',
                             evtFilter: 'cancelBubble', syncBehavior: 'canSlip',
                             masterRel: 'sameClick', bldLvl: '1', presetSubtype: '0' },
                    stCondLst: { kind: 'stCondLst', conds: [
                        { kind: 'cond', attrs: { delay: '0', evt: 'onClick' },
                          tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '4' },
                                                          txEl: { kind: 'txEl', charRg: { st: '0', end: '5' } } } },
                          tn: { val: '1' } }
                    ] },
                    endCondLst: { kind: 'endCondLst', conds: [
                        { kind: 'cond', attrs: { evt: 'end' } }
                    ] },
                    iterate: { kind: 'iterate', attrs: { type: 'el', backwards: '0' },
                               tmPct: { val: '50000' } },
                    endSync: { attrs: { evt: 'end' } },
                    childTnLst: { kind: 'childTnLst', children: [
                        { kind: 'anim', attrs: { calcmode: 'lin' },
                          cBhvr: { kind: 'cBhvr', attrs: { additive: 'base' },
                                   cTn: { kind: 'cTn', attrs: { id: '2', dur: '500' } },
                                   tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '4' } } },
                                   attrNameLst: { kind: 'attrNameLst', names: ['style.opacity'] } },
                          tavLst: { kind: 'tavLst', tavs: [
                              { kind: 'tav', attrs: { tm: '0' },
                                val: { kind: 'val', clrVal: { kind: 'clrVal', rgb: { val: 'FF0000' } } } },
                              { kind: 'tav', attrs: { tm: '100000' },
                                val: { kind: 'val', strVal: { val: '#0' } } }
                          ] } },
                        { kind: 'animClr', attrs: { clrSpc: 'rgb' },
                          cBhvr: { kind: 'cBhvr', cTn: { kind: 'cTn', attrs: { id: '3' } },
                                   tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '5' } } } },
                          from: { kind: 'from', clrVal: { kind: 'clrVal', hsl: { h: '0', s: '0', l: '0' } } },
                          to:   { kind: 'to',   clrVal: { kind: 'clrVal', rgb: { val: '00FF00' } } },
                          by:   { kind: 'by',   intVal: { val: '10' } } },
                        { kind: 'animEffect', attrs: { transition: 'in', filter: 'fade' },
                          cBhvr: { kind: 'cBhvr', cTn: { kind: 'cTn', attrs: { id: '4' } },
                                   tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '6' } } } },
                          progress: { kind: 'progress', fltVal: { val: '0.5' } } },
                        { kind: 'animMotion', attrs: { path: 'M 0 0 L 1 1', origin: 'layout' },
                          cBhvr: { kind: 'cBhvr', cTn: { kind: 'cTn', attrs: { id: '5' } },
                                   tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '7' } } } } },
                        { kind: 'animRot', attrs: { by: '21600000' },
                          cBhvr: { kind: 'cBhvr', cTn: { kind: 'cTn', attrs: { id: '6' } },
                                   tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '8' } } } } },
                        { kind: 'animScale', attrs: { zoomContents: '1' },
                          cBhvr: { kind: 'cBhvr', cTn: { kind: 'cTn', attrs: { id: '7' } },
                                   tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '9' } } } } },
                        { kind: 'audio',
                          cMediaNode: { kind: 'cMediaNode', attrs: { mute: '0' },
                                        cTn: { kind: 'cTn', attrs: { id: '8' } },
                                        tgtEl: { kind: 'tgtEl', sndTgt: { 'r:embed': 'rId1' } } } },
                        { kind: 'video',
                          cMediaNode: { kind: 'cMediaNode',
                                        cTn: { kind: 'cTn', attrs: { id: '9' } },
                                        tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '10' } } } },
                          videoClr: { val: 'FFFFFF' } },
                        { kind: 'cmd', attrs: { type: 'evt', cmd: 'play' },
                          cBhvr: { kind: 'cBhvr', cTn: { kind: 'cTn', attrs: { id: '10' } },
                                   tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '11' } } } } },
                        { kind: 'set',
                          cBhvr: { kind: 'cBhvr', cTn: { kind: 'cTn', attrs: { id: '11' } },
                                   tgtEl: { kind: 'tgtEl', spTgt: { kind: 'spTgt', attrs: { spid: '12' } } } },
                          to: { kind: 'to', boolVal: { val: '1' } } },
                        { kind: 'excl',
                          cTn: { kind: 'cTn', attrs: { id: '12' },
                                 subTnLst: { kind: 'subTnLst', children: [
                                     { kind: 'par', attrs: {}, cTn: { kind: 'cTn', attrs: { id: '13' } } }
                                 ] } } }
                    ] }
                }
            }],
            bldLst: [
                { kind: 'bldP',        attrs: { spid: '4', grpId: '0', uiExpand: '1', build: 'p' } },
                { kind: 'bldDgm',      attrs: { spid: '5', grpId: '0', bld: 'one' } },
                { kind: 'bldGraphic',  attrs: { spid: '6', grpId: '0' } },
                { kind: 'bldOleChart', attrs: { spid: '7', grpId: '0', bld: 'allAtOnce' } },
                { kind: 'bldSub',      attrs: { chart: 'category' } }
            ]
        };
        const el = ext.renderTiming(timing);
        expect(el.name).toBe('p:timing');
        const back = ext.parseTiming(el);
        expect(back.tnLst[0].cTn.attrs.id).toBe('1');
        expect(back.tnLst[0].cTn.stCondLst.conds[0].tgtEl.spTgt.attrs.spid).toBe('4');
        expect(back.tnLst[0].cTn.stCondLst.conds[0].tgtEl.spTgt.txEl.charRg.st).toBe('0');
        expect(back.tnLst[0].cTn.iterate.attrs.type).toBe('el');
        expect(back.tnLst[0].cTn.iterate.tmPct.val).toBe('50000');
        const kids = back.tnLst[0].cTn.childTnLst.children;
        expect(kids.map(k => k.kind)).toEqual([
            'anim', 'animClr', 'animEffect', 'animMotion',
            'animRot', 'animScale', 'audio', 'video', 'cmd', 'set', 'excl'
        ]);
        expect(kids[0].cBhvr.attrNameLst.names[0]).toBe('style.opacity');
        expect(kids[0].tavLst.tavs[0].val.clrVal.rgb.val).toBe('FF0000');
        expect(kids[1].from.clrVal.hsl.h).toBe('0');
        expect(kids[1].to.clrVal.rgb.val).toBe('00FF00');
        expect(kids[1].by.intVal.val).toBe('10');
        expect(kids[2].progress.fltVal.val).toBe('0.5');
        expect(kids[6].cMediaNode.tgtEl.sndTgt['r:embed']).toBe('rId1');
        expect(kids[7].videoClr.val).toBe('FFFFFF');
        expect(kids[9].to.boolVal.val).toBe('1');
        expect(kids[10].cTn.subTnLst.children[0].kind).toBe('par');
        expect(back.bldLst.map(b => b.kind)).toEqual([
            'bldP', 'bldDgm', 'bldGraphic', 'bldOleChart', 'bldSub'
        ]);
    });

    test('parses cBhvr attrNameLst and ignores unknown', () => {
        const text = `<p:cBhvr xmlns:p="x" additive="base" accumulate="none" by="0">
          <p:cTn id="1"/>
          <p:tgtEl><p:spTgt spid="3"/></p:tgtEl>
          <p:attrNameLst>
            <p:attrName>style.color</p:attrName>
            <p:attrName>style.opacity</p:attrName>
          </p:attrNameLst>
        </p:cBhvr>`;
        const b = ext.parseCBhvr(xml.parse(text));
        expect(b.attrs.additive).toBe('base');
        expect(b.attrNameLst.names).toEqual(['style.color', 'style.opacity']);
    });
});
