// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A read through `xlsxFullBundle` types the workbook elements the core
 * leaves raw (T60 (f1), `smlWorkbookDetails`): the stylesheet's slicer and
 * timeline styles and `colors`, a font's `outline` / `shadow` / `condense`
 * / `extend`, a dxf's `protection`, a table column's `xmlColumnPr` and
 * `calculatedColumnFormula`. The xlsx walker reaches a drawing's text,
 * which `dmlTextDetails` types. Each element is typed only when it is
 * written back as read; `xlsxLargeBundle` reads them raw as before.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const props = rt.resolve('docxProperties');
const stylesMod = rt.resolve('xlsxStyles');
const drawings = rt.resolve('xlsxDrawings');
const { createWalker } = rt.resolve('xlsxWalker');
const resolveIn = (desc, name) => { const r = new ModuleRuntime(); r.registerDeep(desc); return r.resolve(name); };
const full = resolveIn(ooxmlMods.xlsxFullBundle, 'xlsxFullBundle');
const large = resolveIn(ooxmlMods.xlsxLargeBundle, 'xlsxLargeBundle');
const core = resolveIn(ooxmlMods.xlsx, 'xlsx');
const el = (name, attrs = {}, children = []) => xml.el(name, attrs, children);
const dec = new TextDecoder();

const X14 = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main';
const X15 = 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main';
const extLst = () => el('extLst', {}, [
    el('ext', { uri: '{EB79DEF2-80B8-43e5-95BD-54CBDDF9020C}', 'xmlns:x14': X14 }, [el('x14:slicerStyles', { defaultSlicerStyle: 'SlicerStyleLight1' })]),
    el('ext', { uri: '{9260A510-F301-46a8-8635-F512D64BE5F5}', 'xmlns:x15': X15 }, [el('x15:timelineStyles', { defaultTimelineStyle: 'TimeSlicerStyleLight1' })])
]);
const colors = () => el('colors', {}, [
    el('indexedColors', {}, [el('rgbColor', { rgb: 'FF000000' }), el('rgbColor', { rgb: 'FFFFFFFF' })]),
    el('mruColors', {}, [el('color', { rgb: 'FF00B050' })])
]);
// An extension this extra does not know: the extLst stays raw.
const otherExt = () => el('extLst', {}, [el('ext', { uri: '{OTHER}' }, [el('x:y')])]);

// A font's flags, in Excel's order (CT_Font's) or not.
const flags = (excelOrder) => (excelOrder
    ? [el('condense', { val: '0' }), el('extend', { val: '0' }), el('outline'), el('shadow', { val: '0' })]
    : [el('outline'), el('shadow', { val: '0' }), el('condense', { val: '0' }), el('extend', { val: '0' })]);

function workbook({ unknownExt = false, excelOrder = true } = {}) {
    const styles = stylesMod.defaults();
    styles._extras = [colors(), unknownExt ? otherExt() : extLst()];
    styles.dxfs = [{ font: { bold: true, _extras: flags(excelOrder) },
        _extras: [el('protection', { locked: '0', hidden: '1' })] }];
    return {
        styles,
        sheets: [{
            name: 'S', rows: [['Name', 'Total'], ['a', 1]], tableRefs: [1],
            drawings: [{
                anchor: drawings.oneCell({ col: 3, row: 1 }, { cx: 2000000, cy: 1000000 }),
                shapeProps: { geom: 'rect', cx: 2000000, cy: 1000000, offsetX: 0, offsetY: 0 },
                name: 'Box',
                txBody: { paragraphs: [{ runs: [{ type: 'text', value: 'note', rPr: { lang: 'en-US', _extras: [el('a:solidFill', {}, [el('a:schemeClr', { val: 'tx1' }, [el('a:lumMod', { val: '75000' })])])] } }] }] }
            }]
        }],
        tables: [{
            id: 1, name: 'T', displayName: 'T', ref: 'A1:B2', headerRowCount: 1,
            columns: [
                { id: 1, name: 'Name', _extras: [el('xmlColumnPr', { mapId: '1', xpath: '/r/n', xmlDataType: 'string' })] },
                { id: 2, name: 'Total', _extras: [el('calculatedColumnFormula', {}, [{ type: 'text', value: 'T[[#This Row],[Name]]' }])] }
            ]
        }]
    };
}
const bytes = core.write(workbook());
const read = full.read(bytes).workbook;

