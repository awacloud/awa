// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SVG pictures (A33): the Office 2016 extension of a
 * picture's `a:blip` (`asvg:svgBlip r:embed` pointing at an SVG part, the
 * blip's own `r:embed` at the PNG fallback) read as `svgRef` and
 * `image.svg`, written back from `image.svg`, in the document and in a
 * story part, core and large bundle.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';
import { docxLargeBundle } from '../bundles/docx-large.js';

const rt = ooxmlRuntime();
const core = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const large = (() => { const r = new ModuleRuntime(); r.registerAllDeep([docxLargeBundle]); return r.resolve('docxLargeBundle'); })();
const enc = new TextEncoder();
const td = new TextDecoder();

const NS = ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const SVG_URI = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';
const SVG_NS = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = enc.encode('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
const SVG2 = enc.encode('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');

/** One inline picture: the PNG at `png`, the SVG extension at `svg`. */
const picture = (png, svg) => '<w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/>'
    + '<wp:docPr id="1" name="Picture 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="Picture 1"/><pic:cNvPicPr/></pic:nvPicPr>'
    + `<pic:blipFill><a:blip r:embed="${png}"><a:extLst><a:ext uri="${SVG_URI}">`
    + `<asvg:svgBlip xmlns:asvg="${SVG_NS}" r:embed="${svg}"/></a:ext></a:extLst></a:blip>`
    + '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9525" cy="9525"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

/** A DOCX with an SVG picture in its body and another in its header. */
function source() {
    const pkg = opc.empty();
    const set = (name, data, ct) => opc.setPart(pkg, name, typeof data === 'string' ? enc.encode(data) : data, ct);
    set('/word/document.xml', `${XML}<w:document${NS}><w:body><w:p>${picture('rId2', 'rId3')}</w:p>`
        + '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/></w:sectPr></w:body></w:document>', core.CT_DOCUMENT);
    set('/word/header1.xml', `${XML}<w:hdr${NS}><w:p>${picture('rId1', 'rId2')}</w:p></w:hdr>`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
    set('/word/media/image1.png', PNG, 'image/png');
    set('/word/media/image2.svg', SVG, 'image/svg+xml');
    set('/word/media/image3.svg', SVG2, 'image/svg+xml');
    pkg.contentTypes.defaults.png = 'image/png';
    pkg.contentTypes.defaults.svg = 'image/svg+xml';
    opc.setRels(pkg, '/word/document.xml', [
        { Id: 'rId2', Type: REL + 'image', Target: 'media/image1.png' },
        { Id: 'rId3', Type: REL + 'image', Target: 'media/image2.svg' },
        { Id: 'rIdH', Type: REL + 'header', Target: 'header1.xml' }
    ]);
    opc.setRels(pkg, '/word/header1.xml', [
        { Id: 'rId1', Type: REL + 'image', Target: 'media/image1.png' },
        { Id: 'rId2', Type: REL + 'image', Target: 'media/image3.svg' }
    ]);
    opc.setRels(pkg, '/', [{ Id: 'rId1', Type: core.REL_TYPE_DOC, Target: 'word/document.xml' }]);
    return opc.write(pkg);
}

/** The writer lane's save path. */
const save = (api, r) => api.write(r.document, {
    styles: r.styles, settings: r.settings, numbering: r.numbering, headers: r.headers, footers: r.footers,
    hyperlinks: r.hyperlinks, images: r.images, danglingNumbering: 'keep', carry: r, preserveInput: true
});
const drawingsOf = (body) => {
    const out = [];
    const walk = (n) => {
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (!n || typeof n !== 'object') return;
        if (n.type === 'drawing') out.push(n);
        for (const k of ['children', 'runs', 'content', 'body', 'rows', 'cells']) if (n[k]) walk(n[k]);
    };
    walk(body);
    return out;
};
const relTarget = (pkg, owner, id) => {
    const rel = (pkg.rels[owner] || []).find((x) => x.Id === id);
    return rel && '/word/' + rel.Target;
};
/** Each `asvg:svgBlip r:embed` of a written part, resolved to its part's bytes. */
const svgTargets = (pkg, owner) => [...td.decode(pkg.parts[owner]).matchAll(/<asvg:svgBlip xmlns:asvg="([^"]+)" r:embed="([^"]+)"\/>/g)]
    .map(([, ns, id]) => ({ ns, bytes: pkg.parts[relTarget(pkg, owner, id)] }));

describe.each([['core', core], ['large bundle', large]])('SVG pictures (%s)', (_, api) => {
    test('read: svgRef and image.svg beside the PNG, body and header', () => {
        const r = api.read(source());
        const [body] = drawingsOf(r.document);
        expect(body.embedRef).toBe('rId2');
        expect(body.image.data).toEqual(PNG);
        expect(body.image.contentType).toBe('image/png');
        expect(body.svgRef).toBe('rId3');
        expect(body.image.svg).toEqual({ data: SVG, contentType: 'image/svg+xml', rId: 'rId3' });
        const [head] = drawingsOf(Object.values(r.headers)[0].body);
        expect(head.svgRef).toBe('rId2');
        expect(head.image.svg.data).toEqual(SVG2);
    });

    test('write: the save path keeps each svgBlip and its SVG part', () => {
        const out = opc.read(save(api, api.read(source())));
        const body = svgTargets(out, '/word/document.xml');
        expect(body).toHaveLength(1);
        expect(body[0].ns).toBe(SVG_NS);
        expect(body[0].bytes).toEqual(SVG);
        const headerPart = Object.keys(out.parts).find((n) => /^\/word\/header\d+\.xml$/.test(n));
        const head = svgTargets(out, headerPart);
        expect(head).toHaveLength(1);
        expect(head[0].bytes).toEqual(SVG2);
        expect(out.contentTypes.defaults.svg).toBe('image/svg+xml');
    });
});

describe('SVG pictures: a new picture', () => {
    const drawing = rt.resolve('docxDrawing');

    test('image(bytes, { svg }) is written with both images, one part per SVG', () => {
        const run = () => core.imageRun(PNG, { svg: SVG, cx: '1in', cy: '1in' });
        const doc = { body: [{ type: 'paragraph', children: [run()] }, { type: 'paragraph', children: [run()] }] };
        expect(drawing.image(PNG, { svg: SVG }).image.svg).toEqual({ data: SVG });
        const out = opc.read(core.write(doc));
        const targets = svgTargets(out, '/word/document.xml');
        expect(targets).toHaveLength(2);
        expect(targets.every((t) => t.bytes && td.decode(t.bytes) === td.decode(SVG))).toBe(true);
        expect(Object.keys(out.parts).filter((n) => n.endsWith('.svg'))).toHaveLength(1);
        const back = drawingsOf(core.read(core.write(doc)).document);
        expect(back.map((d) => td.decode(d.image.svg.data))).toEqual([td.decode(SVG), td.decode(SVG)]);
        expect(back.map((d) => d.image.contentType)).toEqual(['image/png', 'image/png']);
    });

    test('the written id is patched back on svgRef and image.svg.rId', () => {
        const d = drawing.image(PNG, { svg: SVG });
        core.write({ body: [{ type: 'paragraph', children: [{ type: 'run', children: [d] }] }] });
        expect(typeof d.svgRef).toBe('string');
        expect(d.image.svg.rId).toBe(d.svgRef);
        expect(d.svgRef).not.toBe(d.embedRef);
    });

    test('a picture without image.svg is written without an extension', () => {
        const out = opc.read(core.write({ body: [{ type: 'paragraph', children: [core.imageRun(PNG)] }] }));
        expect(td.decode(out.parts['/word/document.xml'])).not.toContain('a:extLst');
    });
});
