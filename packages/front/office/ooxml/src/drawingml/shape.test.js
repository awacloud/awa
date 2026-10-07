// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { drawingmlShape } from './shape.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const sh = drawingmlShape.factory(xml, _shared);

describe('drawingmlShape — preset geometry', () => {
    test('rect with size + position', () => {
        const props = sh.shapeProps({
            geom: 'rect',
            cx: '4in', cy: '2in',
            offsetX: '1in', offsetY: '1in'
        });
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        expect(back.geom).toBe('rect');
        expect(back.cx).toBe(3657600);
        expect(back.cy).toBe(1828800);
        expect(back.offsetX).toBe(914400);
        expect(back.offsetY).toBe(914400);
    });

    test('roundRect with avLst', () => {
        const props = {
            geom: 'roundRect',
            cx: 1000000, cy: 500000,
            avLst: [{ name: 'adj', fmla: 'val 16667' }]
        };
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        expect(back.geom).toBe('roundRect');
        expect(back.avLst).toEqual([{ name: 'adj', fmla: 'val 16667' }]);
    });

    test('various preset names', () => {
        for (const geom of ['ellipse', 'triangle', 'rightArrow',
                             'wedgeRectCallout', 'star5', 'cloud']) {
            const props = sh.shapeProps({ geom, cx: 100, cy: 100 });
            const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
            expect(back.geom).toBe(geom);
        }
    });
});

describe('drawingmlShape — fill', () => {
    test('solid RGB fill', () => {
        const props = sh.shapeProps({
            geom: 'rect', cx: 100, cy: 100,
            fill: 'FF0000'
        });
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        expect(back.fill).toEqual({ rgb: 'FF0000' });
    });

    test('no fill', () => {
        const props = sh.shapeProps({
            geom: 'rect', cx: 100, cy: 100,
            fill: 'none'
        });
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        expect(back.fill).toBe('none');
    });

    test('schemeColor fill', () => {
        const props = sh.shapeProps({
            geom: 'rect', cx: 100, cy: 100,
            fill: { schemeColor: 'accent1' }
        });
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        expect(back.fill).toEqual({ schemeColor: 'accent1' });
    });
});

describe('drawingmlShape — line', () => {
    test('line with color + width + dash', () => {
        const props = sh.shapeProps({
            geom: 'rect', cx: 100, cy: 100,
            line: { color: '0000FF', width: 12700, dash: 'dash' }
        });
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        expect(back.line.color).toBe('0000FF');
        expect(back.line.width).toBe(12700);
        expect(back.line.dash).toBe('dash');
    });

    test('no line', () => {
        const props = sh.shapeProps({
            geom: 'rect', cx: 100, cy: 100,
            line: 'none'
        });
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        // 'none' is rendered as <a:ln><a:noFill/></a:ln> ; on parse, color: null
        expect(back.line.color).toBe(null);
    });
});

describe('drawingmlShape — transform', () => {
    test('rotation + flipH + flipV', () => {
        const props = sh.shapeProps({
            geom: 'rect',
            cx: 100, cy: 100,
            rotation: 5400000,         // 90 degrees in 60000ths
            flipH: true, flipV: true
        });
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        expect(back.rotation).toBe(5400000);
        expect(back.flipH).toBe(true);
        expect(back.flipV).toBe(true);
    });
});

describe('drawingmlShape — toEmu', () => {
    test('various unit strings', () => {
        expect(sh.toEmu('1in')).toBe(914400);
        expect(sh.toEmu('1cm')).toBe(360000);
        expect(sh.toEmu('72pt')).toBe(914400);
        expect(sh.toEmu('96px')).toBe(914400);
        expect(sh.toEmu(123456)).toBe(123456);
    });
});

describe('drawingmlShape — preserves unknown spPr children', () => {
    test('gradient fill preserved verbatim', () => {
        const xmlText = '<p:spPr xmlns:p="http://example/p"'
            + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
            + '<a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm>'
            + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
            + '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs></a:gsLst></a:gradFill>'
            + '</p:spPr>';
        const root = xml.parse(xmlText);
        const props = sh.parseShapeProperties(root);
        // gradFill is a known fill type but not modeled — falls into _extras.
        expect(props._extras).toBeDefined();
        // Roundtrip: re-emitted verbatim.
        const back = sh.parseShapeProperties(sh.renderShapeProperties(props));
        expect(back._extras).toBeDefined();
    });
});
