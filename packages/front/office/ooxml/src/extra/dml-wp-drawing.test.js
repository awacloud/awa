// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `dmlWpDrawing` (T55 (a), D20 B): under the extension an edited drawing is
 * written from its kept source with the edited core fields set in place, so
 * what the model does not type (locks, blip state, extension list, line,
 * `cNvPr` text, a shape's style …) survives the edit; a drawing whose
 * structure changed is rebuilt from its typed fields, as without it.
 *
 * Every source package is a document written by `docx.write`, opened with
 * `opcPackage.read`, given a Word-like root, drawings and media, and zipped
 * again.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { dmlWpDrawing } from './dml-wp-drawing.js';

function runtime(withExtension) {
    const rt = new ModuleRuntime();
    for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules, dmlWpDrawing]) rt.register(m);
    const docx = rt.resolve('docx');
    if (withExtension) docx.use(rt.resolve('dmlWpDrawing'));
    return { docx, opc: rt.resolve('opcPackage'), xml: rt.resolve('xml') };
}
const { docx, opc, xml } = runtime(true);
const plain = runtime(false).docx;
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
    + ' xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"'
    + ' xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"'
    + ' mc:Ignorable="wp14">';
const png = (tag) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, tag]);
const para = (...children) => ({ type: 'paragraph', children });

const PICTURE = '<w:r><w:drawing>'
    + '<wp:inline distT="0" distB="0" distL="0" distR="0">'
    + '<wp:extent cx="914400" cy="457200"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
    + '<wp:docPr id="7" name="Picture 7"/>'
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png" descr="the picture"/>'
    + '<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>'
    + '<pic:blipFill><a:blip r:embed="rIdP" cstate="print"><a:extLst>'
    + '<a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" val="0"/></a:ext>'
    + '</a:extLst></a:blip><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

const SHAPE = '<w:r><w:drawing>'
    + '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264"'
    + ' behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
    + '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>'
    + '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'
    + '<wp:extent cx="914400" cy="914400"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'
    + '<wp:docPr id="9" name="Rectangle 9"/><wp:cNvGraphicFramePr/>'
    + '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
    + '<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr>'
    + '<wps:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>'
    + '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></wps:style>'
    + '<wps:bodyPr rot="0" anchor="ctr"/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';

// The picture with a rotation, a line with its join and ends, a shadow
// whose colour has a transform, and a hyperlink.
const RICH = PICTURE
    .replace('descr="the picture"/>', 'descr="the picture"><a:hlinkClick r:id="rIdL"/></pic:cNvPr>')
    .replace('<a:xfrm>', '<a:xfrm rot="5400000">')
    .replace('<a:ln><a:noFill/></a:ln>', '<a:ln w="9525"><a:noFill/><a:miter lim="800000"/><a:headEnd/><a:tailEnd/></a:ln>'
        + '<a:effectLst><a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0">'
        + '<a:prstClr val="black"><a:alpha val="40000"/></a:prstClr></a:outerShdw></a:effectLst>');
// The picture without locks, line or effects.
const BARE = PICTURE
    .replace('<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr>', '<pic:cNvPicPr/>')
    .replace('<a:noFill/><a:ln><a:noFill/></a:ln>', '');
// The picture filled with a gradient whose first stop's colour is tinted.
const GRADIENT = PICTURE.replace('<a:noFill/><a:ln>', '<a:gradFill rotWithShape="1"><a:gsLst>'
    + '<a:gs pos="0"><a:schemeClr val="accent1"><a:tint val="50000"/></a:schemeClr></a:gs>'
    + '<a:gs pos="100000"><a:schemeClr val="accent1"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:ln>');
// The shape as a text box: locks, insets, autofit, a shaded line reference,
// a paragraph.
const TEXTBOX = SHAPE
    .replace('<wps:cNvSpPr txBox="1"/>', '<wps:cNvSpPr txBox="1"><a:spLocks noChangeArrowheads="1"/></wps:cNvSpPr>')
    .replace('<a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef>', '<a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef>')
    .replace('<wps:bodyPr rot="0" anchor="ctr"/>', '<wps:txbx><w:txbxContent><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:txbxContent></wps:txbx>'
        + '<wps:bodyPr rot="0" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="ctr"><a:noAutofit/></wps:bodyPr>');
