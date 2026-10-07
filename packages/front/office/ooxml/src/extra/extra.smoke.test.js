// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Smoke tests for the remaining P1/P2 extra modules — verifies each one
 * loads and runs at least one parse/render or build invocation.
 */
import { describe, test, expect } from 'bun:test';
import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';

import { wmlNumberingDetails } from './wml-numbering-details.js';
import { wmlSettings } from './wml-settings.js';
import { wmlFields } from './wml-fields.js';
import { wmlTrackedChanges } from './wml-tracked-changes.js';
import { wmlVmlLegacy } from './wml-vml-legacy.js';
import { smlCalculation } from './sml-calculation.js';
import { smlSheetConfig } from './sml-sheet-config.js';
import { smlWorkbookConfig } from './sml-workbook-config.js';
import { smlFormControls } from './sml-form-controls.js';
import { pmlNotes } from './pml-notes.js';
import { pmlLayoutsTyped } from './pml-layouts-typed.js';
import { dmlChartTrendlines } from './dml-chart-trendlines.js';
import { dmlChartAxesAdvanced } from './dml-chart-axes-advanced.js';
import { dmlChart3d } from './dml-chart-3d.js';
import { dmlChartOtherTypes } from './dml-chart-other-types.js';
import { mathAdvanced } from './math-advanced.js';
import { dmlEffects } from './dml-effects.js';
import { dmlFillsAdvanced } from './dml-fills-advanced.js';
import { dmlShapesAdvanced } from './dml-shapes-advanced.js';
import { dmlXdrAdvanced } from './dml-xdr-advanced.js';
import { transitional } from './transitional.js';
import { legacyVml } from './legacy-vml.js';
import { ooxmlErrors as _ooxmlErrors } from '../errors.js';
import { ooxmlShared as _ooxmlShared } from '../_shared/index.js';
const _errors = _ooxmlErrors.factory();
const _shared = _ooxmlShared.factory();

const xml = ooxmlXml.factory();
const core = docxProperties.factory(xml);

describe('extra/wml-numbering-details', () => {
    test('roundtrip lvl', () => {
        const m = wmlNumberingDetails.factory(xml);
        const lvl = { attrs: { 'w:ilvl': '0' }, nfc: 'decimal', isLgl: true, suff: 'tab' };
        const back = m.parseLvl(m.renderLvl(lvl));
        expect(back.nfc).toBe('decimal');
        expect(back.isLgl).toBe(true);
        expect(back.suff).toBe('tab');
    });
});

describe('extra/wml-settings', () => {
    test('hydrate/dehydrate', () => {
        const m = wmlSettings.factory(xml, core);
        const root = { _extras: [
            xml.el('w:autoHyphenation', {}),
            xml.el('w:hideSpellingErrors', {}),
            xml.el('w:zoom', { 'w:val': '150' })
        ]};
        m.hydrate(root);
        expect(root.autoHyphenation).toBe(true);
        expect(root.hideSpellingErrors).toBe(true);
        expect(root.zoom).toEqual({ val: '150' });
        const back = m.dehydrate(root);
        expect(back._extras.map(e => e.name)).toContain('w:autoHyphenation');
    });
});

describe('extra/wml-fields', () => {
    test('parse + render MERGEFIELD with switches', () => {
        const f = wmlFields.factory();
        const p = f.parseInstruction('MERGEFIELD FirstName \\* MERGEFORMAT \\b "Hello "');
        expect(p.type).toBe('MERGEFIELD');
        expect(p.args).toContain('FirstName');
        expect(p.switches['\\*']).toBe('MERGEFORMAT');
        expect(p.switches['\\b']).toBe('Hello ');
        const text = f.renderInstruction(p);
        expect(text).toContain('MERGEFIELD');
        expect(text).toContain('FirstName');
    });
});

describe('extra/wml-tracked-changes', () => {
    test('roundtrip pPrChange', () => {
        const m = wmlTrackedChanges.factory(xml);
        const c = { kind: 'pPrChange', id: '1', author: 'Alice', date: '2024-01-01T00:00:00Z',
                    children: [xml.el('w:pPr', {})] };
        const back = m.parseChange(m.renderChange(c));
        expect(back.kind).toBe('pPrChange');
        expect(back.author).toBe('Alice');
    });
});

