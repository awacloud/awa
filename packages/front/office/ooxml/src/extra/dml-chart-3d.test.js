// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlChart3d } from './dml-chart-3d.js';

const xml = ooxmlXml.factory();
const ext = dmlChart3d.factory(xml);

describe('extra/dml-chart-3d: view3D', () => {
    test('roundtrip rotX/rotY/rAngAx/perspective/depthPercent/hPercent', () => {
        const v = { rotX: 15, rotY: 20, rAngAx: true, perspective: 30, depthPercent: 100, hPercent: 75 };
        const back = ext.parseView3D(ext.renderView3D(v));
        expect(back.rotX).toBe(15);
        expect(back.rotY).toBe(20);
        expect(back.rAngAx).toBe(true);
        expect(back.perspective).toBe(30);
        expect(back.depthPercent).toBe(100);
        expect(back.hPercent).toBe(75);
    });
});

describe('extra/dml-chart-3d: floor / sideWall / backWall', () => {
    test('thickness + spPr + pictureOptions roundtrip', () => {
        const f = {
            thickness: 0,
            spPr: xml.el('c:spPr', {}, []),
            pictureOptions: xml.el('c:pictureOptions', {}, [])
        };
        const fb = ext.parseFloor(ext.renderFloor(f));
        expect(fb.thickness).toBe(0);
        expect(fb.spPr.name).toBe('c:spPr');
        expect(fb.pictureOptions.name).toBe('c:pictureOptions');

        const sb = ext.parseSideWall(ext.renderSideWall({ thickness: 1, spPr: xml.el('c:spPr', {}, []) }));
        expect(sb.thickness).toBe(1);

        const bb = ext.parseBackWall(ext.renderBackWall({ thickness: 2 }));
        expect(bb.thickness).toBe(2);
    });
});

describe('extra/dml-chart-3d: bandFmt / bandFmts', () => {
    test('roundtrip', () => {
        const arr = [
            { idx: 0, spPr: xml.el('c:spPr', {}, []) },
            { idx: 1, spPr: xml.el('c:spPr', {}, []) },
            { idx: 2 }
        ];
        const back = ext.parseBandFmts(ext.renderBandFmts(arr));
        expect(back.length).toBe(3);
        expect(back[0].idx).toBe(0);
        expect(back[1].spPr.name).toBe('c:spPr');
        expect(back[2].idx).toBe(2);
    });
});

describe('extra/dml-chart-3d: ser', () => {
    test('roundtrip with idx/order/tx/spPr/invertIfNegative/dPt/dLbls/cat/val/shape/bubble3D', () => {
        const s = {
            idx: 0,
            order: 0,
            tx: xml.el('c:tx', {}, []),
            spPr: xml.el('c:spPr', {}, []),
            invertIfNegative: true,
            bubble3D: false,
            dPt: [
                { idx: 0, invertIfNegative: false, spPr: xml.el('c:spPr', {}, []) },
                { idx: 1, bubble3D: true }
            ],
            dLbls: xml.el('c:dLbls', {}, []),
            cat: xml.el('c:cat', {}, []),
            val: xml.el('c:val', {}, []),
            shape: 'box'
        };
        const back = ext.parseSer(ext.renderSer(s));
        expect(back.idx).toBe(0);
        expect(back.order).toBe(0);
        expect(back.tx.name).toBe('c:tx');
        expect(back.invertIfNegative).toBe(true);
        expect(back.bubble3D).toBe(false);
        expect(back.dPt.length).toBe(2);
        expect(back.dPt[0].idx).toBe(0);
        expect(back.dPt[0].invertIfNegative).toBe(false);
        expect(back.dPt[1].bubble3D).toBe(true);
        expect(back.dLbls.name).toBe('c:dLbls');
        expect(back.cat.name).toBe('c:cat');
        expect(back.val.name).toBe('c:val');
        expect(back.shape).toBe('box');
    });
});

describe('extra/dml-chart-3d: 3D chart shapes', () => {
    test('bar3DChart full roundtrip', () => {
        const c = {
            kind: 'bar3DChart',
            varyColors: false,
            grouping: 'clustered',
            ser: [{ idx: 0, order: 0, val: xml.el('c:val', {}, []) }],
            gapWidth: 150,
            gapDepth: 100,
            shape: 'box',
            axId: ['111', '222', '333']
        };
        const back = ext.parseChart3D(ext.renderBar3DChart(c));
        expect(back.kind).toBe('bar3DChart');
        expect(back.varyColors).toBe(false);
        expect(back.grouping).toBe('clustered');
        expect(back.gapWidth).toBe(150);
        expect(back.gapDepth).toBe(100);
        expect(back.shape).toBe('box');
        expect(back.axId).toEqual(['111', '222', '333']);
    });

    test('line3DChart / pie3DChart / area3DChart', () => {
        const lb = ext.parseChart3D(ext.renderLine3DChart({ kind: 'line3DChart', ser: [], gapDepth: 50 }));
        expect(lb.kind).toBe('line3DChart');
        expect(lb.gapDepth).toBe(50);

        const pb = ext.parseChart3D(ext.renderPie3DChart({ kind: 'pie3DChart', firstSliceAng: 90, varyColors: true }));
        expect(pb.kind).toBe('pie3DChart');
        expect(pb.firstSliceAng).toBe(90);

        const ab = ext.parseChart3D(ext.renderArea3DChart({ kind: 'area3DChart', grouping: 'stacked' }));
        expect(ab.kind).toBe('area3DChart');
        expect(ab.grouping).toBe('stacked');
    });

    test('surfaceChart / surface3DChart with wireframe + bandFmts', () => {
        const sb = ext.parseChart3D(ext.renderSurfaceChart({
            kind: 'surfaceChart',
            wireframe: true,
            bandFmts: [{ idx: 0, spPr: xml.el('c:spPr', {}, []) }]
        }));
        expect(sb.kind).toBe('surfaceChart');
        expect(sb.wireframe).toBe(true);
        expect(sb.bandFmts.length).toBe(1);

        const s3 = ext.parseChart3D(ext.renderSurface3DChart({ kind: 'surface3DChart', wireframe: false }));
        expect(s3.kind).toBe('surface3DChart');
        expect(s3.wireframe).toBe(false);
    });

    test('CHART_TYPES_3D list', () => {
        expect(ext.CHART_TYPES_3D).toEqual(['bar3DChart', 'line3DChart', 'pie3DChart',
            'area3DChart', 'surfaceChart', 'surface3DChart']);
    });
});
