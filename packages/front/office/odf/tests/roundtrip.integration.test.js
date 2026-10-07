// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Integration test — wires the odf factories through fw's `ModuleRuntime`
 * and verifies roundtrip read(write(doc)) for `.odt`.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { deflate } from '@awacloud/fw/io/compress/deflate.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman } from '@awacloud/fw/io/compress/huffman.js';
import { lz77 } from '@awacloud/fw/io/compress/lz77.js';
import { zip } from '@awacloud/fw/io/compress/zip.js';
import { crc32 } from '@awacloud/fw/io/calc/crc32.js';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import * as odfMods from '../src/main.js';

const runtime = new ModuleRuntime();
for (const m of [bitstream, huffman, lz77, deflate, crc32, zip, fwXml, ...odfMods.modules]) {
    runtime.register(m);
}

describe('odf × fw runtime — roundtrip', () => {
    test('odt — hello world paragraph', () => {
        const o = runtime.resolve('odt');
        const doc = { body: [o.paragraph('Hello, world.')] };
        const back = o.read(o.write(doc));
        expect(back.body).toHaveLength(1);
        expect(back.body[0].runs[0].value).toBe('Hello, world.');
    });

    test('odt — multi-paragraph + styles', () => {
        const o = runtime.resolve('odt');
        const doc = {
            body: [
                o.paragraph('Title', { styleName: 'Title' }),
                o.paragraph('Body paragraph.')
            ]
        };
        const back = o.read(o.write(doc));
        expect(back.body).toHaveLength(2);
        expect(back.body[0].styleName).toBe('Title');
        expect(back.body[1].runs[0].value).toBe('Body paragraph.');
    });

    test('odt — meta survives roundtrip', () => {
        const o = runtime.resolve('odt');
        const doc = { body: [o.paragraph('x')] };
        const bytes = o.write(doc, {
            meta: { title: 'Doc', creator: 'Alice',
                    date: '2026-05-13T10:00:00',
                    generator: 'awa-test' }
        });
        const back = o.read(bytes);
        expect(back.meta.title).toBe('Doc');
        expect(back.meta.creator).toBe('Alice');
        expect(back.meta.generator).toBe('awa-test');
    });

    test('odt — fromText / toText', () => {
        const o = runtime.resolve('odt');
        const doc = o.fromText(['Line A', 'Line B', 'Line C']);
        const back = o.read(o.write(doc));
        expect(o.toText(back)).toBe('Line A\nLine B\nLine C');
    });

    test('odt — span styles are preserved', () => {
        const o = runtime.resolve('odt');
        const para = runtime.resolve('textParagraph');
        const doc = {
            body: [
                {
                    type: 'paragraph',
                    runs: [
                        { type: 'text', value: 'plain ' },
                        { type: 'span', value: 'bold', styleName: 'T1' },
                        { type: 'text', value: ' tail' }
                    ]
                }
            ]
        };
        const back = o.read(o.write(doc));
        expect(back.body[0].runs).toHaveLength(3);
        expect(back.body[0].runs[1].styleName).toBe('T1');
        expect(para.textOf(back.body[0])).toBe('plain bold tail');
    });

    test('odt — rich body (heading + list + section + table) roundtrips', () => {
        const o = runtime.resolve('odt');
        const heading = runtime.resolve('textHeading');
        const para = runtime.resolve('textParagraph');
        const tableMod = runtime.resolve('tableTable');
        const automatic = runtime.resolve('styleAutomatic');
        const pageLayout = runtime.resolve('stylePageLayout');
        const masterPage = runtime.resolve('styleMasterPage');
        const xml = runtime.resolve('xml');
        const stylesMod = runtime.resolve('odfStyles');

        const tableModel = {
            type: 'table', name: 'T1',
            columns: [{ styleName: 'co1' }, { styleName: 'co1' }],
            headerRows: 1,
            rows: [
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'string', value: 'h1', children: [] },
                    { type: 'cell', valueType: 'string', value: 'h2', children: [] }] },
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'string', value: 'a', children: [] },
                    { type: 'cell', valueType: 'string', value: 'b', children: [] }] },
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'string', value: 'c', children: [] },
                    { type: 'cell', valueType: 'string', value: 'd', children: [] }] }
            ]
        };
        const tableEl = tableMod.renderTable(tableModel);

        const doc = {
            body: [
                heading.heading('My Title', { outlineLevel: 1, styleName: 'H1' }),
                para.paragraph('Intro paragraph.'),
                { type: 'list', styleName: 'L1', items: [
                    { children: [para.paragraph('first item')] },
                    { children: [para.paragraph('second item')] }
                ] },
                { type: 'section', name: 'S1', children: [
                    para.paragraph('inside section') ] },
                tableEl
            ]
        };

        const styles = stylesMod.empty();
        const auto = automatic.render({
            styles: [
                { name: 'P1', family: 'paragraph',
                  properties: { paragraph: { 'fo:text-align': 'center' } } }
            ]
        });
        // splice typed auto-styles into the styles.xml automaticStyles bucket
        for (const c of auto.children) styles.automaticStyles.push(c);
        styles.styles.push(pageLayout.renderPageLayout({
            name: 'pm1',
            properties: { 'fo:page-width': '21cm', 'fo:page-height': '29.7cm' }
        }));
        styles.masterStyles.push(masterPage.renderMasterPage({
            name: 'Standard', pageLayoutName: 'pm1'
        }));

        const bytes = o.write(doc, { styles });
        const back = o.read(bytes);

        expect(back.body[0].type).toBe('heading');
        expect(back.body[0].outlineLevel).toBe(1);
        expect(back.body[1].type).toBe('paragraph');
        expect(back.body[2].type).toBe('list');
        expect(back.body[2].items).toHaveLength(2);
        expect(back.body[3].type).toBe('section');
        expect(back.body[3].name).toBe('S1');
        // GAP-ODF-5 (office/BATCH_27/04): the table now round-trips as a TYPED
        // 'table' node instead of an 'unknown' raw element.
        const tableNode = back.body.find(n => n.type === 'table');
        expect(tableNode).toBeDefined();
        expect(back.body.some(n => n.type === 'unknown' && n.element && n.element.name === 'table:table')).toBe(false);

        // styles.xml preserved automatic styles + page layout + master
        expect(back.styles.automaticStyles.length).toBeGreaterThan(0);
        const pl = back.styles.styles.find(e => e.name === 'style:page-layout');
        expect(pl).toBeDefined();
        const mp = back.styles.masterStyles.find(e => e.name === 'style:master-page');
        expect(mp).toBeDefined();
        // silence unused warnings
        void xml;
    });

    test('ods — 2 sheets with typed cells + formula', () => {
        const o = runtime.resolve('ods');
        const para = runtime.resolve('textParagraph');
        const tableMod = runtime.resolve('tableTable');
        void tableMod; void para;

        const sheet1 = {
            type: 'table', name: 'Numbers', columns: [], rows: [
                // header
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'string', value: 'n', children: [] },
                    { type: 'cell', valueType: 'string', value: 'd', children: [] }
                ] },
                // data
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'float', value: '1', children: [] },
                    { type: 'cell', valueType: 'date', value: '2026-01-01', children: [] }
                ] },
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'float', value: '2', children: [] },
                    { type: 'cell', valueType: 'date', value: '2026-02-01', children: [] }
                ] },
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'float', value: '3',
                      formula: 'of:=SUM(A1:A3)', children: [] },
                    { type: 'cell', valueType: 'date', value: '2026-03-01', children: [] }
                ] }
            ]
        };
        const sheet2 = {
            type: 'table', name: 'Strings', columns: [], rows: [
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'string', value: 'h', children: [] }
                ] },
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'string', value: 'a', children: [] }
                ] },
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'string', value: 'b', children: [] }
                ] },
                { type: 'row', cells: [
                    { type: 'cell', valueType: 'string', value: 'c', children: [] }
                ] }
            ]
        };

        const doc = { spreadsheet: { tables: [sheet1, sheet2] } };
        const bytes = o.write(doc);
        const back = o.read(bytes);
        expect(back.spreadsheet.tables).toHaveLength(2);
        expect(back.spreadsheet.tables[0].name).toBe('Numbers');
        expect(back.spreadsheet.tables[0].rows[1].cells[0].valueType).toBe('float');
        expect(back.spreadsheet.tables[0].rows[1].cells[1].valueType).toBe('date');
        expect(back.spreadsheet.tables[0].rows[1].cells[1].value).toBe('2026-01-01');
        const formulaCell = back.spreadsheet.tables[0].rows[3].cells[0];
        expect(formulaCell.formula).toBe('of:=SUM(A1:A3)');
        expect(back.spreadsheet.tables[1].name).toBe('Strings');
    });

    test('odp — 3 slides with placeholders + frames + notes', () => {
        const o = runtime.resolve('odp');
        const xml = runtime.resolve('xml');
        const para = runtime.resolve('textParagraph');
        const presentation = runtime.resolve('presentationStyle');

        const titlePlaceholder = presentation.renderPlaceholder({
            objectType: 'title', x: '1cm', y: '1cm', width: '10cm', height: '2cm'
        });
        const contentPlaceholder = presentation.renderPlaceholder({
            objectType: 'outline', x: '1cm', y: '4cm', width: '20cm', height: '10cm'
        });
        const noteContent = para.renderParagraph(para.paragraph('Speaker note text.'));

        const doc = {
            slides: [
                o.slide('Title', { masterPageName: 'Default', layoutName: 'AL1', frames: [
                    { type: 'frame', name: 'titleFrame', child: { kind: 'text-box',
                        children: [
                            para.renderParagraph(para.paragraph('Welcome')),
                            titlePlaceholder
                        ], attrs: {} } }
                ] }),
                o.slide('Body', { masterPageName: 'Default', layoutName: 'AL2', frames: [
                    { type: 'frame', name: 'contentFrame', child: { kind: 'text-box',
                        children: [
                            para.renderParagraph(para.paragraph('First bullet')),
                            para.renderParagraph(para.paragraph('Second bullet')),
                            contentPlaceholder
                        ], attrs: {} } }
                ], notes: { body: [noteContent] } }),
                o.slide('End', { masterPageName: 'Default' })
            ]
        };

        const bytes = o.write(doc);
        const back = o.read(bytes);
        expect(back.slides).toHaveLength(3);
        expect(back.slides.map(s => s.name)).toEqual(['Title', 'Body', 'End']);
        expect(back.slides[0].masterPageName).toBe('Default');
        expect(back.slides[0].layoutName).toBe('AL1');
        // Title slide has a frame containing a placeholder
        const titleFrame = back.slides[0].frames[0];
        expect(titleFrame).toBeDefined();
        const titleTb = titleFrame.child;
        expect(titleTb.kind).toBe('text-box');
        const hasTitlePh = titleTb.children.some(c => c.name === 'presentation:placeholder'
            && c.attrs['presentation:object'] === 'title');
        expect(hasTitlePh).toBe(true);
        // Body slide has notes
        expect(back.slides[1].notes).toBeDefined();
        expect(back.slides[1].notes.body.length).toBeGreaterThan(0);
        void xml;
    });

    test('odt — tracked changes container + inline markers roundtrip', () => {
        const o = runtime.resolve('odt');
        const tracked = runtime.resolve('textTracked');
        const para = runtime.resolve('textParagraph');
        const xml = runtime.resolve('xml');

        const trackedEl = tracked.renderTrackedChanges({
            trackedChanges: [
                { id: 'r1', kind: 'insertion',     creator: 'Alice', date: '2026-05-13T10:00:00' },
                { id: 'r2', kind: 'deletion',      creator: 'Bob',   date: '2026-05-13T11:00:00' },
                { id: 'r3', kind: 'format-change', creator: 'Carol', date: '2026-05-13T12:00:00' }
            ]
        });
        const startMarker = tracked.renderChangeMarker({ kind: 'text:change-start', id: 'r1' });
        const endMarker   = tracked.renderChangeMarker({ kind: 'text:change-end',   id: 'r1' });

        const paraEl = para.renderParagraph({
            type: 'paragraph', runs: [{ type: 'text', value: 'hello' }]
        });
        // Splice markers around the run children
        paraEl.children.unshift(startMarker);
        paraEl.children.push(endMarker);

        const doc = { body: [trackedEl, paraEl] };
        const bytes = o.write(doc);
        const back = o.read(bytes);

        // tracked-changes survives as raw unknown body node
        const trEl = back.body.find(n => n.type === 'unknown'
            && n.element && n.element.name === 'text:tracked-changes');
        expect(trEl).toBeDefined();
        const reParsed = tracked.parseTrackedChanges(trEl.element);
        expect(reParsed.trackedChanges).toHaveLength(3);
        expect(reParsed.trackedChanges.map(r => r.kind)).toEqual(['insertion', 'deletion', 'format-change']);

        // Paragraph still has the inline markers (raw XML inside .runs unknown or _extras)
        const para0 = back.body.find(n => n.type === 'paragraph');
        expect(para0).toBeDefined();
        const serialized = xml.serializeNode(para.renderParagraph(para0));
        expect(serialized).toContain('text:change-start');
        expect(serialized).toContain('text:change-end');
    });

    test('odt — draw:rect + draw:custom-shape survive roundtrip', () => {
        const o = runtime.resolve('odt');
        const shape = runtime.resolve('drawShape');
        const para = runtime.resolve('textParagraph');
        const xml = runtime.resolve('xml');

        const rect = shape.renderShape({
            kind: 'draw:rect',
            attrs: { 'svg:x': '1cm', 'svg:y': '1cm', 'svg:width': '5cm', 'svg:height': '3cm',
                     'draw:name': 'rect1' },
            children: []
        });
        const custom = shape.renderShape({
            kind: 'draw:custom-shape',
            attrs: { 'svg:width': '4cm', 'svg:height': '4cm', 'draw:name': 'cust1' },
            children: [],
            enhancedGeometry: { attrs: { 'svg:viewBox': '0 0 100 100', 'draw:type': 'rectangle' } }
        });
        // Wrap shapes inside a frame? At L3 shapes appear directly in a paragraph
        // or inside <draw:frame>. ODT preserves unknowns at body level, so we
        // attach via a frame-like wrapper paragraph.
        const wrap = para.renderParagraph(para.paragraph('shapes follow'));
        wrap.children.push(rect, custom);

        const doc = { body: [wrap] };
        const bytes = o.write(doc);
        const back = o.read(bytes);
        const p0 = back.body[0];
        const ser = xml.serializeNode(para.renderParagraph(p0));
        expect(ser).toContain('<draw:rect');
        expect(ser).toContain('draw:name="rect1"');
        expect(ser).toContain('<draw:custom-shape');
        expect(ser).toContain('<draw:enhanced-geometry');
    });

    test('chart — parseBytes / bytesOf roundtrip', () => {
        const chart = runtime.resolve('chartChart');
        const model = {
            type: 'chart', chartClass: 'chart:bar',
            plotArea: {
                axes: [{ kind: 'axis', attrs: { 'chart:dimension': 'x' } },
                       { kind: 'axis', attrs: { 'chart:dimension': 'y' } }],
                series: [{ kind: 'series',
                    attrs: { 'chart:values-cell-range-address': 'Sheet1.A1:A3' },
                    dataPoints: [{ kind: 'data-point', attrs: { 'chart:repeated': '3' } }] }]
            }
        };
        const bytes = chart.bytesOf(model);
        const back = chart.parseBytes(bytes);
        expect(back.chartClass).toBe('chart:bar');
        expect(back.plotArea.axes).toHaveLength(2);
        expect(back.plotArea.series).toHaveLength(1);
        expect(back.plotArea.series[0].dataPoints).toHaveLength(1);
    });

    test('math — parseBytes / bytesOf roundtrip preserves MathML', () => {
        const math = runtime.resolve('mathMath');
        const xml = runtime.resolve('xml');
        const el = xml.parse('<math:math><math:mrow><math:mi>a</math:mi><math:mo>+</math:mo><math:mn>1</math:mn></math:mrow></math:math>');
        const model = math.parseMath(el);
        const bytes = math.bytesOf(model);
        const back = math.parseBytes(bytes);
        const ser = xml.serialize(back.xml);
        expect(ser).toContain('<math:mi>a</math:mi>');
        expect(ser).toContain('<math:mn>1</math:mn>');
    });

    test('odp — slide with anim:par block', () => {
        const o = runtime.resolve('odp');
        const animations = runtime.resolve('odpAnimations');
        const xml = runtime.resolve('xml');

        const animEl = animations.renderAnimations({
            kind: 'anim:par',
            attrs: { 'presentation:node-type': 'timing-root' },
            children: [
                { kind: 'anim:seq', attrs: {}, children: [
                    { kind: 'anim:set',
                      attrs: { 'smil:attributeName': 'visibility', 'smil:to': 'visible' },
                      children: [] }
                ] }
            ]
        });

        const doc = {
            slides: [
                {
                    type: 'slide', name: 'SlideA',
                    masterPageName: 'Default', frames: [],
                    _extras: { children: [animEl] }
                }
            ]
        };
        const bytes = o.write(doc);
        const back = o.read(bytes);
        expect(back.slides).toHaveLength(1);
        // Confirm the anim element survived into the slide's raw children
        const s0 = back.slides[0];
        const extrasChildren = (s0._extras && s0._extras.children) || [];
        const hasAnim = extrasChildren.some(c => c.name === 'anim:par');
        expect(hasAnim).toBe(true);
        void xml;
    });

    test('odt — office:forms with button + text controls', () => {
        const o = runtime.resolve('odt');
        const forms = runtime.resolve('formForms');
        const para = runtime.resolve('textParagraph');
        const xml = runtime.resolve('xml');

        const formsEl = forms.renderOfficeForms({
            forms: [
                { name: 'F1', attrs: { 'form:name': 'F1' }, controls: [
                    { kind: 'form:button', attrs: { 'form:name': 'b1', 'form:label': 'Submit' } },
                    { kind: 'form:text',   attrs: { 'form:name': 't1', 'form:value': 'init' } }
                ] }
            ]
        });
        const doc = { body: [formsEl, para.renderParagraph(para.paragraph('after forms'))] };
        const bytes = o.write(doc);
        const back = o.read(bytes);
        const formsBack = back.body.find(n => n.type === 'unknown'
            && n.element && n.element.name === 'office:forms');
        expect(formsBack).toBeDefined();
        const m = forms.parseOfficeForms(formsBack.element);
        expect(m.forms[0].controls).toHaveLength(2);
        expect(m.forms[0].controls[0].kind).toBe('form:button');
        expect(m.forms[0].controls[0].attrs['form:label']).toBe('Submit');
        void xml;
    });

    test('odt — dr3d:scene with cube + light', () => {
        const o = runtime.resolve('odt');
        const dr3d = runtime.resolve('dr3dScene');
        const para = runtime.resolve('textParagraph');

        const sceneEl = dr3d.renderScene({
            type: 'dr3d-scene',
            attrs: { 'dr3d:projection': 'parallel', 'dr3d:vrp': '0 0 0' },
            lights: [{ kind: 'dr3d:light', attrs: { 'dr3d:diffuse-color': '#ffffff' } }],
            shapes: [{ kind: 'dr3d:cube', attrs: { 'dr3d:min-edge': '(-1 -1 -1)',
                                                   'dr3d:max-edge': '(1 1 1)' } }]
        });
        const wrap = para.renderParagraph(para.paragraph('scene below'));
        wrap.children.push(sceneEl);
        const doc = { body: [wrap] };
        const bytes = o.write(doc);
        const back = o.read(bytes);
        const xml2 = runtime.resolve('xml');
        const ser = xml2.serializeNode(para.renderParagraph(back.body[0]));
        expect(ser).toContain('<dr3d:scene');
        expect(ser).toContain('<dr3d:light');
        expect(ser).toContain('<dr3d:cube');
    });

    test('factories remain serialisable (worker-safe)', () => {
        for (const m of odfMods.modules) {
            const s = m.factory.toString();
            expect(s).toContain('function');
        }
    });
});