describe('extra/wml-vml-legacy', () => {
    test('preserves pict', () => {
        const m = wmlVmlLegacy.factory(xml);
        const el = xml.el('w:pict', {}, [xml.el('v:rect', { id: 'r1' })]);
        const p = m.parseLegacy(el);
        expect(p.kind).toBe('pict');
        const back = m.renderLegacy(p);
        expect(back.name).toBe('w:pict');
    });
});

describe('extra/sml-calculation', () => {
    test('calcChain roundtrip', () => {
        const m = smlCalculation.factory(xml);
        const text = m.renderCalcChain({ cells: [{ r: 'A1', i: '1' }, { r: 'B2', i: '1' }] });
        const back = m.parseCalcChain(text);
        expect(back.cells.length).toBe(2);
    });
});

describe('extra/sml-sheet-config', () => {
    test('roundtrip', () => {
        const m = smlSheetConfig.factory(xml);
        const out = m.renderSheetConfig({
            dimension: 'A1:C3',
            sheetFormatPr: { defaultRowHeight: '15' },
            pageMargins: { left: '0.7', right: '0.7', top: '0.75', bottom: '0.75', header: '0.3', footer: '0.3' },
            headerFooter: { attrs: {}, oddHeader: 'Hello' }
        });
        const back = m.parseSheetConfig(out);
        expect(back.dimension).toBe('A1:C3');
        expect(back.headerFooter.oddHeader).toBe('Hello');
    });
});

describe('extra/sml-workbook-config', () => {
    test('roundtrip', () => {
        const m = smlWorkbookConfig.factory(xml);
        const cfg = { fileVersion: { appName: 'xl' }, bookViews: [{ activeTab: '0' }] };
        const out = m.renderWorkbookConfig(cfg);
        const back = m.parseWorkbookConfig(out);
        expect(back.fileVersion.appName).toBe('xl');
        expect(back.bookViews.length).toBe(1);
    });
});

describe('extra/sml-form-controls', () => {
    test('passthrough', () => {
        const m = smlFormControls.factory(_errors, xml);
        const node = m.parseControl('<root xmlns="x"/>');
        expect(node.name).toBe('root');
    });
});

describe('extra/pml-notes', () => {
    test('builds empty notes slide', () => {
        const m = pmlNotes.factory(xml);
        const text = m.buildEmptyNotesSlide();
        expect(text).toContain('<p:notes');
        const ns = m.parseNotesSlide(text);
        expect(ns.cSld).toBeTruthy();
    });
});

describe('extra/pml-layouts-typed', () => {
    test('build + parse layout type', () => {
        const m = pmlLayoutsTyped.factory(xml);
        const text = m.buildLayout({ type: 'titleOnly' });
        expect(m.parseLayoutType(text)).toBe('titleOnly');
        expect(m.LAYOUT_TYPES).toContain('blank');
    });
});

describe('extra/dml-chart-trendlines', () => {
    test('roundtrip', () => {
        const m = dmlChartTrendlines.factory(xml);
        const t = { name: 'Linear', trendlineType: 'linear', dispRSqr: true, dispEq: true };
        const back = m.parseTrendline(m.renderTrendline(t));
        expect(back.name).toBe('Linear');
        expect(back.trendlineType).toBe('linear');
        expect(back.dispRSqr).toBe(true);
    });
});

describe('extra/dml-chart-axes-advanced', () => {
    test('roundtrip', () => {
        const m = dmlChartAxesAdvanced.factory(xml);
        const a = { kind: 'valAx', majorTickMark: 'out', minorTickMark: 'none',
                    min: 0, max: 100, tickLblPos: 'nextTo' };
        const back = m.parseAxis(m.renderAxis(a));
        expect(back.majorTickMark).toBe('out');
        expect(back.min).toBe(0);
    });
});

describe('extra/dml-chart-3d', () => {
    test('view3D roundtrip', () => {
        const m = dmlChart3d.factory(xml);
        const v = { rotX: 15, rotY: 20, perspective: 30, rAngAx: true };
        const back = m.parseView3D(m.renderView3D(v));
        expect(back).toEqual(v);
    });
});

