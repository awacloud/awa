// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `docx.read` option `alternateContent: 'choice'`: an
 * `mc:AlternateContent` of a run whose one Choice holds one `w:drawing` and
 * requires only `wps`, `wpg` or `wpc` reads as that drawing, typed, with
 * its `Requires` and Fallback kept on `alternate`; the write wraps an
 * untouched one back in the construct and writes an edited one alone.
 * Every other construct is read as under `'keep'`.
 */

import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const d = rt.resolve('docx');
const opc = rt.resolve('opcPackage');
const relsMod = rt.resolve('opcRelationships');
const stylesMod = rt.resolve('docxStyles');
const { ContractError } = rt.resolve('ooxmlErrors');
const enc = new TextEncoder();
const dec = new TextDecoder();

const DECLS = {
    mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    v: 'urn:schemas-microsoft-com:vml',
    o: 'urn:schemas-microsoft-com:office:office',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    w14: 'http://schemas.microsoft.com/office/word/2010/wordml'
};
const IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 9]);

const SHAPE = '<w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264"'
    + ' behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>'
    + '<wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>'
    + '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'
    + '<wp:extent cx="914400" cy="457200"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'
    + '<wp:docPr id="3" name="Text Box 1"/><wp:cNvGraphicFramePr/><a:graphic>'
    + '<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>'
    + '<wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr>'
    + '<wps:txbx><w:txbxContent><w:p><w:r><w:t>Boxed</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr/>'
    + '</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing>';
const FALLBACK = '<mc:Fallback><w:pict><v:rect id="Text Box 1" style="width:72pt;height:36pt">'
    + '<v:imagedata r:id="rIdV" o:title=""/><v:textbox><w:txbxContent><w:p><w:r><w:t>Boxed</w:t></w:r></w:p>'
    + '</w:txbxContent></v:textbox></v:rect></w:pict></mc:Fallback>';
const AC_SHAPE = `<w:r><w:rPr><w:noProof/></w:rPr><mc:AlternateContent><mc:Choice Requires="wps">${SHAPE}</mc:Choice>${FALLBACK}</mc:AlternateContent></w:r>`;
const AC_OTHER = `<w:r><mc:AlternateContent><mc:Choice Requires="wps cx1">${SHAPE}</mc:Choice>${FALLBACK}</mc:AlternateContent></w:r>`;
const AC_TEXT = '<mc:AlternateContent><mc:Choice Requires="w14"><w:r><w:t>Modern</w:t></w:r></mc:Choice>'
    + '<mc:Fallback><w:r><w:t>Fallback</w:t></w:r></mc:Fallback></mc:AlternateContent>';

/** Declare on the root element of part `name` every prefix of DECLS it lacks. */
function declare(pkg, name) {
    const s = dec.decode(pkg.parts[name]);
    const open = s.match(/<w:(document|hdr)\b[^>]*>/);
    let tag = open[0];
    for (const [p, uri] of Object.entries(DECLS)) if (!tag.includes(`xmlns:${p}=`)) tag = tag.replace(/>$/, ` xmlns:${p}="${uri}">`);
    pkg.parts[name] = enc.encode(s.replace(open[0], tag));
}

/** A package whose first body paragraph starts with `runs`, a header holding `header` when given, and the Fallback's picture `rIdV`. */
function docxBytes(runs, { header, tail = '' } = {}) {
    const hdr = header ? { default: { body: [{ type: 'paragraph', children: [d.run('h')] }] } } : undefined;
    const base = d.write({ type: 'document', body: [{ type: 'paragraph', children: [d.run('body')] }] },
        { styles: stylesMod.defaults(), headers: hdr });
    const pkg = opc.read(base);
    const s = dec.decode(pkg.parts['/word/document.xml']);
    const at = s.indexOf('<w:p>') + 5;
    pkg.parts['/word/document.xml'] = enc.encode(s.slice(0, at) + runs + s.slice(at).replace('</w:p>', '</w:p>' + tail));
    declare(pkg, '/word/document.xml');
    pkg.parts['/word/media/fallback1.png'] = PNG;
    pkg.contentTypes.defaults.png = 'image/png';
    pkg.rels['/word/document.xml'].push({ Id: 'rIdV', Type: IMAGE, Target: 'media/fallback1.png' });
    if (header) {
        const hname = Object.keys(pkg.parts).find((n) => /^\/word\/header\d*\.xml$/.test(n));
        const h = dec.decode(pkg.parts[hname]);
        const hat = h.indexOf('<w:p>') + 5;
        pkg.parts[hname] = enc.encode(h.slice(0, hat) + header + h.slice(hat));
        declare(pkg, hname);
        pkg.rels[hname] = [...(pkg.rels[hname] || []), { Id: 'rIdV', Type: IMAGE, Target: 'media/fallback1.png' }];
    }
    return opc.write(pkg);
}

/** Write a read result back through the documented save path. */
const saveBack = (r) => d.write(r.document, { styles: r.styles, settings: r.settings, numbering: r.numbering,
    headers: r.headers, footers: r.footers, hyperlinks: r.hyperlinks, images: r.images, carry: r });
/** Write a read result back without `carry`. */
const writeBack = (r) => d.write(r.document, { styles: r.styles, settings: r.settings, numbering: r.numbering,
    headers: r.headers, footers: r.footers, hyperlinks: r.hyperlinks, images: r.images });