const STYLE = '<wps:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>'
    + '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></wps:style>';
const LINK = { Id: 'rIdL', Type: `${R}/hyperlink`, Target: 'https://example.com/', TargetMode: 'External' };

/** A source whose first body paragraph (and header, given `headerRuns`) holds those runs. */
function source(bodyRuns, { headerRuns = null, docRels = [] } = {}) {
    const base = docx.write({ type: 'document', body: [para(docx.run('x'))] },
        headerRuns ? { headers: { rIdH: { type: 'header', body: [para(docx.run('h'))] } } } : {});
    const pkg = opc.read(base);
    const inject = (part, runs) => {
        const s = dec.decode(pkg.parts[part]).replace(/<w:document\b[^>]*>/, ROOT)
            .replace(/<w:hdr\b[^>]*>/, () => ROOT.replace('<w:document', '<w:hdr'));
        const at = s.indexOf('<w:p>') + 5;
        pkg.parts[part] = enc.encode(s.slice(0, at) + runs + s.slice(at));
    };
    inject('/word/document.xml', bodyRuns);
    pkg.parts['/word/media/src1.png'] = png(1);
    pkg.contentTypes.defaults.png = 'image/png';
    pkg.rels['/word/document.xml'] = pkg.rels['/word/document.xml'] || [];
    pkg.rels['/word/document.xml'].push({ Id: 'rIdP', Type: `${R}/image`, Target: 'media/src1.png' }, ...docRels);
    if (headerRuns) {
        inject('/word/header1.xml', headerRuns);
        pkg.rels['/word/header1.xml'] = [{ Id: 'rIdP', Type: `${R}/image`, Target: 'media/src1.png' }];
    }
    return opc.write(pkg);
}

const saveBack = (d, r) => d.write(r.document, {
    styles: r.styles, settings: r.settings, numbering: r.numbering, headers: r.headers, footers: r.footers,
    hyperlinks: r.hyperlinks, images: r.images, carry: r });
const drawingsOf = (bytes, part = '/word/document.xml') => [...dec.decode(opc.read(bytes).parts[part])
    .matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)].map((m) => m[0]);
const typedIn = (body) => body[0].children.filter((c) => c.type === 'run')
    .flatMap((c) => c.children).filter((c) => c.type === 'drawing');
const typed = (r) => typedIn(r.document.body);
const drawingOf = (runs) => runs.slice('<w:r>'.length, -'</w:r>'.length);

