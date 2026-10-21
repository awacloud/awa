// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Pictures and charts in story parts — headers, footers, footnotes,
 * endnotes, comments (BL-2229).
 *
 * Write: a drawing in a story part used to get no media / chart part and no
 * relationship in that part's table, so its `r:embed` / `r:id` dangled.
 * Read: story drawings were resolved against the DOCUMENT part's
 * relationships, so a header picture never came back, or came back as the
 * body picture that happened to share its rId.
 *
 * Oracle: every `r:embed` / `r:id` attribute of every written XML part names
 * a relationship of THAT part's own table whose target part exists.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const docx = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const xml = runtime.resolve('xml');
const rels = runtime.resolve('opcRelationships');
const chartMod = runtime.resolve('drawingmlChart');
const decoder = new TextDecoder();

const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';

// Distinct byte arrays (identity is the writer's dedup key).
const png = (tag) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, tag]);
const BODY_PNG = png(1);
const HEADER_PNG = png(2);

const para = (...children) => ({ type: 'paragraph', children });
const picture = (data) => para(docx.imageRun(data, { cx: 914400, cy: 914400 }));
const textPara = (t) => docx.paragraph(t);

/** Every relationship reference of the package that does not resolve. */
function danglingReferences(pkg) {
    const out = [];
    for (const [partName, bytes] of Object.entries(pkg.parts)) {
        if (!partName.endsWith('.xml') || partName.includes('/_rels/')) continue;
        const ids = new Map((pkg.rels[partName] || []).map((r) => [r.Id, r]));
        const walk = (n) => {
            if (!n || n.type !== 'element') return;
            for (const [k, v] of Object.entries(n.attrs || {})) {
                if (k !== 'r:embed' && k !== 'r:id' && k !== 'r:link') continue;
                const rel = ids.get(v);
                if (!rel) { out.push(`${partName}: ${k}="${v}" has no relationship`); continue; }
                if (rel.TargetMode === 'External') continue;
                const target = rels.resolveTarget(partName, rel.Target);
                if (!pkg.parts[target]) out.push(`${partName}: ${k}="${v}" → missing ${target}`);
            }
            for (const c of n.children || []) walk(c);
        };
        walk(xml.parse(decoder.decode(bytes)));
    }
    return out;
}

const firstDrawing = (body) => {
    let found = null;
    const visit = (n) => {
        if (found || !n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(visit); return; }
        if (n.type === 'drawing') { found = n; return; }
        if (n.children) visit(n.children);
    };
    visit(body);
    return found;
};

function writeWithHeader(headerBody, extra = {}) {
    return docx.write({
        type: 'document',
        body: [picture(BODY_PNG)],
        sectPr: { headerReferences: [{ type: 'default', rId: 'rIdH1' }] },
    }, { headers: { rIdH1: { type: 'header', body: headerBody } }, ...extra });
}

