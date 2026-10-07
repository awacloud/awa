// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlXdrAdvanced } from './dml-xdr-advanced.js';

const xml = ooxmlXml.factory();
const ext = dmlXdrAdvanced.factory(xml);

describe('extra/dml-xdr-advanced', () => {
    test('cxnSp with nvCxnSpPr (cNvPr + cNvCxnSpPr/stCxn/endCxn) roundtrip', () => {
        const c = {
            attrs: { macro: '', fPublished: '1' },
            nvCxnSpPr: {
                cNvPr: { id: '5', name: 'Connector' },
                cNvCxnSpPr: {
                    attrs: {},
                    stCxn: { id: '1', idx: '0' },
                    endCxn: { id: '2', idx: '2' }
                }
            },
            spPr: { children: [] },
            style: { lnRef: { idx: '1' }, fillRef: { idx: '0' },
                     effectRef: { idx: '0' }, fontRef: { idx: 'minor' } }
        };
        const el = ext.renderCxnSp(c);
        expect(el.name).toBe('xdr:cxnSp');
        const back = ext.parseCxnSp(el);
        expect(back.nvCxnSpPr.cNvPr.name).toBe('Connector');
        expect(back.nvCxnSpPr.cNvCxnSpPr.stCxn.id).toBe('1');
        expect(back.nvCxnSpPr.cNvCxnSpPr.endCxn.idx).toBe('2');
        expect(back.style.lnRef.idx).toBe('1');
        expect(back.style.fontRef.idx).toBe('minor');
    });

    test('grpSp with nvGrpSpPr (cNvPr + cNvGrpSpPr/grpSpLocks) and nested cxnSp', () => {
        const g = {
            attrs: {},
            nvGrpSpPr: {
                cNvPr: { id: '1', name: 'Group' },
                cNvGrpSpPr: { attrs: {}, grpSpLocks: { noUngrp: '1' } }
            },
            grpSpPr: { attrs: {}, children: [] },
            items: [
                { kind: 'cxnSp', node: { attrs: {}, nvCxnSpPr: { cNvPr: { id: '2' } } } },
                { kind: 'contentPart', node: { rId: 'rId3' } }
            ]
        };
        const el = ext.renderGrpSp(g);
        expect(el.name).toBe('xdr:grpSp');
        const back = ext.parseGrpSp(el);
        expect(back.nvGrpSpPr.cNvPr.name).toBe('Group');
        expect(back.nvGrpSpPr.cNvGrpSpPr.grpSpLocks.noUngrp).toBe('1');
        expect(back.items.length).toBe(2);
        expect(back.items[0].kind).toBe('cxnSp');
        expect(back.items[1].kind).toBe('contentPart');
        expect(back.items[1].node.rId).toBe('rId3');
    });

    test('contentPart roundtrip', () => {
        const el = ext.renderContentPart({ rId: 'rId9' });
        expect(el.name).toBe('xdr:contentPart');
        expect(el.attrs['r:id']).toBe('rId9');
        const back = ext.parseContentPart(el);
        expect(back.rId).toBe('rId9');
    });

    test('style roundtrip', () => {
        const s = { lnRef: { idx: '1' }, fillRef: { idx: '2' },
                    effectRef: { idx: '3' }, fontRef: { idx: 'major' } };
        const el = ext.renderStyle(s);
        expect(el.name).toBe('xdr:style');
        const back = ext.parseStyle(el);
        expect(back.fontRef.idx).toBe('major');
    });

    test('twoCellAnchor roundtrip with from/to + cxnSp', () => {
        const a = {
            attrs: { editAs: 'oneCell' },
            from: { col: 0, colOff: 0, row: 0, rowOff: 0 },
            to:   { col: 5, colOff: 12345, row: 10, rowOff: 67890 },
            items: [
                { kind: 'cxnSp', node: { attrs: {}, nvCxnSpPr: { cNvPr: { id: '1' } } } }
            ],
            clientData: {}
        };
        const el = ext.renderTwoCellAnchor(a);
        expect(el.name).toBe('xdr:twoCellAnchor');
        const back = ext.parseTwoCellAnchor(el);
        expect(back.attrs.editAs).toBe('oneCell');
        expect(back.from.col).toBe(0);
        expect(back.to.col).toBe(5);
        expect(back.to.rowOff).toBe(67890);
        expect(back.items[0].kind).toBe('cxnSp');
    });

    test('oneCellAnchor with ext', () => {
        const a = {
            attrs: {},
            from: { col: 1, colOff: 100, row: 2, rowOff: 200 },
            ext: { cx: '5000', cy: '3000' },
            items: []
        };
        const el = ext.renderOneCellAnchor(a);
        expect(el.name).toBe('xdr:oneCellAnchor');
        const back = ext.parseOneCellAnchor(el);
        expect(back.from.row).toBe(2);
        expect(back.ext.cx).toBe('5000');
    });

    test('absoluteAnchor with pos + ext', () => {
        const a = {
            attrs: {},
            pos: { x: '10', y: '20' },
            ext: { cx: '100', cy: '200' },
            items: [{ kind: 'grpSp', node: { attrs: {}, items: [] } }]
        };
        const el = ext.renderAbsoluteAnchor(a);
        expect(el.name).toBe('xdr:absoluteAnchor');
        const back = ext.parseAbsoluteAnchor(el);
        expect(back.pos.x).toBe('10');
        expect(back.ext.cy).toBe('200');
        expect(back.items[0].kind).toBe('grpSp');
    });

    test('cNvCxnSpPr/nvCxnSpPr/cNvGrpSpPr/nvGrpSpPr/grpSpPr individual roundtrips', () => {
        const cn = ext.renderCNvCxnSpPr({ attrs: {}, stCxn: { id: '1', idx: '0' } });
        expect(ext.parseCNvCxnSpPr(cn).stCxn.id).toBe('1');

        const nv = ext.renderNvCxnSpPr({ cNvPr: { id: '1' }, cNvCxnSpPr: { attrs: {} } });
        expect(ext.parseNvCxnSpPr(nv).cNvPr.id).toBe('1');

        const cg = ext.renderCNvGrpSpPr({ attrs: {}, grpSpLocks: { noChangeAspect: '1' } });
        expect(ext.parseCNvGrpSpPr(cg).grpSpLocks.noChangeAspect).toBe('1');

        const ng = ext.renderNvGrpSpPr({ cNvPr: { id: '2' }, cNvGrpSpPr: { attrs: {} } });
        expect(ext.parseNvGrpSpPr(ng).cNvPr.id).toBe('2');

        const gp = ext.renderGrpSpPr({ attrs: {}, children: [] });
        expect(ext.parseGrpSpPr(gp).children.length).toBe(0);
    });

    test('back-compat parseConnector/parseGroupShape', () => {
        const c = ext.renderConnector({ attrs: {}, nvCxnSpPr: { cNvPr: { id: '1' } } });
        expect(c.name).toBe('xdr:cxnSp');
        const g = ext.renderGroupShape({ attrs: {}, items: [] });
        expect(g.name).toBe('xdr:grpSp');
    });
});