const documentXml = (bytes) => dec.decode(opc.read(bytes).parts['/word/document.xml']);
const count = (s, re) => (s.match(re) || []).length;
/** The run children of the body's first paragraph's first run. */
const firstRun = (r) => r.document.body[0].children[0].children;

describe('docx.read alternateContent: choice', () => {
    test('choice is accepted; another value throws, naming the three', () => {
        expect(() => d.read(docxBytes(AC_SHAPE), { alternateContent: 'choice' })).not.toThrow();
        let caught;
        try { d.read(new Uint8Array(0), { alternateContent: 'Choice' }); } catch (e) { caught = e; }
        expect(caught).toBeInstanceOf(ContractError);
        expect(caught.code).toBe('docx/invalid-alternate-content');
        expect(caught.message).toContain("'choice'");
    });

    test('a run\'s wps construct reads as its drawing, typed, with its Requires and Fallback kept', () => {
        const r = d.read(docxBytes(AC_SHAPE), { alternateContent: 'choice' });
        const drawing = firstRun(r).find((c) => c.type === 'drawing');
        expect(drawing).toBeDefined();
        expect(drawing.mode).toBe('anchor');
        expect(drawing.docName).toBe('Text Box 1');
        expect(drawing._source.name).toBe('w:drawing');
        expect(drawing.alternate.requires).toBe('wps');
        expect(drawing.alternate.fallback.name).toBe('mc:Fallback');
        expect(drawing.alternate.fallback.children[0].name).toBe('w:pict');
        // The two other modes are as before: no drawing in the run.
        for (const opts of [{}, { alternateContent: 'keep' }]) {
            expect(firstRun(d.read(docxBytes(AC_SHAPE), opts)).some((c) => c.type === 'drawing')).toBe(false);
        }
    });

    test('a header\'s construct is typed too', () => {
        const r = d.read(docxBytes('', { header: AC_SHAPE }), { alternateContent: 'choice' });
        const h = Object.values(r.headers)[0];
        const drawing = h.body[0].children[0].children.find((c) => c.type === 'drawing');
        expect(drawing && drawing.alternate.requires).toBe('wps');
    });

    test('every other construct is read and written as under keep', () => {
        const bytes = docxBytes(AC_OTHER, { tail: `<w:p>${AC_TEXT}</w:p>` });
        const r = d.read(bytes, { alternateContent: 'choice' });
        expect(firstRun(r).some((c) => c.type === 'drawing')).toBe(false);
        const choice = documentXml(saveBack(r));
        expect(choice).toBe(documentXml(saveBack(d.read(bytes, { alternateContent: 'keep' }))));
        expect(choice).toContain('<mc:Choice Requires="wps cx1">');
        expect(choice).toContain('<mc:Choice Requires="w14"><w:r><w:t>Modern</w:t></w:r></mc:Choice>');
    });

    test('an untouched drawing is written back as the construct it was read from', () => {
        const bytes = docxBytes(AC_SHAPE);
        const r = d.read(bytes, { alternateContent: 'choice' });
        const out = documentXml(saveBack(r));
        expect(out).toBe(documentXml(saveBack(d.read(bytes, { alternateContent: 'keep' }))));
        expect(count(out, /<mc:AlternateContent>/g)).toBe(1);
        expect(out).toContain('<mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>');
        expect(out).toContain('</w:drawing></mc:Choice><mc:Fallback><w:pict>');
        const again = firstRun(d.read(saveBack(r), { alternateContent: 'choice' })).find((c) => c.type === 'drawing');
        const before = firstRun(r).find((c) => c.type === 'drawing');
        expect(again.alternate.requires).toBe('wps');
        expect(again.docName).toBe(before.docName);
        expect([again.cx, again.cy, again.mode]).toEqual([before.cx, before.cy, before.mode]);
    });

    test('an edited drawing is written alone, without its stale Fallback', () => {
        const r = d.read(docxBytes(AC_SHAPE), { alternateContent: 'choice' });
        firstRun(r).find((c) => c.type === 'drawing').docName = 'Renamed';
        const out = documentXml(saveBack(r));
        expect(out).not.toContain('mc:AlternateContent');
        expect(out).not.toContain('<w:pict>');
        expect(out).toContain('name="Renamed"');
        expect(out).toContain('<wps:wsp');
    });

    test('a drawing built with alternate and no snapshot is wrapped; a null Fallback writes none', () => {
        const r = d.read(docxBytes(AC_SHAPE), { alternateContent: 'choice' });
        const drawing = firstRun(r).find((c) => c.type === 'drawing');
        delete drawing._read;
        drawing.alternate.fallback = null;
        const out = documentXml(saveBack(r));
        expect(out).toContain('<mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>');
        expect(out).toContain('</w:drawing></mc:Choice></mc:AlternateContent>');
        expect(out).not.toContain('mc:Fallback');
    });

    test('a write without carry keeps the relationship the Fallback names', () => {
        const r = d.read(docxBytes(AC_SHAPE), { alternateContent: 'choice' });
        const pkg = opc.read(writeBack(r));
        const xmlText = dec.decode(pkg.parts['/word/document.xml']);
        const id = xmlText.match(/<v:imagedata r:id="([^"]+)"/)[1];
        const rel = pkg.rels['/word/document.xml'].find((x) => x.Id === id);
        expect(rel && rel.Type).toBe(IMAGE);
        expect(pkg.parts[relsMod.resolveTarget('/word/document.xml', rel.Target)]).toEqual(PNG);
    });
});
