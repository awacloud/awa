// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';
import { docxDrawing } from '../docx/drawing.js';
import { docxStructure } from '../docx/structure.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { ooxmlMath } from '../math/math.js';
import { ooxmlErrors } from '../errors.js';
import { ooxmlShared } from '../_shared/index.js';
import { wmlTableProperties } from './wml-table-properties.js';

const xml = ooxmlXml.factory();
const core = docxProperties.factory(xml);
const ext = wmlTableProperties.factory(xml, core);

describe('extra/wml-table-properties — tblPr', () => {
    test('roundtrip', () => {
        const tblPr = {
            tblStyle: 'Grid',
            width: { w: '5000', type: 'pct' },
            indent: { w: '100', type: 'dxa' },
            jc: 'center',
            bidiVisual: true,
            tblLayout: 'fixed',
            borders: {
                top:    { val: 'single', sz: '4', color: '000000' },
                bottom: { val: 'single', sz: '4', color: '000000' },
                insideH:{ val: 'single', sz: '2', color: '888888' }
            },
            cellMargins: {
                top:    { w: '50', type: 'dxa' },
                bottom: { w: '50', type: 'dxa' }
            },
            tblLook: { 'w:val': '04A0', 'w:firstRow': '1' }
        };
        const el = ext.renderTblPr(tblPr);
        expect(el.name).toBe('w:tblPr');
        const back = ext.parseTblPr(el);
        expect(back).toEqual(tblPr);
    });
});

describe('extra/wml-table-properties — trPr', () => {
    test('roundtrip', () => {
        const trPr = {
            cnfStyle: '100000000000',
            gridBefore: 1,
            cantSplit: true,
            tblHeader: true,
            height: { 'w:val': '500', 'w:hRule': 'atLeast' }
        };
        const el = ext.renderTrPr(trPr);
        const back = ext.parseTrPr(el);
        expect(back).toEqual(trPr);
    });
});

describe('extra/wml-table-properties — tcPr extension', () => {
    test('hydrate/dehydrate vAlign + borders + margins', () => {
        // Simulate a tcPr that core would produce, with extras for vAlign/borders.
        const tcPr = {
            width: { w: '2000', type: 'dxa' },
            _extras: [
                xml.el('w:vAlign', { 'w:val': 'center' }),
                xml.el('w:tcBorders', {}, [
                    xml.el('w:top', { 'w:val': 'single', 'w:sz': '4', 'w:color': '000000' })
                ]),
                xml.el('w:tcMar', {}, [
                    xml.el('w:top', { 'w:w': '50', 'w:type': 'dxa' })
                ]),
                xml.el('w:noWrap', {})
            ]
        };
        ext.hydrateTcPr(tcPr);
        expect(tcPr.vAlign).toBe('center');
        expect(tcPr.borders.top).toEqual({ val: 'single', sz: '4', color: '000000' });
        expect(tcPr.margins.top).toEqual({ w: '50', type: 'dxa' });
        expect(tcPr.noWrap).toBe(true);
        expect(tcPr._extras).toBeUndefined();

        const dehydrated = ext.dehydrateTcPr(tcPr);
        // Round-trip: core could now render this and the extras should appear back.
        const names = dehydrated._extras.map(e => e.name);
        expect(names).toContain('w:vAlign');
        expect(names).toContain('w:tcBorders');
        expect(names).toContain('w:tcMar');
        expect(names).toContain('w:noWrap');
    });
});

describe('extra/wml-table-properties — phase 3 tblPr extras', () => {
    test('tblCellSpacing + tblCaption + tblDescription + band sizes', () => {
        const tblPr = {
            tblStyle: 'Grid',
            cellSpacing: { w: '20', type: 'dxa' },
            tblCaption: 'My table',
            tblDescription: 'Used for X',
            tblStyleColBandSize: '1',
            tblStyleRowBandSize: '2',
            tblOverlap: 'never'
        };
        const back = ext.parseTblPr(ext.renderTblPr(tblPr));
        expect(back).toEqual(tblPr);
    });

    test('tblBorders all sides including diagonal', () => {
        const tblPr = {
            borders: {
                top:     { val: 'single', sz: '4', color: '000000' },
                left:    { val: 'single', sz: '4', color: '000000' },
                bottom:  { val: 'single', sz: '4', color: '000000' },
                right:   { val: 'single', sz: '4', color: '000000' },
                insideH: { val: 'dashed', sz: '2', color: '888888' },
                insideV: { val: 'dotted', sz: '2', color: '888888' }
            }
        };
        const back = ext.parseTblPr(ext.renderTblPr(tblPr));
        expect(back.borders).toEqual(tblPr.borders);
    });
});

