// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlWpPositioning } from './dml-wp-positioning.js';

const xml = ooxmlXml.factory();
const ext = dmlWpPositioning.factory(xml);

describe('extra/dml-wp-positioning', () => {
    test('roundtrip anchor with positionH/V + extent + wrapSquare', () => {
        const a = {
            attrs: { distT: '0', distB: '0', distL: '114300', distR: '114300', behindDoc: '0',
                     locked: '0', layoutInCell: '1', allowOverlap: '1' },
            simplePosCoords: { x: '0', y: '0' },
            positionH: { relativeFrom: 'column', posOffset: 1234 },
            positionV: { relativeFrom: 'paragraph', align: 'top' },
            extent: { cx: '5000000', cy: '3000000' },
            effectExtent: { l: '0', t: '0', r: '0', b: '0' },
            wrap: { kind: 'wrapSquare', attrs: { wrapText: 'bothSides' } },
            docPr: { id: '1', name: 'Picture 1' }
        };
        const el = ext.renderAnchor(a);
        expect(el.name).toBe('wp:anchor');
        const back = ext.parseAnchor(el);
        expect(back.simplePosCoords).toEqual({ x: '0', y: '0' });
        expect(back.positionH.posOffset).toBe(1234);
        expect(back.positionV.align).toBe('top');
        expect(back.extent.cx).toBe('5000000');
        expect(back.wrap.kind).toBe('wrapSquare');
        expect(back.wrap.attrs.wrapText).toBe('bothSides');
    });

    test('wrapPolygon with start + lineTo points', () => {
        const a = {
            attrs: {},
            wrap: {
                kind: 'wrapTight',
                attrs: { wrapText: 'bothSides' },
                polygon: {
                    attrs: { edited: '0' },
                    points: [
                        { kind: 'start',  x: '0', y: '0' },
                        { kind: 'lineTo', x: '21600', y: '0' },
                        { kind: 'lineTo', x: '21600', y: '21600' }
                    ]
                }
            }
        };
        const el = ext.renderAnchor(a);
        const back = ext.parseAnchor(el);
        expect(back.wrap.polygon.points.length).toBe(3);
        expect(back.wrap.polygon.points[0].kind).toBe('start');
        expect(back.wrap.polygon.points[1].kind).toBe('lineTo');
    });

    test('all wrap kinds roundtrip (wrapNone/Square/Tight/Through/TopAndBottom)',
    () => {
        for (const kind of ['wrapNone', 'wrapSquare', 'wrapTight',
                            'wrapThrough', 'wrapTopAndBottom']) {
            const a = { attrs: {}, wrap: { kind, attrs: {} } };
            const el = ext.renderAnchor(a);
            const back = ext.parseAnchor(el);
            expect(back.wrap.kind).toBe(kind);
        }
    });

    test('inline element roundtrip', () => {
        const a = {
            attrs: { distT: '0' },
            extent: { cx: '100', cy: '200' },
            docPr: { id: '2', name: 'Pic 2' }
        };
        const el = ext.renderInline(a);
        expect(el.name).toBe('wp:inline');
        const back = ext.parseInline(el);
        expect(back.extent.cx).toBe('100');
        expect(back.docPr.name).toBe('Pic 2');
    });

    test('xfrm roundtrip with off/ext + flipH/flipV/rot', () => {
        const x = { rot: '90', flipH: '1', flipV: '0',
                    off: { x: '10', y: '20' }, ext: { cx: '100', cy: '200' } };
        const el = ext.renderXfrm(x);
        expect(el.name).toBe('wp:xfrm');
        const back = ext.parseXfrm(el);
        expect(back.rot).toBe('90');
        expect(back.flipH).toBe('1');
        expect(back.off).toEqual({ x: '10', y: '20' });
        expect(back.ext).toEqual({ cx: '100', cy: '200' });
    });

    test('cNvPr/cNvSpPr/cNvCnPr/cNvFrPr/cNvGrpSpPr roundtrip', () => {
        const cnvPr = ext.renderCNvPr({ id: '5', name: 'Sh', descr: 'd', title: 't', hidden: '0' });
        expect(ext.parseCNvPr(cnvPr).name).toBe('Sh');

        const sp = ext.renderCNvSpPr({ attrs: { txBox: '1' }, spLocks: { noChangeAspect: '1' } });
        const spBack = ext.parseCNvSpPr(sp);
        expect(spBack.attrs.txBox).toBe('1');
        expect(spBack.spLocks.noChangeAspect).toBe('1');

        const cn = ext.renderCNvCnPr({ attrs: {}, stCxn: { id: '1', idx: '0' }, endCxn: { id: '2', idx: '1' } });
        const cnBack = ext.parseCNvCnPr(cn);
        expect(cnBack.stCxn.id).toBe('1');
        expect(cnBack.endCxn.idx).toBe('1');

        const fr = ext.renderCNvFrPr({ attrs: {}, graphicFrameLocks: { noGrp: '1' } });
        expect(ext.parseCNvFrPr(fr).graphicFrameLocks.noGrp).toBe('1');

        const gp = ext.renderCNvGrpSpPr({ attrs: {}, grpSpLocks: { noUngrp: '1' } });
        expect(ext.parseCNvGrpSpPr(gp).grpSpLocks.noUngrp).toBe('1');
    });

    test('bodyPr with all attrs and presets', () => {
        const b = {
            attrs: { rot: '0', spcFirstLastPara: '1', vertOverflow: 'clip',
                     horzOverflow: 'overflow', vert: 'horz', wrap: 'square',
                     lIns: '91440', tIns: '45720', rIns: '91440', bIns: '45720',
                     numCol: '1', spcCol: '0', rtlCol: '0', fromWordArt: '0',
                     anchor: 't', anchorCtr: '0', forceAA: '0', upright: '0',
                     compatLnSpc: '0' },
            prstTxWarp: { prst: 'textNoShape' },
            normAutofit: { fontScale: '90000' }
        };
        const el = ext.renderBodyPr(b);
        const back = ext.parseBodyPr(el);
        expect(back.attrs.rot).toBe('0');
        expect(back.attrs.lIns).toBe('91440');
        expect(back.prstTxWarp.prst).toBe('textNoShape');
        expect(back.normAutofit.fontScale).toBe('90000');
    });

    test('bodyPr with spAutoFit', () => {
        const el = ext.renderBodyPr({ attrs: {}, spAutoFit: true });
        const back = ext.parseBodyPr(el);
        expect(back.spAutoFit).toBe(true);
    });

    test('txbx + txbxContent + linkedTxbx', () => {
        const t = {
            attrs: { id: '1' },
            content: { children: [xml.el('w:p', {})] }
        };
        const el = ext.renderTxbx(t);
        expect(el.name).toBe('wp:txbx');
        const back = ext.parseTxbx(el);
        expect(back.attrs.id).toBe('1');
        expect(back.content.children.length).toBe(1);

        const lEl = ext.renderLinkedTxbx({ id: '5', seq: '2' });
        expect(ext.parseLinkedTxbx(lEl).seq).toBe('2');
    });

    test('style with lnRef/fillRef/effectRef/fontRef', () => {
        const s = {
            lnRef: { idx: '1' }, fillRef: { idx: '2' },
            effectRef: { idx: '0' }, fontRef: { idx: 'minor' }
        };
        const el = ext.renderStyle(s);
        const back = ext.parseStyle(el);
        expect(back.lnRef.idx).toBe('1');
        expect(back.fontRef.idx).toBe('minor');
    });

    test('wsp roundtrip', () => {
        const w = {
            cNvPr: { id: '1', name: 'Shape' },
            cNvSpPr: { attrs: {} },
            spPr: { attrs: {}, children: [] },
            bodyPr: { attrs: { wrap: 'square' } }
        };
        const el = ext.renderWsp(w);
        expect(el.name).toBe('wp:wsp');
        const back = ext.parseWsp(el);
        expect(back.cNvPr.name).toBe('Shape');
        expect(back.bodyPr.attrs.wrap).toBe('square');
    });

    test('grpSp with nested wsp roundtrip', () => {
        const g = {
            cNvPr: { id: '1' },
            cNvGrpSpPr: { attrs: {} },
            grpSpPr: { attrs: {}, children: [] },
            items: [
                { kind: 'wsp', node: { cNvPr: { id: '2' } } }
            ]
        };
        const el = ext.renderGrpSp(g);
        expect(el.name).toBe('wp:grpSp');
        const back = ext.parseGrpSp(el);
        expect(back.items.length).toBe(1);
        expect(back.items[0].kind).toBe('wsp');
    });

    test('graphicFrame roundtrip', () => {
        const g = {
            cNvPr: { id: '1', name: 'Frame' },
            cNvFrPr: { attrs: {} },
            xfrm: { off: { x: '0', y: '0' }, ext: { cx: '100', cy: '100' } }
        };
        const el = ext.renderGraphicFrame(g);
        expect(el.name).toBe('wp:graphicFrame');
        const back = ext.parseGraphicFrame(el);
        expect(back.cNvPr.name).toBe('Frame');
        expect(back.xfrm.ext.cx).toBe('100');
    });

    test('contentPart roundtrip with nvContentPartPr', () => {
        const c = {
            rId: 'rId7',
            nvContentPartPr: {
                cNvPr: { id: '1', name: 'Ink' },
                cNvContentPartPr: { attrs: { isComment: '0' } }
            },
            xfrm: { off: { x: '0', y: '0' }, ext: { cx: '1', cy: '1' } }
        };
        const el = ext.renderContentPart(c);
        expect(el.name).toBe('wp:contentPart');
        const back = ext.parseContentPart(el);
        expect(back.rId).toBe('rId7');
        expect(back.nvContentPartPr.cNvPr.name).toBe('Ink');
        expect(back.nvContentPartPr.cNvContentPartPr.attrs.isComment).toBe('0');
    });

    test('wpc canvas with whole/bg + items', () => {
        const w = {
            bg: { children: [] },
            whole: { bg: { children: [] }, style: { lnRef: { idx: '1' } } },
            items: [{ kind: 'wsp', node: { cNvPr: { id: '1' } } }]
        };
        const el = ext.renderWpc(w);
        expect(el.name).toBe('wp:wpc');
        const back = ext.parseWpc(el);
        expect(back.whole.style.lnRef.idx).toBe('1');
        expect(back.items.length).toBe(1);
    });

    test('wgp group roundtrip', () => {
        const g = {
            cNvPr: { id: '1' },
            cNvGrpSpPr: { attrs: {} },
            grpSpPr: { attrs: {}, children: [] },
            items: []
        };
        const el = ext.renderWgp(g);
        expect(el.name).toBe('wp:wgp');
        const back = ext.parseWgp(el);
        expect(back.cNvPr.id).toBe('1');
    });

    test('extLst preserved', () => {
        const e = { children: [xml.el('a:ext', { uri: '{abc}' })] };
        const el = ext.renderExtLst(e);
        const back = ext.parseExtLst(el);
        expect(back.children.length).toBe(1);
    });
});