describe('dmlWpDrawing: an edited drawing keeps its source (T55 a)', () => {
    test('a resized picture keeps everything the model does not type', () => {
        const r = docx.read(source(PICTURE));
        Object.assign(typed(r)[0], { cx: 1828800, cy: 914400 });
        const [d] = drawingsOf(saveBack(docx, r));
        expect(d).toBe(drawingOf(PICTURE)
            .replace('<wp:extent cx="914400" cy="457200"/>', '<wp:extent cx="1828800" cy="914400"/>')
            .replace('<a:ext cx="914400" cy="457200"/>', '<a:ext cx="1828800" cy="914400"/>'));
    });

    test('without the extension the same edit rebuilds the picture', () => {
        const r = plain.read(source(PICTURE));
        typed(r)[0].cx = 1828800;
        const [d] = drawingsOf(saveBack(plain, r));
        expect(d).toContain('cx="1828800"');
        expect(d).not.toContain('cstate');
        expect(d).not.toContain('a:picLocks');
    });

    test('alt text and title set, then removed', () => {
        const r = docx.read(source(PICTURE));
        Object.assign(typed(r)[0], { description: 'a new description', title: 'A title', docName: 'Renamed' });
        const [d] = drawingsOf(saveBack(docx, r));
        expect(d).toContain('<wp:docPr id="7" name="Renamed" descr="a new description" title="A title"/>');
        expect(d).toContain('cstate="print"');
        const r2 = docx.read(saveBack(docx, r));
        delete typed(r2)[0].description;
        delete typed(r2)[0].title;
        const [d2] = drawingsOf(saveBack(docx, r2));
        expect(d2).toContain('<wp:docPr id="7" name="Renamed"/>');
        expect(d2).toContain('a14:useLocalDpi');
    });

    test('the picture name, crop and link are set in place', () => {
        const r = docx.read(source(PICTURE));
        Object.assign(typed(r)[0], { picName: 'photo.png', picId: 3, srcRect: { l: 1000, r: 2000 }, offsetX: 12700 });
        const [d] = drawingsOf(saveBack(docx, r));
        expect(d).toContain('<pic:cNvPr id="3" name="photo.png" descr="the picture"/>');
        expect(d).toContain('<a:srcRect l="1000" r="2000"/><a:stretch>');
        expect(d).toContain('<a:off x="12700" y="0"/>');
        expect(d).toContain('<a:picLocks noChangeAspect="1" noChangeArrowheads="1"/>');
        const r2 = docx.read(saveBack(docx, r));
        delete typed(r2)[0].srcRect;
        const [d2] = drawingsOf(saveBack(docx, r2));
        expect(d2).not.toContain('a:srcRect');
        expect(d2).toContain('</a:blip><a:stretch>');
    });

    test('an anchored shape moved keeps its wrap, order and style', () => {
        const r = docx.read(source(SHAPE));
        const d = typed(r)[0];
        const children = structuredClone(d.anchorChildren);
        const posH = children.find((c) => c.name === 'wp:positionH');
        posH.children[0].children = [{ type: 'text', value: '457200' }];
        Object.assign(d, { anchorChildren: children, distL: 0, anchorAttrs: { ...d.anchorAttrs, behindDoc: '1' } });
        const [out] = drawingsOf(saveBack(docx, r));
        expect(out).toBe(drawingOf(SHAPE)
            .replace('distL="114300"', 'distL="0"').replace('behindDoc="0"', 'behindDoc="1"')
            .replace('<wp:posOffset>0</wp:posOffset></wp:positionH>', '<wp:posOffset>457200</wp:posOffset></wp:positionH>'));
    });

    test('a shape\'s body properties and fill edited keep its style and text-box flag', () => {
        const r = docx.read(source(SHAPE));
        const d = typed(r)[0];
        d._wpsBodyPr = xml.el('wps:bodyPr', { rot: '0', anchor: 'b' });
        d.shapeProps = { ...d.shapeProps, fill: 'none' };
        const [out] = drawingsOf(saveBack(docx, r));
        expect(out).toContain('<wps:bodyPr rot="0" anchor="b"/>');
        expect(out).toContain('<wps:style><a:lnRef idx="2">');
        expect(out).toContain('<wps:cNvSpPr txBox="1"/>');
        expect(out).toMatch(/<wps:spPr bwMode="auto">[\s\S]*<a:noFill\/>[\s\S]*<\/wps:spPr>/);
    });

    test('a header picture resized keeps its source', () => {
        const r = docx.read(source('', { headerRuns: PICTURE }));
        typedIn(r.headers.rIdH.body)[0].cy = 228600;
        const [d] = drawingsOf(saveBack(docx, r), '/word/header1.xml');
        expect(d).toContain('<wp:extent cx="914400" cy="228600"/>');
        expect(d).toContain('cstate="print"');
    });
});

describe('dmlWpDrawing: a changed structure is rebuilt', () => {
    test('a mode change rebuilds the drawing', () => {
        const r = docx.read(source(PICTURE));
        Object.assign(typed(r)[0], { mode: 'anchor' });
        const [d] = drawingsOf(saveBack(docx, r));
        expect(d).toContain('<wp:anchor');
        expect(d).not.toContain('cstate');
    });

    test('a field with no place in the source, or unknown, rebuilds it', () => {
        const noGeom = PICTURE.replace('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', '');
        const r = docx.read(source(noGeom));
        typed(r)[0].prstGeom = 'ellipse';
        const [d] = drawingsOf(saveBack(docx, r));
        expect(d).toContain('prst="ellipse"');
        expect(d).not.toContain('cstate');
        const r2 = docx.read(source(PICTURE));
        typed(r2)[0].custom = 1;
        expect(drawingsOf(saveBack(docx, r2))[0]).not.toContain('cstate');
    });
});