describe('write(read(x)) carries parts and sidecars', () => {
    const pkg = runtime.resolve('pkgPackage');
    const manifestMod = runtime.resolve('pkgManifest');
    const stylesMod = runtime.resolve('odfStyles');
    const shared = runtime.resolve('odfShared');
    const enc = (s) => new TextEncoder().encode(s);
    const dec = (b) => new TextDecoder().decode(b);

    const NS_ROOT = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
        + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
        + ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"'
        + ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
        + ' xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"'
        + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"'
        + ' xmlns:xlink="http://www.w3.org/1999/xlink"'
        + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
        + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
        + ' xmlns:dc="http://purl.org/dc/elements/1.1/"'
        + ' xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"'
        + ' xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"'
        + ' office:version="1.4"';
    const imageFrame = (href) => '<draw:frame text:anchor-type="as-char" svg:width="2cm" svg:height="2cm">'
        + `<draw:image xlink:href="${href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>`
        + '</draw:frame>';
    const BODIES = {
        odt: '<office:text><text:p>Logo: ' + imageFrame('Pictures/a.png') + '</text:p></office:text>',
        ods: '<office:spreadsheet><table:table table:name="S"><table:table-row>'
            + '<table:table-cell office:value-type="string"><text:p>a</text:p></table:table-cell>'
            + '</table:table-row></table:table></office:spreadsheet>',
        odp: '<office:presentation><draw:page draw:name="S1">'
            + '<draw:frame svg:width="2cm" svg:height="2cm" svg:x="1cm" svg:y="1cm">'
            + '<draw:image xlink:href="Pictures/x.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>'
            + '</draw:frame></draw:page></office:presentation>'
    };
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
    const THUMB = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
    const OTHER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xaa, 0xbb]);
    const CONF_DIR_TYPE = 'application/vnd.sun.xml.ui.configuration';

    /** First-party fixture built with the package's own pkg API. */
    function fixture(kind, picture) {
        const p = pkg.empty(shared.CT[kind.toUpperCase()]);
        pkg.setPart(p, 'content.xml', enc(`<office:document-content ${NS_ROOT}><office:body>${BODIES[kind]}</office:body></office:document-content>`), 'text/xml');
        pkg.setPart(p, 'styles.xml', enc(`<office:document-styles ${NS_ROOT}><office:styles>`
            + '<style:style style:name="Emphasis" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>'
            + '</office:styles></office:document-styles>'), 'text/xml');
        pkg.setPart(p, 'meta.xml', enc(`<office:document-meta ${NS_ROOT}><office:meta>`
            + '<dc:title>T</dc:title><meta:generator>LibreOffice/24.2</meta:generator>'
            + '</office:meta></office:document-meta>'), 'text/xml');
        pkg.setPart(p, 'settings.xml', enc(`<office:document-settings ${NS_ROOT}><office:settings>`
            + '<config:config-item-set config:name="ooo:view-settings">'
            + '<config:config-item config:name="VisibleAreaTop" config:type="int">0</config:config-item>'
            + '</config:config-item-set></office:settings></office:document-settings>'), 'text/xml');
        pkg.setPart(p, picture, PNG, 'image/png');
        pkg.setPart(p, 'Thumbnails/thumbnail.png', THUMB, 'image/png');
        if (kind === 'odt') pkg.setPart(p, 'Configurations2/accelerator/current.xml', new Uint8Array(0), '');
        manifestMod.setEntry(p.manifest, 'Configurations2/', CONF_DIR_TYPE);
        return pkg.write(p);
    }

    const entryOf = (p, fullPath) => p.manifest.entries.find(e => e.fullPath === fullPath);

    describe('odt', () => {
        const o = runtime.resolve('odt');
        const bytes0 = fixture('odt', 'Pictures/a.png');
        const p0 = pkg.read(bytes0);
        const doc = o.read(bytes0);
        const bytes1 = o.write(doc);
        const p1 = pkg.read(bytes1);

        test('every source part is carried, binaries byte-equal, the 0-byte part present', () => {
            for (const path of Object.keys(p0.parts)) expect(p1.parts[path]).toBeDefined();
            expect(p1.parts['Pictures/a.png']).toEqual(PNG);
            expect(p1.parts['Thumbnails/thumbnail.png']).toEqual(THUMB);
            expect(p1.parts['Configurations2/accelerator/current.xml']).toBeInstanceOf(Uint8Array);
            expect(p1.parts['Configurations2/accelerator/current.xml'].length).toBe(0);
        });

        test('manifest: source media types and the directory entry are carried', () => {
            expect(entryOf(p1, 'Pictures/a.png').mediaType).toBe('image/png');
            expect(entryOf(p1, 'Thumbnails/thumbnail.png').mediaType).toBe('image/png');
            expect(entryOf(p1, 'Configurations2/').mediaType).toBe(CONF_DIR_TYPE);
        });

        test('named styles and settings survive', () => {
            const back = o.read(bytes1);
            expect(back.styles.styles).toEqual(doc.styles.styles);
            expect(JSON.stringify(back.styles.styles)).toContain('Emphasis');
            expect(back.settings.itemSets.length).toBe(doc.settings.itemSets.length);
            expect(back.settings.itemSets.length).toBe(1);
        });

        test('meta: title kept, generator rewritten', () => {
            const meta = o.read(bytes1).meta;
            expect(meta.title).toBe('T');
            expect(meta.generator).toBe('@awacloud/odf');
        });

        test('the image is not broken: href emitted AND the part exists', () => {
            expect(dec(p1.parts['content.xml'])).toContain('xlink:href="Pictures/a.png"');
            expect(p1.parts['Pictures/a.png']).toEqual(PNG);
        });

        test('idempotence on parts', () => {
            const p2 = pkg.read(o.write(o.read(bytes1)));
            expect(p2.parts).toEqual(p1.parts);
        });

        test('precedence: opts.styles wins over doc.styles', () => {
            const p = pkg.read(o.write(doc, { styles: stylesMod.empty() }));
            expect(dec(p.parts['styles.xml'])).not.toContain('Emphasis');
        });

        test('precedence: doc.pictures wins over the carried part', () => {
            const p = pkg.read(o.write({ ...doc, pictures: { 'Pictures/a.png': OTHER } }));
            expect(p.parts['Pictures/a.png']).toEqual(OTHER);
        });

        test('deleting doc.package drops carried parts; deleting doc.meta still stamps the generator', () => {
            const d = o.read(bytes0);
            delete d.package;
            const p = pkg.read(o.write(d));
            expect(p.parts['Thumbnails/thumbnail.png']).toBeUndefined();
            expect(entryOf(p, 'Configurations2/')).toBeUndefined();
            delete d.meta;
            expect(o.read(o.write(d)).meta.generator).toBe('@awacloud/odf');
        });
    });

    for (const [kind, picture] of [['ods', 'Pictures/x.png'], ['odp', 'Pictures/x.png']]) {
        describe(kind, () => {
            const o = runtime.resolve(kind);
            const bytes0 = fixture(kind, picture);
            const p0 = pkg.read(bytes0);
            const doc = o.read(bytes0);
            const bytes1 = o.write(doc);
            const p1 = pkg.read(bytes1);

            test('every source part is carried with its media type', () => {
                for (const path of Object.keys(p0.parts)) expect(p1.parts[path]).toBeDefined();
                expect(p1.parts[picture]).toEqual(PNG);
                expect(p1.parts['Thumbnails/thumbnail.png']).toEqual(THUMB);
                expect(entryOf(p1, picture).mediaType).toBe('image/png');
                expect(entryOf(p1, 'Configurations2/').mediaType).toBe(CONF_DIR_TYPE);
            });

            test('sidecars survive, generator rewritten', () => {
                const back = o.read(bytes1);
                expect(back.styles.styles).toEqual(doc.styles.styles);
                expect(JSON.stringify(back.styles.styles)).toContain('Emphasis');
                expect(back.settings.itemSets.length).toBe(1);
                expect(back.meta.title).toBe('T');
                expect(back.meta.generator).toBe('@awacloud/odf');
            });

            test('idempotence on parts', () => {
                expect(pkg.read(o.write(o.read(bytes1))).parts).toEqual(p1.parts);
            });

            test('precedence: opts.styles wins; deleting doc.package drops carried parts', () => {
                expect(dec(pkg.read(o.write(doc, { styles: stylesMod.empty() })).parts['styles.xml'])).not.toContain('Emphasis');
                const d = o.read(bytes0);
                delete d.package;
                expect(pkg.read(o.write(d)).parts['Thumbnails/thumbnail.png']).toBeUndefined();
            });

            if (kind === 'odp') {
                test('the image frame href is emitted AND the part exists', () => {
                    expect(dec(p1.parts['content.xml'])).toContain(`xlink:href="${picture}"`);
                    expect(p1.parts[picture]).toEqual(PNG);
                });
            }
        });
    }
});