describe('extra/dml-chart-other-types', () => {
    test('TYPES + dispatcher', () => {
        const m = dmlChartOtherTypes.factory(xml);
        expect(m.TYPES).toContain('bubbleChart');
        const el = xml.el('c:bubbleChart', {});
        const p = m.parseChartByType(el);
        expect(p.kind).toBe('bubbleChart');
        const back = m.renderChartByType(p);
        expect(back.name).toBe('c:bubbleChart');
    });
});

describe('extra/math-advanced', () => {
    test('mathPr roundtrip', () => {
        const m = mathAdvanced.factory(xml);
        const mp = { brkBin: 'before', mathFont: 'Cambria Math', smallFrac: '0' };
        const back = m.parseMathPr(m.renderMathPr(mp));
        expect(back).toEqual(mp);
    });
});

describe('extra/dml-effects', () => {
    test('effectLst roundtrip', () => {
        const m = dmlEffects.factory(xml, _shared);
        const e = { effects: [{ kind: 'outerShdw', attrs: { blurRad: '40000', dist: '20000' }, children: [] }] };
        const back = m.parseEffectLst(m.renderEffectLst(e));
        expect(back.effects.length).toBe(1);
        expect(back.effects[0].kind).toBe('outerShdw');
    });
});

describe('extra/dml-fills-advanced', () => {
    test('gradFill roundtrip', () => {
        const m = dmlFillsAdvanced.factory(xml, _shared);
        const g = {
            attrs: { rotWithShape: '1' },
            stops: [
                { pos: '0',     color: { kind: 'srgbClr', attrs: { val: 'FF0000' } } },
                { pos: '100000', color: { kind: 'srgbClr', attrs: { val: '0000FF' } } }
            ],
            lin: { ang: '5400000', scaled: '0' }
        };
        const back = m.parseGradFill(m.renderGradFill(g));
        expect(back.stops.length).toBe(2);
        expect(back.stops[0].color.attrs.val).toBe('FF0000');
        expect(back.lin.ang).toBe('5400000');
    });

    test('blipFill', () => {
        const m = dmlFillsAdvanced.factory(xml, _shared);
        const b = { blip: { 'r:embed': 'rId5' }, mode: 'stretch' };
        const back = m.parseBlipFill(m.renderBlipFill(b));
        expect(back.blip['r:embed']).toBe('rId5');
        expect(back.mode).toBe('stretch');
    });
});

describe('extra/dml-shapes-advanced', () => {
    test('custGeom roundtrip', () => {
        const m = dmlShapesAdvanced.factory(xml);
        const c = { paths: [{
            attrs: { w: '100', h: '100' },
            commands: [
                { op: 'moveTo', points: [{ x: '0', y: '0' }] },
                { op: 'lnTo',   points: [{ x: '100', y: '0' }] },
                { op: 'close',  points: [] }
            ]
        }]};
        const back = m.parseCustGeom(m.renderCustGeom(c));
        expect(back.paths.length).toBe(1);
        expect(back.paths[0].commands.length).toBe(3);
        expect(back.paths[0].commands[1].points[0].x).toBe('100');
    });
});

describe('extra/dml-xdr-advanced', () => {
    test('passthrough', () => {
        const m = dmlXdrAdvanced.factory(xml);
        const c = m.parseConnector(xml.el('xdr:cxnSp', { id: '1' }));
        expect(c.attrs.id).toBe('1');
    });
});

describe('extra/transitional', () => {
    test('namespace mapping', () => {
        const m = transitional.factory(xml);
        const node = xml.el('w:document', {
            'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        });
        const strict = m.toStrict(node);
        expect(strict.attrs['xmlns:w']).toBe('http://purl.oclc.org/ooxml/wordprocessingml/main');
        const back = m.fromStrict(strict);
        expect(back.attrs['xmlns:w']).toBe('http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    });
});

describe('extra/legacy-vml', () => {
    test('passthrough', () => {
        const m = legacyVml.factory(xml);
        const node = m.parseVml('<v:rect xmlns:v="x" id="r1"/>');
        expect(node.name).toBe('v:rect');
        expect(m.renderVml(node)).toContain('v:rect');
    });
});
