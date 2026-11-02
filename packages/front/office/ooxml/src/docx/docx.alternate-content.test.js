// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `docx.read` option `alternateContent`: `'fallback'` (the
 * default) resolves every `mc:AlternateContent` to its Fallback; `'keep'`
 * keeps it verbatim for the write, and leaves a chart referenced only from
 * a kept Choice unconsumed, so `carry` writes it back.
 */

import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const d = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const chartMod = rt.resolve('drawingmlChart');
const { ContractError } = rt.resolve('ooxmlErrors');
const enc = new TextEncoder();
const dec = new TextDecoder();

const NS = ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
    + ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';

const AC_TEXT = '<mc:AlternateContent><mc:Choice Requires="w14"><w:r><w:t>Modern</w:t></w:r></mc:Choice>'
    + '<mc:Fallback><w:r><w:t>Fallback</w:t></w:r></mc:Fallback></mc:AlternateContent>';
const AC_CHART = '<mc:AlternateContent><mc:Choice Requires="c"><w:r><w:drawing><wp:inline>'
    + '<wp:extent cx="914400" cy="914400"/><wp:docPr id="7" name="Chart"/><a:graphic>'
    + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdC"/></a:graphicData>'
    + '</a:graphic></wp:inline></w:drawing></w:r></mc:Choice>'
    + '<mc:Fallback><w:r><w:t>[chart]</w:t></w:r></mc:Fallback></mc:AlternateContent>';

/** A package: the document body `body`, a header holding `header` when given, a chart part when `chart`. */
function docxBytes(body, { header, chart } = {}) {
    const pkg = opc.empty();
    const rels = [];
    opc.setPart(pkg, '/word/document.xml', enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document${NS} mc:Ignorable="w14"><w:body>${body}`
        + (header ? '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/></w:sectPr>' : '')
        + '</w:body></w:document>'), d.CT_DOCUMENT);
    if (header) {
        opc.setPart(pkg, '/word/header1.xml', enc.encode(
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr${NS} mc:Ignorable="w14">${header}</w:hdr>`),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
        rels.push({ Id: 'rIdH', Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', Target: 'header1.xml' });
    }
    if (chart) {
        opc.setPart(pkg, '/word/charts/chart1.xml', chart, chartMod.CT_CHART);
        rels.push({ Id: 'rIdC', Type: chartMod.REL_TYPE_CHART, Target: 'charts/chart1.xml' });
    }
    opc.setRels(pkg, '/word/document.xml', rels);
    opc.setRels(pkg, '/', [{ Id: 'rId1', Type: d.REL_TYPE_DOC, Target: 'word/document.xml' }]);
    return opc.write(pkg);
}

/** Write a read result back through the documented save path. */
function saveBack(r) {
    return d.write(r.document, {
        styles: r.styles, settings: r.settings, numbering: r.numbering, headers: r.headers, footers: r.footers,
        hyperlinks: r.hyperlinks, images: r.images, carry: r
    });
}

const partText = (bytes, name) => {
    const pkg = opc.read(bytes);
    return dec.decode(pkg.parts[name]);
};

describe('docx.read alternateContent', () => {
    test('default and fallback: every mc:AlternateContent resolves to its Fallback, as before', () => {
        const bytes = docxBytes(`<w:p>${AC_TEXT}</w:p>`);
        for (const opts of [undefined, {}, { alternateContent: 'fallback' }]) {
            const r = d.read(bytes, opts);
            expect(r.document.body[0].children[0].children[0].value).toBe('Fallback');
            expect(partText(saveBack(r), '/word/document.xml')).not.toContain('mc:AlternateContent');
        }
    });

    test('keep: the element stays in place and is written back with both branches', () => {
        const r = d.read(docxBytes(`<w:p>${AC_TEXT}</w:p>`), { alternateContent: 'keep' });
        const written = partText(saveBack(r), '/word/document.xml');
        expect(written).toContain('<mc:AlternateContent><mc:Choice Requires="w14"><w:r><w:t>Modern</w:t></w:r></mc:Choice>');
        expect(written).toContain('<mc:Fallback><w:r><w:t>Fallback</w:t></w:r></mc:Fallback></mc:AlternateContent>');
        const again = partText(saveBack(d.read(saveBack(r), { alternateContent: 'keep' })), '/word/document.xml');
        expect(again).toBe(written);
    });

    test('keep: a story part keeps its mc:AlternateContent too', () => {
        const r = d.read(docxBytes('<w:p><w:r><w:t>Body</w:t></w:r></w:p>', { header: `<w:p>${AC_TEXT}</w:p>` }), { alternateContent: 'keep' });
        const out = saveBack(r);
        const name = Object.keys(opc.read(out).parts).find((n) => /\/word\/header\d*\.xml$/.test(n));
        expect(partText(out, name)).toContain('<mc:Choice Requires="w14"><w:r><w:t>Modern</w:t></w:r></mc:Choice>');
    });

    test('keep: a chart referenced only from a kept Choice is left unconsumed and carried back with its id', () => {
        const chart = chartMod.bytesOf(chartMod.barChart({ series: [{ name: 'S', categories: ['a'], values: [1] }] }));
        const bytes = docxBytes(`<w:p>${AC_CHART}</w:p>`, { chart });
        const fallback = d.read(bytes);
        expect(Object.keys(fallback.charts || {})).toEqual(['rIdC']);
        expect(fallback.unmodelledParts.map((u) => u.partName)).not.toContain('/word/charts/chart1.xml');
        const kept = d.read(bytes, { alternateContent: 'keep' });
        expect(Object.keys(kept.charts || {})).toEqual([]);
        expect(kept.unmodelledParts.map((u) => u.partName)).toContain('/word/charts/chart1.xml');
        const out = opc.read(saveBack(kept));
        const rel = (out.rels['/word/document.xml'] || []).find((x) => x.Id === 'rIdC');
        expect(rel && rel.Type).toBe(chartMod.REL_TYPE_CHART);
        const target = '/word/' + rel.Target.replace(/^\.?\//, '');
        expect(out.parts[target]).toEqual(chart);
        expect(dec.decode(out.parts['/word/document.xml'])).toContain('<c:chart r:id="rIdC"/>');
    });

    test('another value throws docx/invalid-alternate-content before reading', () => {
        for (const bad of ['Keep', true, null, 1]) {
            let caught;
            try { d.read(new Uint8Array(0), { alternateContent: bad }); } catch (e) { caught = e; }
            expect(caught).toBeInstanceOf(ContractError);
            expect(caught.code).toBe('docx/invalid-alternate-content');
        }
    });
});