describe('dmlWpDrawing: an untouched document', () => {
    test('is written as without the extension', () => {
        const src = source(PICTURE + SHAPE, { headerRuns: PICTURE });
        const a = opc.read(saveBack(docx, docx.read(src)));
        const b = opc.read(saveBack(plain, plain.read(src)));
        for (const part of ['/word/document.xml', '/word/header1.xml']) expect(dec.decode(a.parts[part])).toBe(dec.decode(b.parts[part]));
    });

    test('hydrate adds the typed `frame`, `layout`, `picture` and `shape`', () => {
        const [a, s] = typed(docx.read(source(PICTURE + SHAPE)));
        const [b, t] = typed(plain.read(source(PICTURE + SHAPE)));
        expect(Object.keys(a).sort()).toEqual([...Object.keys(b), 'frame', 'picture'].sort());
        expect(a._read).toEqual(b._read);
        expect(Object.keys(s).sort()).toEqual([...Object.keys(t), 'frame', 'layout', 'shape'].sort());
        expect(s._read).toEqual(t._read);
    });
});

describe('dmlWpDrawing: the typed picture (T55 b)', () => {
    const read = (runs, opts) => docx.read(source(runs, opts));
    const out = (r) => drawingsOf(docx.write(r.document, { headers: r.headers, hyperlinks: r.hyperlinks, images: r.images, carry: r }))[0];

    test('a picture\'s `picture` is read from its source', () => {
        const p = typed(read(RICH, { docRels: [LINK] }))[0].picture;
        expect(p).toEqual({
            description: 'the picture',
            hyperlink: { rId: 'rIdL' },
            locks: { noChangeAspect: true, noChangeArrowheads: true },
            cstate: 'print',
            useLocalDpi: false,
            fillMode: 'stretch',
            fillRect: {},
            bwMode: 'auto',
            rotation: 5400000,
            fill: 'none',
            line: { width: 9525, fill: 'none', join: 'miter', miterLimit: 800000, headEnd: {}, tailEnd: {} },
            effects: [{ kind: 'outerShdw', attrs: { blurRad: '50800', dist: '38100', dir: '2700000', algn: 'tl', rotWithShape: '0' },
                color: { kind: 'prstClr', attrs: { val: 'black' }, mods: [{ kind: 'alpha', attrs: { val: '40000' } }] } }]
        });
    });

    test('edited fields are written in place, the rest byte for byte', () => {
        const r = read(RICH, { docRels: [LINK] });
        const p = typed(r)[0].picture;
        p.locks.noChangeAspect = false;
        p.description = 'a new description';
        Object.assign(p.line, { width: 19050, dash: 'dash' });
        delete p.rotation;
        p.cstate = 'email';
        p.hyperlink.tooltip = 'Open';
        expect(out(r)).toBe(drawingOf(RICH)
            .replace('noChangeAspect="1" noChangeArrowheads', 'noChangeAspect="0" noChangeArrowheads')
            .replace('descr="the picture"', 'descr="a new description"')
            .replace('<a:hlinkClick r:id="rIdL"/>', '<a:hlinkClick r:id="rIdL" tooltip="Open"/>')
            .replace('<a:ln w="9525"><a:noFill/>', '<a:ln w="19050"><a:noFill/><a:prstDash val="dash"/>')
            .replace('<a:xfrm rot="5400000">', '<a:xfrm>')
            .replace('cstate="print"', 'cstate="email"'));
    });

    test('locks, a line and effects are created where the source has none; an extension item removed', () => {
        const r = read(BARE);
        const p = typed(r)[0].picture;
        expect(p.locks).toBeUndefined();
        p.locks = { noChangeAspect: true };
        p.line = { width: 12700, fill: { solid: { kind: 'srgbClr', attrs: { val: 'FF0000' }, mods: [] } } };
        p.effects = [{ kind: 'softEdge', attrs: { rad: '12700' } }];
        delete p.useLocalDpi;
        const d = out(r);
        expect(d).toContain('<pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr>');
        expect(d).toContain('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="12700"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln>'
            + '<a:effectLst><a:softEdge rad="12700"/></a:effectLst></pic:spPr>');
        expect(d).toContain('<a:blip r:embed="rIdP" cstate="print"/>');
        expect(d).not.toContain('a:extLst');
    });

    test('a shadow\'s colour transform is kept through an edit of the shadow', () => {
        const r = read(RICH, { docRels: [LINK] });
        typed(r)[0].picture.effects[0].attrs.blurRad = '63500';
        expect(out(r)).toContain('<a:effectLst><a:outerShdw blurRad="63500" dist="38100" dir="2700000" algn="tl" rotWithShape="0">'
            + '<a:prstClr val="black"><a:alpha val="40000"/></a:prstClr></a:outerShdw></a:effectLst>');
    });

    test('a gradient stop\'s tint is kept when another stop is edited', () => {
        const r = read(GRADIENT);
        const g = typed(r)[0].picture.fill.gradient;
        expect(g.stops[0].color).toEqual({ kind: 'schemeClr', attrs: { val: 'accent1' }, mods: [{ kind: 'tint', attrs: { val: '50000' } }] });
        g.stops[1].pos = 90000;
        expect(out(r)).toBe(drawingOf(GRADIENT).replace('<a:gs pos="100000">', '<a:gs pos="90000">'));
    });

    test('the core fields and `picture` edited together', () => {
        const r = read(PICTURE);
        const d = typed(r)[0];
        d.cx = 1828800;
        d.picture.bwMode = 'gray';
        const w = out(r);
        expect(w).toContain('<wp:extent cx="1828800" cy="457200"/>');
        expect(w).toContain('<pic:spPr bwMode="gray">');
        expect(w).toContain('<a:picLocks noChangeAspect="1" noChangeArrowheads="1"/>');
    });

    test('a shape drawing gets no `picture`', () => {
        expect(typed(read(SHAPE))[0].picture).toBeUndefined();
    });
});

