// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { dmlShapesAdvanced } from './dml-shapes-advanced.js';

const xml = ooxmlXml.factory();
const m = dmlShapesAdvanced.factory(xml);

describe('extra/dml-shapes-advanced — custGeom', () => {
    test('full path roundtrip with all op kinds', () => {
        const c = {
            avLst: { gds: [{ name: 'adj1', fmla: 'val 50000' }] },
            gdLst: { gds: [{ name: 'g1', fmla: '*/ 100 50 50' }] },
            ahLst: { ahs: [
                { kind: 'ahPolar', attrs: { gdRefAng: 'g1', minAng: '0', maxAng: '180', gdRefR: 'g2', minR: '0', maxR: '100' },
                  pos: { x: '0', y: '0' } },
                { kind: 'ahXY',    attrs: { gdRefX: 'gx', minX: '0', maxX: '100', gdRefY: 'gy', minY: '0', maxY: '100' },
                  pos: { x: '5', y: '5' } }
            ]},
            cxnLst: { cxns: [{ attrs: { ang: '0' }, pos: { x: '10', y: '20' } }] },
            rect: { l: '0', t: '0', r: '100', b: '100' },
            paths: [{
                attrs: { w: '100', h: '100', fill: 'norm', stroke: '1', extrusionOk: '0' },
                commands: [
                    { op: 'moveTo',     points: [{ x: '0', y: '0' }] },
                    { op: 'lnTo',       points: [{ x: '100', y: '0' }] },
                    { op: 'arcTo',      attrs: { wR: '10', hR: '10', stAng: '0', swAng: '5400000' } },
                    { op: 'cubicBezTo', points: [{ x: '50', y: '50' }, { x: '60', y: '60' }, { x: '70', y: '70' }] },
                    { op: 'quadBezTo',  points: [{ x: '80', y: '80' }, { x: '90', y: '90' }] },
                    { op: 'close' }
                ]
            }]
        };
        const back = m.parseCustGeom(m.renderCustGeom(c));
        expect(back.avLst.gds[0].name).toBe('adj1');
        expect(back.gdLst.gds[0].fmla).toBe('*/ 100 50 50');
        expect(back.ahLst.ahs.length).toBe(2);
        expect(back.ahLst.ahs[0].kind).toBe('ahPolar');
        expect(back.ahLst.ahs[1].attrs.gdRefX).toBe('gx');
        expect(back.cxnLst.cxns[0].attrs.ang).toBe('0');
        expect(back.cxnLst.cxns[0].pos.x).toBe('10');
        expect(back.rect.l).toBe('0');
        expect(back.paths.length).toBe(1);
        expect(back.paths[0].commands.length).toBe(6);
        expect(back.paths[0].commands[2].op).toBe('arcTo');
        expect(back.paths[0].commands[2].attrs.wR).toBe('10');
        expect(back.paths[0].commands[3].points.length).toBe(3);
        expect(back.paths[0].attrs.w).toBe('100');
    });
});

describe('extra/dml-shapes-advanced — pt', () => {
    test('roundtrip', () => {
        const back = m.parsePt(m.renderPt({ x: '5', y: '7' }));
        expect(back).toEqual({ x: '5', y: '7' });
    });
});

describe('extra/dml-shapes-advanced — connectors', () => {
    test('cxnSp + cNvCxnSpPr', () => {
        const c = { attrs: { id: '5' }, cNvCxnSpPr: { name: 'a:cNvCxnSpPr', attrs: {} } };
        const back = m.parseCxnSp(m.renderCxnSp(c));
        expect(back.attrs.id).toBe('5');
        expect(back.cNvCxnSpPr).toBeTruthy();
    });
});

describe('extra/dml-shapes-advanced — 3D', () => {
    test('scene3d + sp3d roundtrip', () => {
        const s3 = { camera: { attrs: { prst: 'orthographicFront' } },
                     lightRig: { attrs: { rig: 'threePt', dir: 't' }, rot: { lat: '0', lon: '0', rev: '0' } },
                     flatTx: { z: '0' } };
        const back = m.parseScene3d(m.renderScene3d(s3));
        expect(back.camera.attrs.prst).toBe('orthographicFront');
        expect(back.lightRig.attrs.rig).toBe('threePt');
        expect(back.flatTx.z).toBe('0');

        const sp = { attrs: { extrusionH: '500' },
                     bevelT: { attrs: { w: '38100', h: '38100', prst: 'circle' } },
                     bevelB: { attrs: { w: '38100', h: '38100' } },
                     extrusionClr: { children: [xml.el('a:srgbClr', { val: 'FF0000' })] },
                     contourClr:   { children: [xml.el('a:srgbClr', { val: '00FF00' })] } };
        const sb = m.parseSp3d(m.renderSp3d(sp));
        expect(sb.attrs.extrusionH).toBe('500');
        expect(sb.bevelT.attrs.prst).toBe('circle');
        expect(sb.bevelB.attrs.w).toBe('38100');
        expect(sb.extrusionClr.children.length).toBe(1);
        expect(sb.contourClr.children.length).toBe(1);
    });
});
