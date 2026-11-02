// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A drawing read from a source is written back from that source while its
 * typed fields are untouched (T51 (g), D19 B): what the model does not type
 * (picture locks, blip state, line, extension items, a shape's style …)
 * stays; the ids the write assigns are rewritten in it; an edited drawing,
 * or one whose source names a relationship the written part does not hold,
 * is rebuilt from its typed fields. The docx walker's `hydrateDrawing` /
 * `dehydrateDrawing` hooks see every drawing, the kept source their input.
 *
 * Every source package is a document written by `docx.write`, opened with
 * `opcPackage.read`, given a Word-like root, drawings, media and
 * relationships, and zipped again.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

function runtime() {
    const rt = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) rt.register(m);
    return rt;
}
const rt = runtime();
const docx = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const enc = new TextEncoder();
const dec = new TextDecoder();

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const ROOT = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ` xmlns:r="${R}"`
    + ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
    + ' xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'
    + ' mc:Ignorable="wp14">';
const png = (tag) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, tag]);
const para = (...children) => ({ type: 'paragraph', children });

const picture = (rId, { id = 7, link = '', svg = '' } = {}) => '<w:r><w:drawing>'
    + '<wp:inline distT="0" distB="0" distL="0" distR="0" wp14:anchorId="1A2B3C4D" wp14:editId="5E6F7A8B">'
    + '<wp:extent cx="914400" cy="457200"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
    + (link ? `<wp:docPr id="${id}" name="Picture ${id}">${link}</wp:docPr>` : `<wp:docPr id="${id}" name="Picture ${id}"/>`)
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png" descr="the picture"/>'
    + '<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>'
    + `<pic:blipFill><a:blip r:embed="${rId}" cstate="print"><a:extLst>`
    + '<a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" val="0"/></a:ext>'
    + `${svg}</a:extLst></a:blip><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + '<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

const SVG_EXT = (rId) => '<a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">'
    + `<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${rId}"/></a:ext>`;

const SHAPE = '<w:r><w:drawing>'
    + '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264"'
    + ' behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
    + '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>'
    + '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'
    + '<wp:extent cx="914400" cy="914400"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'
    + '<wp:docPr id="9" name="Rectangle 9"/><wp:cNvGraphicFramePr/>'
    + '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
    + '<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr>'
    + '<wps:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>'
    + '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></wps:style>'
    + '<wps:bodyPr rot="0" anchor="ctr"/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';

/**
 * A source whose first body paragraph holds `bodyRuns` (and whose header,
 * when `headerRuns` is given, holds those), its media `media` (`{ id:
 * bytes }`) and its document relationships `docRels`.
 */
function source(bodyRuns, { media = {}, docRels = [], headerRuns = null, headerRels = [] } = {}) {
    const base = docx.write({ type: 'document', body: [para(docx.run('x'))] },
        headerRuns ? { headers: { rIdH: { type: 'header', body: [para(docx.run('h'))] } } } : {});
    const pkg = opc.read(base);
    const inject = (part, runs) => {
        const s = dec.decode(pkg.parts[part]).replace(/<w:document\b[^>]*>/, ROOT)
            .replace(/<w:hdr\b[^>]*>/, (m) => ROOT.replace('<w:document', '<w:hdr'));
        const at = s.indexOf('<w:p>') + 5;
        pkg.parts[part] = enc.encode(s.slice(0, at) + runs + s.slice(at));
    };
    inject('/word/document.xml', bodyRuns);
    pkg.rels['/word/document.xml'] = pkg.rels['/word/document.xml'] || [];
    let n = 0;
    for (const [id, bytes] of Object.entries(media)) {
        const name = `media/src${++n}.png`;
        pkg.parts['/word/' + name] = bytes;
        pkg.rels['/word/document.xml'].push({ Id: id, Type: `${R}/image`, Target: name });
        for (const r of headerRels) if (r.Target === id) r.Target = name;
    }
    pkg.contentTypes.defaults.png = 'image/png';
    pkg.rels['/word/document.xml'].push(...docRels);
    if (headerRuns) {
        inject('/word/header1.xml', headerRuns);
        pkg.rels['/word/header1.xml'] = headerRels;
    }
    return opc.write(pkg);
}

/** The save-back write of `r` (`docx.read`'s result). */
const saveBack = (r, extra = {}) => docx.write(r.document, {
    styles: r.styles, settings: r.settings, numbering: r.numbering, headers: r.headers, footers: r.footers,
    hyperlinks: r.hyperlinks, images: r.images, carry: r, ...extra });
const drawingsOf = (bytes, part = '/word/document.xml') => [...dec.decode(opc.read(bytes).parts[part])
    .matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)].map((m) => m[0]);
const typed = (r) => r.document.body[0].children.filter((c) => c.type === 'run')
    .flatMap((c) => c.children).filter((c) => c.type === 'drawing');

