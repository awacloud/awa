// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The relationships of the written parts: ids the writer
 * keeps are never claimed again, and with `carry` a written part's
 * references are written back from its source part (settings, numbering,
 * a VML picture in a header, a chart in raw content, a written chart's
 * own relationships).
 */

import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const d = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const chartMod = rt.resolve('drawingmlChart');
const enc = new TextEncoder();

const NS = ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
    + ' xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const XLSX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]);

/** A package from `parts` ({ name: [bytes or text, contentType] }) and `rels` ({ owner: [rel …] }). */
function pkgBytes(parts, rels) {
    const pkg = opc.empty();
    for (const [name, [data, ct]] of Object.entries(parts)) opc.setPart(pkg, name, typeof data === 'string' ? enc.encode(data) : data, ct);
    pkg.contentTypes.defaults.png = 'image/png';
    pkg.contentTypes.defaults.xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    for (const [owner, list] of Object.entries(rels)) opc.setRels(pkg, owner, list);
    opc.setRels(pkg, '/', [{ Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml' }]);
    return opc.write(pkg);
}
const doc = (body) => [`${XML}<w:document${NS}><w:body>${body}</w:body></w:document>`, d.CT_DOCUMENT];
const save = (r, withCarry = true) => opc.read(d.write(r.document, {
    styles: r.styles, settings: r.settings, numbering: r.numbering, headers: r.headers, footers: r.footers,
    hyperlinks: r.hyperlinks, images: r.images, danglingNumbering: 'keep', ...(withCarry ? { carry: r } : {})
}));
const relOf = (pkg, owner, id) => (pkg.rels[owner] || []).find((x) => x.Id === id);
const targetBytes = (pkg, owner, rel) => pkg.parts[rel.Target.startsWith('/') ? rel.Target
    : '/' + [...owner.slice(1).split('/').slice(0, -1), ...rel.Target.split('/')].reduce((a, p) => (p === '..' ? a.slice(0, -1) : [...a, p]), []).join('/')];

describe('docx.write: relationships of the written parts', () => {
    test('ids the writer keeps (a hyperlink, a header) are never claimed again', () => {
        const bytes = pkgBytes({
            '/word/document.xml': doc('<w:p><w:hyperlink r:id="rId2"><w:r><w:t>link</w:t></w:r></w:hyperlink></w:p>'
                + '<w:sectPr><w:headerReference w:type="default" r:id="rId4"/></w:sectPr>'),
            '/word/styles.xml': [`${XML}<w:styles${NS}/>`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'],
            '/word/settings.xml': [`${XML}<w:settings${NS}><w:zoom w:percent="100"/></w:settings>`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'],
            '/word/header1.xml': [`${XML}<w:hdr${NS}><w:p/></w:hdr>`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml']
        }, {
            '/word/document.xml': [
                { Id: 'rId1', Type: REL + 'styles', Target: 'styles.xml' },
                { Id: 'rId2', Type: REL + 'hyperlink', Target: 'https://example.com/', TargetMode: 'External' },
                { Id: 'rId3', Type: REL + 'settings', Target: 'settings.xml' },
                { Id: 'rId4', Type: REL + 'header', Target: 'header1.xml' }
            ]
        });
        for (const withCarry of [false, true]) {
            const out = save(d.read(bytes), withCarry);
            for (const [owner, list] of Object.entries(out.rels)) {
                const ids = list.map((x) => x.Id);
                expect([owner, ids.length]).toEqual([owner, new Set(ids).size]);
            }
        }
    });

    test('carry: settings.xml keeps its external attachedTemplate, numbering.xml its picture bullet', () => {
        const bytes = pkgBytes({
            '/word/document.xml': doc('<w:p/>'),
            '/word/settings.xml': [`${XML}<w:settings${NS}><w:attachedTemplate r:id="rIdT"/></w:settings>`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'],
            '/word/numbering.xml': [`${XML}<w:numbering${NS}><w:numPicBullet w:numPicBulletId="0"><w:pict><v:shape id="b" style="width:9pt;height:9pt"><v:imagedata r:id="rIdP" o:title=""/></v:shape></w:pict></w:numPicBullet>`
                + '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlPicBulletId w:val="0"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'],
            '/word/media/bullet.png': [PNG, 'image/png']
        }, {
            '/word/document.xml': [
                { Id: 'rId2', Type: REL + 'settings', Target: 'settings.xml' },
                { Id: 'rId3', Type: REL + 'numbering', Target: 'numbering.xml' }
            ],
            '/word/settings.xml': [{ Id: 'rIdT', Type: REL + 'attachedTemplate', Target: 'file:///C:/Templates/Normal.dotm', TargetMode: 'External' }],
            '/word/numbering.xml': [{ Id: 'rIdP', Type: REL + 'image', Target: 'media/bullet.png' }]
        });
        const out = save(d.read(bytes));
        expect(relOf(out, '/word/settings.xml', 'rIdT')).toMatchObject({ TargetMode: 'External', Target: 'file:///C:/Templates/Normal.dotm' });
        const bullet = relOf(out, '/word/numbering.xml', 'rIdP');
        expect(targetBytes(out, '/word/numbering.xml', bullet)).toEqual(PNG);
    });

    test('carry: a VML picture of a header keeps its image', () => {
        const bytes = pkgBytes({
            '/word/document.xml': doc('<w:p/><w:sectPr><w:headerReference w:type="default" r:id="rIdH"/></w:sectPr>'),
            '/word/header1.xml': [`${XML}<w:hdr${NS}><w:p><w:r><w:pict><v:shape id="w" style="width:90pt;height:90pt"><v:imagedata r:id="rIdV" o:title="logo"/></v:shape></w:pict></w:r></w:p></w:hdr>`,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'],
            '/word/media/logo.png': [PNG, 'image/png']
        }, {
            '/word/document.xml': [{ Id: 'rIdH', Type: REL + 'header', Target: 'header1.xml' }],
            '/word/header1.xml': [{ Id: 'rIdV', Type: REL + 'image', Target: 'media/logo.png' }]
        });
        const out = save(d.read(bytes));
        const name = Object.keys(out.parts).find((n) => /\/word\/header\d*\.xml$/.test(n));
        const rel = relOf(out, name, 'rIdV');
        expect(rel && rel.Type).toBe(REL + 'image');
        expect(targetBytes(out, name, rel)).toEqual(PNG);
    });

    test('carry: a chart in raw content keeps its part, and a written chart part its own relationships', () => {
        const chartXml = new TextDecoder().decode(chartMod.bytesOf(chartMod.barChart({ series: [{ name: 'S', categories: ['a'], values: [1] }] })))
            .replace('</c:chartSpace>', '<c:externalData r:id="rIdE"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>')
            .replace('<c:chartSpace ', '<c:chartSpace xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
        const inline = (id) => `<w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="${id}" name="Chart"/>`
            + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdC${id}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
        const inTextBox = '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
            + '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>'
            + '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="2000000" cy="2000000"/><wp:wrapNone/><wp:docPr id="9" name="Box"/>'
            + '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:spPr/><wps:txbx><w:txbxContent>'
            + `<w:p>${inline(2)}</w:p></w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
        const bytes = pkgBytes({
            '/word/document.xml': doc(`<w:p>${inline(1)}</w:p><w:p>${inTextBox}</w:p>`),
            '/word/charts/chart1.xml': [chartXml, chartMod.CT_CHART],
            '/word/charts/chart2.xml': [chartXml, chartMod.CT_CHART],
            '/word/embeddings/book1.xlsx': [XLSX, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
            '/word/embeddings/book2.xlsx': [XLSX, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        }, {
            '/word/document.xml': [
                { Id: 'rIdC1', Type: chartMod.REL_TYPE_CHART, Target: 'charts/chart1.xml' },
                { Id: 'rIdC2', Type: chartMod.REL_TYPE_CHART, Target: 'charts/chart2.xml' }
            ],
            '/word/charts/chart1.xml': [{ Id: 'rIdE', Type: REL + 'package', Target: '../embeddings/book1.xlsx' }],
            '/word/charts/chart2.xml': [{ Id: 'rIdE', Type: REL + 'package', Target: '../embeddings/book2.xlsx' }]
        });
        const out = save(d.read(bytes));
        const dec = new TextDecoder();
        // Every r:id of every written XML part resolves.
        for (const [name, data] of Object.entries(out.parts)) {
            if (!name.endsWith('.xml')) continue;
            for (const m of dec.decode(data).matchAll(/\br:(?:id|embed)="([^"]+)"/g)) {
                expect([name, m[1], !!relOf(out, name, m[1])]).toEqual([name, m[1], true]);
            }
        }
        // The raw chart's part is the one read.
        const raw = relOf(out, '/word/document.xml', 'rIdC2');
        expect(dec.decode(targetBytes(out, '/word/document.xml', raw))).toBe(chartXml);
    });

    test('carry: a footer chart part keeps its own relationships', () => {
        const chartXml = new TextDecoder().decode(chartMod.bytesOf(chartMod.barChart({ series: [{ name: 'S', categories: ['a'], values: [1] }] })))
            .replace('</c:chartSpace>', '<c:externalData r:id="rIdE"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>')
            .replace('<c:chartSpace ', '<c:chartSpace xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
        const bytes = pkgBytes({
            '/word/document.xml': doc('<w:p/><w:sectPr><w:footerReference w:type="default" r:id="rIdF"/></w:sectPr>'),
            '/word/footer1.xml': [`${XML}<w:ftr${NS}><w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="3" name="Chart"/>`
                + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdC"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:ftr>',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'],
            '/word/charts/chart1.xml': [chartXml, chartMod.CT_CHART],
            '/word/embeddings/book1.xlsx': [XLSX, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        }, {
            '/word/document.xml': [{ Id: 'rIdF', Type: REL + 'footer', Target: 'footer1.xml' }],
            '/word/footer1.xml': [{ Id: 'rIdC', Type: chartMod.REL_TYPE_CHART, Target: 'charts/chart1.xml' }],
            '/word/charts/chart1.xml': [{ Id: 'rIdE', Type: REL + 'package', Target: '../embeddings/book1.xlsx' }]
        });
        const out = save(d.read(bytes));
        const chartName = Object.keys(out.parts).find((n) => /\/word\/charts\/chart\d+\.xml$/.test(n));
        const rel = relOf(out, chartName, 'rIdE');
        expect(rel && rel.Type).toBe(REL + 'package');
        expect(targetBytes(out, chartName, rel)).toEqual(XLSX);
    });

    test('without carry, the settings relationships are written back too (T40 (c))', () => {
        const bytes = pkgBytes({
            '/word/document.xml': doc('<w:p/>'),
            '/word/settings.xml': [`${XML}<w:settings${NS}><w:attachedTemplate r:id="rIdT"/></w:settings>`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml']
        }, {
            '/word/document.xml': [{ Id: 'rId2', Type: REL + 'settings', Target: 'settings.xml' }],
            '/word/settings.xml': [{ Id: 'rIdT', Type: REL + 'attachedTemplate', Target: 'file:///T.dotm', TargetMode: 'External' }]
        });
        expect(save(d.read(bytes), false).rels['/word/settings.xml'])
            .toEqual([{ Id: 'rIdT', Type: REL + 'attachedTemplate', Target: 'file:///T.dotm', TargetMode: 'External' }]);
    });
});

describe('docx.write carry: an unedited chart part written back as read', () => {
    // A chart part holding what the chart model does not type: a c14 style
    // alternate content and the shape properties of its plot area.
    const chartXml = new TextDecoder().decode(chartMod.bytesOf(chartMod.barChart({ series: [{ name: 'S', categories: ['a'], values: [1] }] })))
        .replace('<c:chartSpace ', '<c:chartSpace xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:c14="http://schemas.microsoft.com/office/drawing/2007/8/2/chart" ')
        .replace('<c:chart>', '<mc:AlternateContent><mc:Choice Requires="c14"><c14:style val="102"/></mc:Choice><mc:Fallback><c:style val="2"/></mc:Fallback></mc:AlternateContent><c:chart>');
    const bytes = () => pkgBytes({
        '/word/document.xml': doc('<w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Chart"/>'
            + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdC"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'),
        '/word/charts/chart1.xml': [chartXml, chartMod.CT_CHART]
    }, {
        '/word/document.xml': [{ Id: 'rIdC', Type: chartMod.REL_TYPE_CHART, Target: 'charts/chart1.xml' }]
    });
    const chartPart = (out) => new TextDecoder().decode(out.parts[Object.keys(out.parts).find((n) => /\/word\/charts\/chart\d+\.xml$/.test(n))]);
    const chartOf = (r) => {
        let found = null;
        (function walk(v) {
            if (!v || typeof v !== 'object' || found) return;
            if (v.type === 'drawing' && v.chart) { found = v.chart; return; }
            for (const x of Object.values(v)) walk(x);
        })(r.document);
        return found;
    };

    test('with carry, an unedited chart is written byte for byte, its alternate content kept', () => {
        expect(chartPart(save(d.read(bytes())))).toBe(chartXml);
        expect(chartPart(save(d.read(bytes(), { alternateContent: 'keep' })))).toBe(chartXml);
    });

    test('an edited chart is written from the model', () => {
        const r = d.read(bytes());
        chartOf(r).series[0].values[0] = 7;
        const out = chartPart(save(r));
        expect(out).not.toBe(chartXml);
        expect(out).toContain('<c:v>7</c:v>');
    });

    test('without carry, the chart is written from the model (as before)', () => {
        expect(chartPart(save(d.read(bytes()), false))).not.toContain('c14:style');
    });
});