describe('extra/wml-table-properties — phase 3 tcPr extras', () => {
    test('tcBorders with diagonal sides', () => {
        const tcPr = {
            _extras: [
                xml.el('w:tcBorders', {}, [
                    xml.el('w:tl2br', { 'w:val': 'single', 'w:sz': '4', 'w:color': 'FF0000' }),
                    xml.el('w:tr2bl', { 'w:val': 'single', 'w:sz': '4', 'w:color': 'FF0000' })
                ])
            ]
        };
        ext.hydrateTcPr(tcPr);
        expect(tcPr.borders.tl2br).toEqual({ val: 'single', sz: '4', color: 'FF0000' });
        expect(tcPr.borders.tr2bl).toEqual({ val: 'single', sz: '4', color: 'FF0000' });
    });

    test('hideMark + tcFitText toggles', () => {
        const tcPr = {
            _extras: [
                xml.el('w:hideMark', {}),
                xml.el('w:tcFitText', {})
            ]
        };
        ext.hydrateTcPr(tcPr);
        expect(tcPr.hideMark).toBe(true);
        expect(tcPr.tcFitText).toBe(true);
        const dehydrated = ext.dehydrateTcPr(tcPr);
        const names = dehydrated._extras.map(e => e.name);
        expect(names).toContain('w:hideMark');
        expect(names).toContain('w:tcFitText');
    });

    test('tcW from extras', () => {
        const tcPr = {
            _extras: [ xml.el('w:tcW', { 'w:w': '2000', 'w:type': 'dxa' }) ]
        };
        ext.hydrateTcPr(tcPr);
        expect(tcPr.width).toEqual({ w: '2000', type: 'dxa' });
    });
});

describe('extra/wml-table-properties — phase 3 trPr extras', () => {
    test('hidden toggle + wBefore/wAfter', () => {
        const trPr = {
            hidden: true,
            wBefore: { w: '100', type: 'dxa' },
            wAfter:  { w: '200', type: 'dxa' }
        };
        const back = ext.parseTrPr(ext.renderTrPr(trPr));
        expect(back).toEqual(trPr);
    });
});

describe('extra/wml-table-properties — table/row hydrate', () => {
    test('hydrateTable promotes tblPr from _extras', () => {
        const table = {
            type: 'table',
            rows: [],
            _extras: [
                xml.el('w:tblPr', {}, [
                    xml.el('w:tblStyle', { 'w:val': 'Grid' }),
                    xml.el('w:tblW',     { 'w:w': '5000', 'w:type': 'pct' })
                ])
            ]
        };
        ext.hydrateTable(table);
        expect(table.tblPr.tblStyle).toBe('Grid');
        expect(table.tblPr.width).toEqual({ w: '5000', type: 'pct' });
        expect(table._extras).toBeUndefined();

        const back = ext.dehydrateTable(table);
        expect(back._extras[0].name).toBe('w:tblPr');
    });
});