describe('an untouched drawing is written from its source (T51 g)', () => {
    test('a picture keeps what the model does not type, byte for byte', () => {
        const src = source(picture('rIdP'), { media: { rIdP: png(1) } });
        const r = docx.read(src, { extensions: 'keep' });
        const out = saveBack(r);
        expect(drawingsOf(out)).toEqual(drawingsOf(src));
        // the default read drops the extension attributes, nothing else
        const d = drawingsOf(saveBack(docx.read(src)))[0];
        expect(d).not.toContain('wp14:');
        expect(d).toBe(drawingsOf(src)[0].replace(' wp14:anchorId="1A2B3C4D" wp14:editId="5E6F7A8B"', ''));
    });

    test('an anchored shape keeps its style references', () => {
        const src = source(SHAPE);
        const out = saveBack(docx.read(src));
        expect(drawingsOf(out)).toEqual(drawingsOf(src));
    });

    test('the ids the write assigns are rewritten in the source', () => {
        const src = source(picture('rIdP') + picture('rIdQ', { id: 7 }), { media: { rIdP: png(1), rIdQ: png(2) } });
        const r = docx.read(src);
        const [a, b] = typed(r);
        b.image.data = a.image.data;   // the same picture: one media part, one id
        const [x, y] = drawingsOf(saveBack(r));
        expect(x).toContain('r:embed="rIdP"');
        expect(y).toContain('r:embed="rIdP"');
        expect(y).toContain('cstate="print"');
        expect(x).toContain('<wp:docPr id="7"');
        expect(y).not.toContain('<wp:docPr id="7"');   // a duplicate id is renumbered
        expect(y.replace(/r:embed="\w+"/, '').replace(/docPr id="\d+"/, ''))
            .toBe(drawingsOf(src)[1].replace(/r:embed="\w+"/, '').replace(/docPr id="\d+"/, '').replace(/ wp14:\w+="\w+"/g, ''));
    });

    test('a picture with its SVG keeps both references', () => {
        const svg = enc.encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
        const src = source(picture('rIdP', { svg: SVG_EXT('rIdS') }), { media: { rIdP: png(1), rIdS: svg } });
        const r = docx.read(src);
        expect(typed(r)[0].image.svg.data).toBeDefined();
        const [d] = drawingsOf(saveBack(r));
        expect(d).toContain('r:embed="rIdP" cstate="print"');
        expect(d).toMatch(/<asvg:svgBlip [^>]*r:embed="rIdS"/);
        expect(d).toContain('a14:useLocalDpi');
    });

    test('an edited drawing is rebuilt from its typed fields', () => {
        const src = source(picture('rIdP'), { media: { rIdP: png(1) } });
        const r = docx.read(src);
        typed(r)[0].cx = 1828800;
        const [d] = drawingsOf(saveBack(r));
        expect(d).toContain('cx="1828800"');
        expect(d).not.toContain('cstate');
    });

    test('a hyperlink of the source is kept when the part holds it', () => {
        const link = { Id: 'rIdL', Type: `${R}/hyperlink`, Target: 'https://example.com/', TargetMode: 'External' };
        const src = source(picture('rIdP', { link: '<a:hlinkClick r:id="rIdL"/>' }), { media: { rIdP: png(1) }, docRels: [link] });
        const r = docx.read(src);
        expect(r.hyperlinks.rIdL).toBeDefined();
        const kept = drawingsOf(saveBack(r))[0];
        expect(kept).toContain('<a:hlinkClick r:id="rIdL"/>');
        expect(kept).toContain('cstate="print"');
        // without the hyperlink table the reference would dangle: rebuilt
        const rebuilt = drawingsOf(saveBack(r, { hyperlinks: {}, carry: undefined }))[0];
        expect(rebuilt).not.toContain('hlinkClick');
        expect(rebuilt).not.toContain('cstate');
    });

    test('a header picture is written from its source', () => {
        const src = source('', { headerRuns: picture('rIdHp'), media: { rIdHp: png(3) },
            headerRels: [{ Id: 'rIdHp', Type: `${R}/image`, Target: 'rIdHp' }] });
        const out = saveBack(docx.read(src));
        const [d] = drawingsOf(out, '/word/header1.xml');
        expect(d).toContain('cstate="print"');
        expect(d).toContain('<a:picLocks noChangeAspect="1" noChangeArrowheads="1"/>');
    });
});

describe('the walker hooks drawings (T51 g)', () => {
    test('hydrateDrawing / dehydrateDrawing see every drawing; a replaced source is written', () => {
        const own = runtime();
        const d2 = own.resolve('docx');
        const seen = [];
        d2.use({
            hydrateDrawing(d) {
                seen.push('h:' + d.docName);
                d.altText = d._source ? 'read' : null;
                return d;
            },
            dehydrateDrawing(d) {
                seen.push('d:' + d.docName);
                if (d.altText !== 'read') {
                    const s = structuredClone(d._source);
                    const wrapper = s.children.find((c) => c.type === 'element');
                    wrapper.children.find((c) => c.name === 'wp:docPr').attrs.descr = d.altText;
                    d._source = s;
                }
                delete d.altText;
                return d;
            }
        });
        const src = source(picture('rIdP'), { headerRuns: picture('rIdHp', { id: 8 }), media: { rIdP: png(1), rIdHp: png(3) },
            headerRels: [{ Id: 'rIdHp', Type: `${R}/image`, Target: 'rIdHp' }] });
        const r = d2.read(src);
        expect(seen).toEqual(['h:Picture 7', 'h:Picture 8']);
        typed(r)[0].altText = 'edited';
        const out = d2.write(r.document, { headers: r.headers, hyperlinks: r.hyperlinks, images: r.images, carry: r });
        expect(seen.slice(2)).toEqual(['d:Picture 7', 'd:Picture 8']);
        const [d] = drawingsOf(out);
        expect(d).toContain('descr="edited"');
        expect(d).toContain('cstate="print"');
    });
});