describe('dmlWpDrawing: the typed shape (T55 c)', () => {
    const read = (runs) => docx.read(source(runs));
    const out = (r) => drawingsOf(docx.write(r.document, { headers: r.headers, hyperlinks: r.hyperlinks, images: r.images, carry: r }))[0];
    const color = (val, mods = []) => ({ kind: 'schemeClr', attrs: { val }, mods });

    test('a shape\'s `shape` is read from its source', () => {
        const s = typed(read(TEXTBOX))[0].shape;
        const { content, ...rest } = s;
        expect(rest).toEqual({
            isTextBox: true,
            locks: { noChangeArrowheads: true },
            bwMode: 'auto',
            style: {
                line: { idx: 2, color: color('accent1', [{ kind: 'shade', attrs: { val: '50000' } }]) },
                fill: { idx: 1, color: color('accent1') },
                effect: { idx: 0, color: color('accent1') },
                font: { idx: 'minor', color: color('lt1') }
            },
            body: { rotation: 0, insets: { l: 91440, t: 45720, r: 91440, b: 45720 }, anchor: 'ctr', autofit: 'none' }
        });
        expect(content.map((b) => b.type)).toEqual(['paragraph']);
        expect(docx.toText({ body: content })).toBe('Hello');
    });

    test('edited fields are written in place, the rest byte for byte', () => {
        const r = read(TEXTBOX);
        const s = typed(r)[0].shape;
        s.style.line.idx = 1;
        s.locks.noChangeAspect = true;
        Object.assign(s.body, { anchor: 'b' });
        s.body.insets.l = 0;
        s.content = [para(docx.run('Bye'))];
        const d = out(r);
        const box = /<w:txbxContent>[\s\S]*<\/w:txbxContent>/;
        expect(d.match(box)[0]).toContain('Bye');
        expect(d.match(box)[0]).not.toContain('Hello');
        expect(d.replace(box, '')).toBe(drawingOf(TEXTBOX).replace(box, '')
            .replace('<a:spLocks noChangeArrowheads="1"/>', '<a:spLocks noChangeArrowheads="1" noChangeAspect="1"/>')
            .replace('<a:lnRef idx="2">', '<a:lnRef idx="1">')
            .replace('lIns="91440"', 'lIns="0"').replace('anchor="ctr"', 'anchor="b"'));
    });

    test('a style is created where the source has none; the content removed with its text box', () => {
        const r = read(TEXTBOX.replace(STYLE.replace('<a:schemeClr val="accent1"/></a:lnRef>',
            '<a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef>'), ''));
        const s = typed(r)[0].shape;
        expect(s.style).toBeUndefined();
        s.style = { line: { idx: 2, color: color('accent1') }, fill: { idx: 1, color: color('accent1') },
            effect: { idx: 0, color: color('accent1') }, font: { idx: 'minor', color: color('lt1') } };
        delete s.content;
        const d = out(r);
        expect(d).toContain('</wps:spPr>' + STYLE + '<wps:bodyPr');
        expect(d).not.toContain('wps:txbx');
    });

    test('the core `shapeProps` and `shape` edited together', () => {
        const r = read(SHAPE);
        const d = typed(r)[0];
        d.shapeProps = { ...d.shapeProps, fill: 'none' };
        d.shape.style.fill.idx = 3;
        const w = out(r);
        expect(w).toMatch(/<wps:spPr bwMode="auto">[\s\S]*<a:noFill\/>[\s\S]*<\/wps:spPr>/);
        expect(w).toContain('<a:fillRef idx="3">');
        expect(w).toContain('<wps:cNvSpPr txBox="1"/>');
    });

    test('a picture gets no `shape`, a shape no `picture`', () => {
        const [p, s] = typed(read(PICTURE + SHAPE));
        expect(p.shape).toBeUndefined();
        expect(s.picture).toBeUndefined();
    });
});