describe('extra/wml-table-properties — parity with the pre-BL-1766 shape', () => {
    // Real read path: core `parseTable` types tblPr first, THEN the extension hydrates.
    const shared = ooxmlShared.factory();
    const struct = docxStructure.factory(xml, core,
        docxDrawing.factory(xml, drawingmlShape.factory(xml, shared), shared),
        ooxmlMath.factory(ooxmlErrors.factory(), xml));
    const TBL = '<w:tbl xmlns:w="x"><w:tblPr><w:tblStyle w:val="TableGrid"/>'
        + '<w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/>'
        + '<w:tblInd w:w="108" w:type="dxa"/>'
        + '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideV w:val="dotted"/></w:tblBorders>'
        + '<w:tblLayout w:type="fixed"/>'
        + '<w:tblCellMar><w:top w:w="10" w:type="dxa"/><w:left w:w="20" w:type="dxa"/></w:tblCellMar>'
        + '<w:tblLook w:val="04A0" w:firstRow="1"/></w:tblPr>'
        + '<w:tblGrid><w:gridCol w:w="1"/></w:tblGrid>'
        + '<w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>';
    // Shape measured from HEAD's extension source (tblPr hydrated out of _extras).
    const PRE_BATCH_TBLPR = {
        tblStyle: 'TableGrid',
        width: { w: '5000', type: 'pct' },
        jc: 'center',
        indent: { w: '108', type: 'dxa' },
        borders: {
            top: { val: 'single', sz: '4', space: '0', color: 'auto' },
            insideV: { val: 'dotted' }
        },
        tblLayout: 'fixed',
        cellMargins: { top: { w: '10', type: 'dxa' }, left: { w: '20', type: 'dxa' } },
        tblLook: { 'w:val': '04A0', 'w:firstRow': '1' }
    };
    // Bytes measured from HEAD's extension: hydrate then dehydrate then render.
    const PRE_BATCH_BYTES = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>'
        + '<w:jc w:val="center"/><w:tblInd w:w="108" w:type="dxa"/><w:tblBorders>'
        + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="dotted"/></w:tblBorders>'
        + '<w:tblCellMar><w:top w:w="10" w:type="dxa"/><w:left w:w="20" w:type="dxa"/></w:tblCellMar>'
        + '<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1"/></w:tblPr>'
        + '<w:tblGrid><w:gridCol w:w="1"/></w:tblGrid></w:tbl>';
    const readTable = () => {
        const t = struct.parseTable(xml.parse(TBL));
        ext.hydrateTable(t);
        return t;
    };

    test('hydrateTable over a core-parsed table yields the pre-batch typed shape', () => {
        const t = readTable();
        expect(t.tblPr).toEqual(PRE_BATCH_TBLPR);
        expect(t._extras.map(e => e.name)).toEqual(['w:tblGrid']);
    });

    test('hydrate then dehydrate then render is byte-equal to the pre-batch output', () => {
        const out = ext.dehydrateTable(readTable());
        expect('tblPr' in out).toBe(false);
        expect(xml.serializeNode(struct.renderTable({ ...out, rows: [] }))).toBe(PRE_BATCH_BYTES);
    });

    test('hydrating twice is idempotent (an extension-shaped bag is not re-derived)', () => {
        const t = readTable();
        ext.hydrateTable(t);
        expect(t.tblPr).toEqual(PRE_BATCH_TBLPR);
    });

    test('a childless / core-only tblPr (style + borders) keeps its style under the extension', () => {
        const t = struct.parseTable(xml.parse(
            '<w:tbl xmlns:w="x"><w:tblPr><w:tblStyle w:val="G"/>'
            + '<w:tblBorders><w:top w:val="single"/></w:tblBorders></w:tblPr></w:tbl>'));
        ext.hydrateTable(t);
        expect(t.tblPr).toEqual({ tblStyle: 'G', borders: { top: { val: 'single' } } });
    });

    test('write-only: a composer-authored core tblPr (style key) keeps w:tblStyle and unmodelled border children', () => {
        const shd = xml.el('w:shd', { 'w:val': 'clear' });
        const out = ext.dehydrateTable({ type: 'table', rows: [],
            tblPr: { style: 'TableGrid', width: { w: 5000, type: 'pct' },
                     borders: { top: { val: 'single' }, _extras: [shd] } } });
        const tblPr = out._extras[0];
        expect(tblPr.children.map(c => c.name)).toEqual(['w:tblStyle', 'w:tblW', 'w:tblBorders']);
        expect(tblPr.children[0].attrs['w:val']).toBe('TableGrid');
        expect(tblPr.children[2].children.map(c => c.name)).toEqual(['w:top', 'w:shd']);
    });

    const THEMED = '<w:tbl xmlns:w="x"><w:tblPr><w:tblBorders>'
        + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto" w:themeColor="accent1" w:themeTint="99" w:shadow="1" w:frame="0"/>'
        + '<w:bottom w:val="nil"/></w:tblBorders></w:tblPr></w:tbl>';

    test('border attributes beyond val/sz/space/color survive the core read as extraAttrs (lossless)', () => {
        const t = struct.parseTable(xml.parse(THEMED));
        expect(t.tblPr.borders.top).toEqual({
            val: 'single', sz: 4, space: 0, color: 'auto',
            extraAttrs: { 'w:themeColor': 'accent1', 'w:themeTint': '99', 'w:shadow': '1', 'w:frame': '0' }
        });
        expect(t.tblPr.borders.bottom).toEqual({ val: 'nil' });
    });

    test('lossless WITHOUT the extension: every border attribute is re-emitted (extraAttrs after w:color)', () => {
        const out = xml.serializeNode(struct.renderTable(struct.parseTable(xml.parse(THEMED))));
        expect(out).toBe('<w:tbl><w:tblPr><w:tblBorders>'
            + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto" w:themeColor="accent1" w:themeTint="99" w:shadow="1" w:frame="0"/>'
            + '<w:bottom w:val="nil"/></w:tblBorders></w:tblPr></w:tbl>');
    });

    test('lossless WITH the extension: hydrate then dehydrate re-emits every border attribute (themeTint included)', () => {
        const t = struct.parseTable(xml.parse(THEMED));
        ext.hydrateTable(t);
        expect(t.tblPr.borders.top.themeColor).toBe('accent1');
        expect(t.tblPr.borders.top.shadow).toBe('1');
        expect(t.tblPr.borders.top.extraAttrs).toEqual({ 'w:themeTint': '99' });
        const out = xml.serializeNode(struct.renderTable(ext.dehydrateTable(t)));
        const top = out.match(/<w:top [^>]*\/>/)[0];
        for (const a of ['w:val="single"', 'w:sz="4"', 'w:space="0"', 'w:color="auto"',
                         'w:themeColor="accent1"', 'w:themeTint="99"', 'w:shadow="1"', 'w:frame="0"']) {
            expect(top).toContain(a);
        }
        expect(out).toContain('<w:bottom w:val="nil"/>');
    });
});