describe('smlWorkbookDetails through xlsxFullBundle — the read', () => {
    test('the stylesheet\'s slicer and timeline styles and colors', () => {
        expect(read.styles.slicerStyles).toEqual({ default: 'SlicerStyleLight1' });
        expect(read.styles.timelineStyles).toEqual({ default: 'TimeSlicerStyleLight1' });
        expect(read.styles.colors).toEqual({ indexed: ['FF000000', 'FFFFFFFF'], mru: [{ rgb: 'FF00B050' }] });
        expect(read.styles._extras).toBeUndefined();
    });
    test('a dxf font\'s outline, shadow, condense and extend; a dxf\'s protection', () => {
        const d = read.styles.dxfs[0];
        expect(d.font).toMatchObject({ bold: true, outline: true, shadow: false, condense: false, extend: false });
        expect(d.font._extras).toBeUndefined();
        expect(d.protection).toEqual({ locked: false, hidden: true });
        expect(d._extras).toBeUndefined();
    });
    test('a table column\'s xmlColumnPr and calculatedColumnFormula', () => {
        const [c1, c2] = read.tables[0].columns;
        expect(c1.xmlColumnPr).toEqual({ mapId: 1, xpath: '/r/n', xmlDataType: 'string' });
        expect(c2.calculatedColumnFormula).toEqual({ formula: 'T[[#This Row],[Name]]' });
        expect(c1._extras).toBeUndefined();
        expect(c2._extras).toBeUndefined();
    });
    test('a drawing\'s text is typed by dmlTextDetails', () => {
        const r = read.sheets[0].drawings[0].txBody.paragraphs[0].runs[0];
        expect(r.rPr.solidFill).toEqual({ kind: 'schemeClr', attrs: { val: 'tx1' }, mods: [{ kind: 'lumMod', attrs: { val: '75000' } }] });
        expect(r.rPr._extras).toBeUndefined();
    });
    test('a font whose flags are not in the schema order stays raw, so the write keeps their order', () => {
        const w = full.read(core.write(workbook({ excelOrder: false }))).workbook;
        expect(w.styles.dxfs[0].font.outline).toBeUndefined();
        expect(w.styles.dxfs[0].font._extras.map((e) => e.name)).toEqual(['outline', 'shadow', 'condense', 'extend']);
    });
    test('an extLst with another extension stays raw', () => {
        const s = full.read(core.write(workbook({ unknownExt: true }))).workbook.styles;
        expect(s.slicerStyles).toBeUndefined();
        expect(s._extras.map((e) => e.name)).toEqual(['extLst']);
        expect(s.colors).toBeDefined();
    });
    test('xlsxLargeBundle reads them raw, as before', () => {
        const w = large.read(bytes).workbook;
        expect(w.styles._extras.map((e) => e.name)).toEqual(['colors', 'extLst']);
        expect(w.tables[0].columns[0]._extras.map((e) => e.name)).toEqual(['xmlColumnPr']);
        expect(w.sheets[0].drawings[0].txBody.paragraphs[0].runs[0].rPr._extras.map((e) => e.name)).toEqual(['a:solidFill']);
    });
});

describe('smlWorkbookDetails — the save-back', () => {
    test('written back as the core writes it, whatever the order of the flags', () => {
        for (const excelOrder of [true, false]) {
            const src = core.write(workbook({ excelOrder }));
            const a = opc.read(core.write(core.read(src).workbook));
            const b = opc.read(full.write(full.read(src).workbook));
            for (const name of ['/xl/styles.xml', '/xl/tables/table1.xml', '/xl/drawings/drawing1.xml']) {
                expect(props.sameElement(xml.parse(dec.decode(b.parts[name])), xml.parse(dec.decode(a.parts[name])))).toBe(true);
            }
        }
    });
});

describe('the xlsx walker reaches a drawing\'s text', () => {
    test('run, paragraph-properties and paragraph hooks, on hydrate and dehydrate', () => {
        const log = [];
        const walker = createWalker();
        walker.use({
            hydrateRunProperties(r) { log.push('rPr'); return r; },
            hydrateParagraphProperties(p) { log.push('pPr'); return p; },
            hydrateParagraph(p) { log.push('p'); return p; },
            dehydrateParagraph(p) { log.push('-p'); return p; }
        });
        const w = { sheets: [{ drawings: [{ txBody: { paragraphs: [{ pPr: { algn: 'ctr' }, runs: [{ rPr: { lang: 'en-US' } }] }] } }, { type: 'picture' }] }] };
        walker.applyHydrate(w);
        walker.applyDehydrate(w);
        expect(log).toEqual(['pPr', 'rPr', 'p', '-p']);
    });
});