// The picture with Word's ids, an effect extent, a hidden flag and a
// hyperlink on its frame.
const FRAMED = PICTURE
    .replace('<wp:inline distT="0" distB="0" distL="0" distR="0">', '<wp:inline distT="0" distB="0" distL="0" distR="0" wp14:anchorId="1A2B3C4D" wp14:editId="5E6F7A8B">')
    .replace('<wp:effectExtent l="0" t="0" r="0" b="0"/>', '<wp:effectExtent l="19050" t="0" r="0" b="0"/>')
    .replace('<wp:docPr id="7" name="Picture 7"/>', '<wp:docPr id="7" name="Picture 7" hidden="1"><a:hlinkClick r:id="rIdL"/></wp:docPr>');
const groupOf = (uri, tag, head, kids) => '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + '<wp:extent cx="1828800" cy="914400"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="11" name="Group 11"/>'
    + `<wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/${uri}">`
    + `<${tag}>${head}${kids}</${tag}></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
const CHILD_SHAPE = drawingOf(SHAPE).match(/<wps:wsp>[\s\S]*<\/wps:wsp>/)[0].replace('<wps:wsp>', '<wps:wsp><wps:cNvPr id="12" name="Rectangle 12"/>');
// A child picture without its relationship: a group's nested picture names
// one the save-back does not hold yet (T40), and the core rebuilds such a
// drawing.
const CHILD_PICTURE = drawingOf(PICTURE).match(/<pic:pic>[\s\S]*<\/pic:pic>/)[0].replace(' r:embed="rIdP"', '');
const GROUP = groupOf('wordprocessingGroup', 'wpg:wgp', '<wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="914400"/>'
    + '<a:chOff x="0" y="0"/><a:chExt cx="1828800" cy="914400"/></a:xfrm></wpg:grpSpPr>', CHILD_SHAPE + CHILD_PICTURE);
const CANVAS = groupOf('wordprocessingCanvas', 'wpc:wpc', '<wpc:bg><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></wpc:bg><wpc:whole/>', CHILD_SHAPE);

describe('dmlWpDrawing: frame, layout, groups and canvases (T55 d)', () => {
    const out = (r) => drawingsOf(docx.write(r.document, { styles: r.styles, settings: r.settings, headers: r.headers,
        hyperlinks: r.hyperlinks, images: r.images, carry: r }))[0];

    test('a drawing\'s `frame` is read and its edits written in place', () => {
        const r = docx.read(source(FRAMED, { docRels: [LINK] }), { extensions: 'keep' });
        const f = typed(r)[0].frame;
        expect(f).toEqual({ anchorId: '1A2B3C4D', editId: '5E6F7A8B', effectExtent: { l: 19050, t: 0, r: 0, b: 0 },
            frameLocks: { noChangeAspect: true }, hidden: true, hyperlink: { rId: 'rIdL' } });
        f.effectExtent.r = 19050;
        f.frameLocks.noMove = true;
        f.anchorId = '00000001';
        delete f.hidden;
        expect(out(r)).toBe(drawingOf(FRAMED)
            .replace('wp14:anchorId="1A2B3C4D"', 'wp14:anchorId="00000001"')
            .replace('<wp:effectExtent l="19050" t="0" r="0" b="0"/>', '<wp:effectExtent l="19050" t="0" r="19050" b="0"/>')
            .replace('<a:graphicFrameLocks noChangeAspect="1"/>', '<a:graphicFrameLocks noChangeAspect="1" noMove="1"/>')
            .replace(' hidden="1"', ''));
    });

    test('an anchor\'s `layout` is read and its edits written in place', () => {
        const r = docx.read(source(SHAPE));
        const l = typed(r)[0].layout;
        expect(l).toEqual({ simplePos: { x: 0, y: 0 }, horizontal: { relativeFrom: 'column', offset: 0 },
            vertical: { relativeFrom: 'paragraph', offset: 0 }, wrap: { type: 'none' } });
        l.horizontal = { relativeFrom: 'margin', align: 'center' };
        l.wrap = { type: 'tight', wrapText: 'bothSides', polygon: { edited: false, start: { x: 0, y: 0 }, lineTo: [{ x: 21600, y: 0 }, { x: 0, y: 0 }] } };
        l.relativeSize = { horizontal: { relativeFrom: 'page', pct: 40000 } };
        const d = out(r);
        expect(d).toContain('<wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH>');
        expect(d).toContain('<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapTight wrapText="bothSides"><wp:wrapPolygon edited="0">'
            + '<wp:start x="0" y="0"/><wp:lineTo x="21600" y="0"/><wp:lineTo x="0" y="0"/></wp:wrapPolygon></wp:wrapTight><wp:docPr');
        expect(d).toMatch(/<\/a:graphic><wp14:sizeRelH [^>]*relativeFrom="page"><wp14:pctWidth>40000<\/wp14:pctWidth><\/wp14:sizeRelH><\/wp:anchor>/);
        expect(d).not.toContain('wp:wrapNone');
        expect(d).toContain('<wps:style>');
    });

    test('a group\'s `group` is read and its children\'s edits written into them', () => {
        const r = docx.read(source(GROUP));
        const g = typed(r)[0].group;
        expect(g).toMatchObject({ offset: { x: 0, y: 0 }, extent: { cx: 1828800, cy: 914400 },
            childOffset: { x: 0, y: 0 }, childExtent: { cx: 1828800, cy: 914400 } });
        expect(g.children.map((c) => Object.keys(c)[0])).toEqual(['shape', 'picture']);
        expect(g.children[0].shape.style.line.idx).toBe(2);
        expect(g.children[1].picture.cstate).toBe('print');
        g.children[0].shape.style.line.idx = 1;
        g.children[1].picture.description = 'in a group';
        g.offset.x = 12700;
        expect(out(r)).toBe(drawingOf(GROUP)
            .replace('<wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/>', '<wpg:grpSpPr><a:xfrm><a:off x="12700" y="0"/>')
            .replace('<a:lnRef idx="2">', '<a:lnRef idx="1">')
            .replace('descr="the picture"', 'descr="in a group"'));
    });

    test('a canvas\'s background edited; a group\'s child removed is not written', () => {
        const r = docx.read(source(CANVAS));
        typed(r)[0].canvas.background.fill = { solid: { kind: 'srgbClr', attrs: { val: 'EEEEEE' }, mods: [] } };
        expect(out(r)).toContain('<wpc:bg><a:solidFill><a:srgbClr val="EEEEEE"/></a:solidFill></wpc:bg><wpc:whole/><wps:wsp>');
        const r2 = docx.read(source(GROUP));
        typed(r2)[0].group.children.pop();
        expect(out(r2)).toBe(drawingOf(GROUP));
    });

    test('an untouched group, canvas and framed picture are written as without the extension', () => {
        const src = source(GROUP + CANVAS + FRAMED, { docRels: [LINK] });
        const a = opc.read(saveBack(docx, docx.read(src, { extensions: 'keep' })));
        const b = opc.read(saveBack(plain, plain.read(src, { extensions: 'keep' })));
        expect(dec.decode(a.parts['/word/document.xml'])).toBe(dec.decode(b.parts['/word/document.xml']));
    });
});
