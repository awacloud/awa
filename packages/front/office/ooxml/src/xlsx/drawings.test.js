// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { drawingml } from '../drawingml/drawingml.js';
import { xlsxDrawings } from './drawings.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const dr = xlsxDrawings.factory(_errors, xml,
    drawingmlShape.factory(xml, _shared), drawingml.factory(xml, null, _shared), _shared);

describe('xlsxDrawings — anchors', () => {
    test('twoCell anchor builder', () => {
        const a = dr.twoCell({ col: 0, row: 0 }, { col: 5, row: 10 });
        expect(a).toEqual({
            kind: 'twoCell', editAs: 'oneCell',
            from: { col: 0, colOff: 0, row: 0, rowOff: 0 },
            to:   { col: 5, colOff: 0, row: 10, rowOff: 0 }
        });
    });

    test('oneCell anchor builder', () => {
        const a = dr.oneCell({ col: 1, row: 5 }, { cx: 4000000, cy: 3000000 });
        expect(a).toEqual({
            kind: 'oneCell',
            from: { col: 1, colOff: 0, row: 5, rowOff: 0 },
            ext: { cx: 4000000, cy: 3000000 }
        });
    });
});

describe('xlsxDrawings — chart entry roundtrip', () => {
    test('twoCell + chart graphicFrame', () => {
        const obj = {
            entries: [{
                type: 'chart',
                anchor: dr.twoCell({ col: 0, row: 0 }, { col: 6, row: 15 }),
                graphicFrameId: 2,
                graphicFrameName: 'Chart 1',
                cx: 6000000, cy: 4000000,
                offsetX: 0, offsetY: 0,
                chartRef: 'rId1'
            }]
        };
        const back = dr.parse(dr.serialize(obj));
        expect(back.entries).toHaveLength(1);
        const e = back.entries[0];
        expect(e.type).toBe('chart');
        expect(e.chartRef).toBe('rId1');
        expect(e.graphicFrameName).toBe('Chart 1');
        expect(e.anchor.kind).toBe('twoCell');
        expect(e.anchor.from.col).toBe(0);
        expect(e.anchor.to.col).toBe(6);
    });
});

describe('xlsxDrawings — picture entry roundtrip', () => {
    test('oneCell + picture', () => {
        const obj = {
            entries: [{
                type: 'picture',
                anchor: dr.oneCell({ col: 1, row: 5 },
                                    { cx: 2000000, cy: 1500000 }),
                picId: 3,
                picName: 'Logo',
                description: 'Company logo',
                cx: 2000000, cy: 1500000,
                offsetX: 0, offsetY: 0,
                embedRef: 'rId2',
                prstGeom: 'rect'
            }]
        };
        const back = dr.parse(dr.serialize(obj));
        const e = back.entries[0];
        expect(e.type).toBe('picture');
        expect(e.embedRef).toBe('rId2');
        expect(e.description).toBe('Company logo');
        expect(e.anchor.kind).toBe('oneCell');
        expect(e.anchor.ext.cx).toBe(2000000);
    });
});

describe('xlsxDrawings — multiple entries', () => {
    test('chart + picture + chart in same drawing', () => {
        const obj = {
            entries: [
                { type: 'chart',
                  anchor: dr.twoCell({ col: 0, row: 0 }, { col: 5, row: 10 }),
                  cx: 5000000, cy: 3000000, chartRef: 'rId1' },
                { type: 'picture',
                  anchor: dr.oneCell({ col: 6, row: 0 },
                                      { cx: 1000000, cy: 1000000 }),
                  cx: 1000000, cy: 1000000, embedRef: 'rId2' },
                { type: 'chart',
                  anchor: dr.twoCell({ col: 0, row: 12 }, { col: 5, row: 22 }),
                  cx: 5000000, cy: 3000000, chartRef: 'rId3' }
            ]
        };
        const back = dr.parse(dr.serialize(obj));
        expect(back.entries).toHaveLength(3);
        expect(back.entries[0].chartRef).toBe('rId1');
        expect(back.entries[1].embedRef).toBe('rId2');
        expect(back.entries[2].chartRef).toBe('rId3');
    });
});