describe('docx story parts — pictures are written (BL-2229)', () => {
    test('the oracle goes red on a dangling r:embed (non-vacuity)', () => {
        const pkg = opc.read(docx.write({ type: 'document', body: [textPara('x')] }));
        pkg.parts['/word/document.xml'] = new TextEncoder().encode(
            '<w:document xmlns:w="w" xmlns:r="r"><w:body><a:blip r:embed="rId9"/></w:body></w:document>');
        expect(danglingReferences(pkg)).toEqual(['/word/document.xml: r:embed="rId9" has no relationship']);
    });

    test('a header picture: media part, header relationship, no dangling reference', () => {
        const pkg = opc.read(writeWithHeader([picture(HEADER_PNG)]));
        expect(danglingReferences(pkg)).toEqual([]);
        const headerRels = pkg.rels['/word/header1.xml'] || [];
        const img = headerRels.filter((r) => r.Type === REL_IMAGE);
        expect(img).toHaveLength(1);
        const part = rels.resolveTarget('/word/header1.xml', img[0].Target);
        expect(Array.from(pkg.parts[part])).toEqual(Array.from(HEADER_PNG));
    });

    test('footer, footnote, endnote and comment pictures resolve in their own parts', () => {
        const pkg = opc.read(docx.write({
            type: 'document',
            body: [textPara('body')],
            sectPr: { footerReferences: [{ type: 'default', rId: 'rIdF1' }] },
        }, {
            footers: { rIdF1: { type: 'footer', body: [picture(png(3))] } },
            footnotes: { notes: [{ id: 1, body: [picture(png(4))] }] },
            endnotes: { notes: [{ id: 1, body: [picture(png(5))] }] },
            comments: { comments: [{ id: 0, author: 'A', body: [picture(png(6))] }] },
        }));
        expect(danglingReferences(pkg)).toEqual([]);
        for (const part of ['/word/footer1.xml', '/word/footnotes.xml',
            '/word/endnotes.xml', '/word/comments.xml']) {
            expect({ part, images: (pkg.rels[part] || []).filter((r) => r.Type === REL_IMAGE).length })
                .toEqual({ part, images: 1 });
        }
        const media = Object.keys(pkg.parts).filter((p) => p.startsWith('/word/media/'));
        expect(media).toHaveLength(4);
    });

    test('the same bytes in the body and a header share one media part', () => {
        const pkg = opc.read(writeWithHeader([picture(BODY_PNG)]));
        expect(danglingReferences(pkg)).toEqual([]);
        const media = Object.keys(pkg.parts).filter((p) => p.startsWith('/word/media/'));
        expect(media).toHaveLength(1);
        const fromDoc = (pkg.rels['/word/document.xml'] || []).find((r) => r.Type === REL_IMAGE);
        const fromHeader = (pkg.rels['/word/header1.xml'] || []).find((r) => r.Type === REL_IMAGE);
        expect(rels.resolveTarget('/word/header1.xml', fromHeader.Target))
            .toBe(rels.resolveTarget('/word/document.xml', fromDoc.Target));
    });

    test('a picture and a hyperlink in one header get distinct relationship ids', () => {
        const link = docx.hyperlink('site', 'https://example.org/', { rId: 'rId1' });
        const pic = picture(HEADER_PNG);
        pic.children[0].children[0].embedRef = 'rId1';
        const pkg = opc.read(writeWithHeader([para(link), pic]));
        expect(danglingReferences(pkg)).toEqual([]);
        const ids = (pkg.rels['/word/header1.xml'] || []).map((r) => r.Id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toHaveLength(2);
    });

    test('a header chart: chart part and header relationship', () => {
        const spec = chartMod.barChart({ title: 'H', series: [{ name: 's', categories: ['a'], values: [1] }] });
        const pkg = opc.read(writeWithHeader([para(docx.chartRun(spec, { cx: '2in', cy: '1in' }))]));
        expect(danglingReferences(pkg)).toEqual([]);
        expect((pkg.rels['/word/header1.xml'] || []).filter((r) => r.Type === REL_CHART)).toHaveLength(1);
    });
});

describe('docx story parts — pictures are read from their own part (BL-2229)', () => {
    test('a header picture round-trips with its own bytes, not the body picture', () => {
        const back = docx.read(writeWithHeader([picture(HEADER_PNG)]));
        const header = Object.values(back.headers)[0];
        const d = firstDrawing(header.body);
        expect(d && d.image && Array.from(d.image.data)).toEqual(Array.from(HEADER_PNG));
        const body = firstDrawing(back.document.body);
        expect(Array.from(body.image.data)).toEqual(Array.from(BODY_PNG));
    });

    test('a header chart round-trips', () => {
        const spec = chartMod.barChart({ title: 'Head', series: [{ name: 's', categories: ['a'], values: [7] }] });
        const back = docx.read(writeWithHeader([para(docx.chartRun(spec, { cx: '2in', cy: '1in' }))]));
        const d = firstDrawing(Object.values(back.headers)[0].body);
        expect(d && d.kind).toBe('chart');
        expect(d.chart.title).toBe('Head');
    });

    test('read → write → read keeps every story picture and leaves nothing unmodelled', () => {
        const first = docx.read(docx.write({
            type: 'document', body: [picture(BODY_PNG)],
            sectPr: { headerReferences: [{ type: 'default', rId: 'rIdH1' }] },
        }, {
            headers: { rIdH1: { type: 'header', body: [picture(HEADER_PNG)] } },
            footnotes: { notes: [{ id: 1, body: [picture(png(7))] }] },
        }));
        expect(first.unmodelledParts.map((u) => u.partName)).toEqual([]);
        const again = opc.read(docx.write(first.document, {
            headers: first.headers, footnotes: first.footnotes, images: first.images,
        }));
        expect(danglingReferences(again)).toEqual([]);
        const media = Object.keys(again.parts).filter((p) => p.startsWith('/word/media/'));
        expect(media).toHaveLength(3);
    });
});
