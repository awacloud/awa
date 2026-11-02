// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * T40 (a): the relationships the body's untyped content names. `read()`
 * keeps them on `document._relationships` (a slice of the source package)
 * and `write()` without `carry` writes them back, so a VML picture, an OLE
 * object, an ActiveX control or a SmartArt diagram kept verbatim does not
 * name a relationship the written part lacks.
 *
 * Every source package is built here: a document written by `docx.write`,
 * opened with `opcPackage.read`, given the verbatim content, its parts and
 * relationships, and zipped again with `opcPackage.write`. Raw assertions
 * go through `opcPackage.read`, independent of the reader.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const docx = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const relsMod = runtime.resolve('opcRelationships');
const stylesMod = runtime.resolve('docxStyles');
const enc = new TextEncoder();
const dec = new TextDecoder();

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const T = {
    image: `${R}/image`,
    oleObject: `${R}/oleObject`,
    control: `${R}/control`,
    activeXBinary: 'http://schemas.microsoft.com/office/2006/relationships/activeXControlBinary',
    dm: `${R}/diagramData`,
    lo: `${R}/diagramLayout`,
    qs: `${R}/diagramQuickStyle`,
    cs: `${R}/diagramColors`,
    styles: `${R}/styles`
};
const CT_ACTIVEX = 'application/vnd.ms-office.activeX+xml';
const CT_DM = 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml';
const CT_LO = 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml';
const CT_QS = 'application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml';
const CT_CS = 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml';

const png = (tag) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, tag]);
const xmlPart = (s) => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
const para = (...children) => ({ type: 'paragraph', children });
const OLE = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 1, 2, 3]);
const AX_BIN = new Uint8Array([0x2C, 0x00, 0x01, 0x02]);
const AX = xmlPart('<ax:ocx xmlns:ax="http://schemas.microsoft.com/office/2006/activeX" '
    + `xmlns:r="${R}" ax:classid="{8BD21D40-EC42-11CE-9E0D-00AA006002F3}" ax:persistence="persistStorage" r:id="rId1"/>`);
const DGM = (tag) => xmlPart(`<dgm:${tag} xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>`);

const OBJECT = '<w:r><w:object><v:shape id="s1" style="width:40pt;height:30pt"><v:imagedata r:id="rIdP" o:title=""/></v:shape>'
    + '<o:OLEObject Type="Embed" ProgID="Package" ShapeID="s1" DrawAspect="Content" ObjectID="_1" r:id="rId1"/></w:object></w:r>'
    + '<w:r><w:object><w:control r:id="rIdAx" w:name="CheckBox1" w:shapeid="s2"/></w:object></w:r>';
const SMARTART = '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/>'
    + '<wp:docPr id="5" name="Diagram 5"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">'
    + '<dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rIdDm" r:lo="rIdLo" r:qs="rIdQs" r:cs="rIdCs"/>'
    + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

/** Insert `xml` as the first runs of the document body's first paragraph. */
function withRunXml(pkg, xml) {
    const s = dec.decode(pkg.parts['/word/document.xml']);
    const at = s.indexOf('<w:p>') >= 0 ? s.indexOf('<w:p>') + 5 : s.indexOf('<w:p ');
    expect(at).toBeGreaterThan(4);
    const end = s.indexOf('>', at - 1) + 1;
    pkg.parts['/word/document.xml'] = enc.encode(s.slice(0, end) + xml + s.slice(end));
}

/**
 * A source whose body holds an OLE object (its VML preview picture and its
 * embedded binary), an ActiveX control (a part with its own binary) and a
 * SmartArt diagram (four parts). The OLE object's relationship is `rId1`,
 * the id the writer would claim first for its styles part.
 */
function source() {
    const base = docx.write({ type: 'document', body: [para(docx.run('body'))] }, { styles: stylesMod.defaults() });
    const pkg = opc.read(base);
    const add = (name, bytes, ct) => { pkg.parts[name] = bytes; if (ct) pkg.contentTypes.overrides[name] = ct; };
    add('/word/embeddings/oleObject1.bin', OLE, null);
    pkg.contentTypes.defaults.bin = 'application/vnd.openxmlformats-officedocument.oleObject';
    add('/word/media/preview1.png', png(7), null);
    pkg.contentTypes.defaults.png = 'image/png';
    add('/word/activeX/activeX1.xml', AX, CT_ACTIVEX);
    add('/word/activeX/activeX1.bin', AX_BIN, 'application/vnd.ms-office.activeX');
    add('/word/diagrams/data1.xml', DGM('dataModel'), CT_DM);
    add('/word/diagrams/layout1.xml', DGM('layoutDef'), CT_LO);
    add('/word/diagrams/quickStyle1.xml', DGM('styleDef'), CT_QS);
    add('/word/diagrams/colors1.xml', DGM('colorsDef'), CT_CS);
    pkg.rels['/word/activeX/activeX1.xml'] = [{ Id: 'rId1', Type: T.activeXBinary, Target: 'activeX1.bin' }];
    const docRels = pkg.rels['/word/document.xml'];
    for (const r of docRels) if (r.Id === 'rId1') r.Id = 'rIdS';   // the styles relationship moves aside
    docRels.push(
        { Id: 'rId1', Type: T.oleObject, Target: 'embeddings/oleObject1.bin' },
        { Id: 'rIdP', Type: T.image, Target: 'media/preview1.png' },
        { Id: 'rIdAx', Type: T.control, Target: 'activeX/activeX1.xml' },
        { Id: 'rIdDm', Type: T.dm, Target: 'diagrams/data1.xml' },
        { Id: 'rIdLo', Type: T.lo, Target: 'diagrams/layout1.xml' },
        { Id: 'rIdQs', Type: T.qs, Target: 'diagrams/quickStyle1.xml' },
        { Id: 'rIdCs', Type: T.cs, Target: 'diagrams/colors1.xml' });
    withRunXml(pkg, OBJECT + SMARTART);
    return opc.write(pkg);
}

const SRC = source();

/** Write `r`'s document back without `carry`, with the parts the read returns (its pictures through `images`). */
function writeBack(r, extra = {}) {
    return docx.write(r.document, { styles: r.styles, settings: r.settings, numbering: r.numbering,
        headers: r.headers, footers: r.footers, hyperlinks: r.hyperlinks, images: r.images, ...extra });
}

/** Every relationship id `part`'s XML names, each resolved in `pkg`: `[id, rel, target part]`. */
function named(pkg, part) {
    const ids = [...new Set([...dec.decode(pkg.parts[part]).matchAll(/\b(?:r:[A-Za-z]+|o:relid)="([^"]+)"/g)].map((m) => m[1]))];
    return ids.map((id) => {
        const rel = (pkg.rels[part] || []).find((x) => x.Id === id);
        return [id, rel, rel && rel.TargetMode !== 'External' ? relsMod.resolveTarget(part, rel.Target) : null];
    });
}

/** The written part an id of `/word/document.xml` reaches, with its bytes and content type. */
function reached(pkg, id) {
    const rel = (pkg.rels['/word/document.xml'] || []).find((x) => x.Id === id);
    expect(rel).toBeDefined();
    const name = relsMod.resolveTarget('/word/document.xml', rel.Target);
    const ext = name.slice(name.lastIndexOf('.') + 1);
    return { rel, name, bytes: pkg.parts[name], contentType: pkg.contentTypes.overrides[name] || pkg.contentTypes.defaults[ext] };
}

describe('read: document._relationships', () => {
    test('the body\'s named relationships, their target parts and content types, from the source', () => {
        const r = docx.read(SRC);
        const kept = r.document._relationships;
        expect(kept.part).toBe('/word/document.xml');
        expect(kept.package.rels['/word/document.xml'].map((x) => x.Id).sort())
            .toEqual(['rId1', 'rIdAx', 'rIdCs', 'rIdDm', 'rIdLo', 'rIdQs']);   // rIdP: in images
        expect(Object.keys(kept.package.parts).sort()).toEqual([
            '/word/activeX/activeX1.bin', '/word/activeX/activeX1.xml', '/word/diagrams/colors1.xml',
            '/word/diagrams/data1.xml', '/word/diagrams/layout1.xml', '/word/diagrams/quickStyle1.xml',
            '/word/embeddings/oleObject1.bin'
        ]);
        expect(Object.keys(r.images)).toEqual(['rIdP']);
        expect([...kept.package.parts['/word/embeddings/oleObject1.bin']]).toEqual([...OLE]);
        expect(kept.package.rels['/word/activeX/activeX1.xml']).toEqual([{ Id: 'rId1', Type: T.activeXBinary, Target: 'activeX1.bin' }]);
        expect(kept.package.contentTypes.overrides['/word/activeX/activeX1.xml']).toBe(CT_ACTIVEX);
        expect(kept.package.contentTypes.defaults.bin).toBe('application/vnd.openxmlformats-officedocument.oleObject');
    });

    test('unmodelledParts is as without it; a document naming no such relationship has none', () => {
        const r = docx.read(SRC);
        expect(r.unmodelledParts.map((p) => p.partName)).toEqual([
            '/word/activeX/activeX1.bin', '/word/activeX/activeX1.xml', '/word/diagrams/colors1.xml',
            '/word/diagrams/data1.xml', '/word/diagrams/layout1.xml', '/word/diagrams/quickStyle1.xml',
            '/word/embeddings/oleObject1.bin'
        ]);
        const plain = docx.read(docx.write({ type: 'document', body: [para(docx.run('x'))] }, { styles: stylesMod.defaults() }));
        expect('_relationships' in plain.document).toBe(false);
    });
});

describe('write without carry: the body\'s relationships written back', () => {
    test('every id the body names resolves, to the source bytes and content type', () => {
        const pkg = opc.read(writeBack(docx.read(SRC)));
        for (const [id, rel, target] of named(pkg, '/word/document.xml')) {
            expect([id, rel !== undefined]).toEqual([id, true]);
            if (target) expect([id, pkg.parts[target] !== undefined]).toEqual([id, true]);
        }
        const ole = reached(pkg, 'rId1');
        expect(ole.rel.Type).toBe(T.oleObject);
        expect([...ole.bytes]).toEqual([...OLE]);
        expect(ole.contentType).toBe('application/vnd.openxmlformats-officedocument.oleObject');
        const ax = reached(pkg, 'rIdAx');
        expect(ax.contentType).toBe(CT_ACTIVEX);
        const axRels = pkg.rels[ax.name];
        expect(axRels).toHaveLength(1);
        expect([...pkg.parts[relsMod.resolveTarget(ax.name, axRels[0].Target)]]).toEqual([...AX_BIN]);
        for (const [id, ct] of [['rIdDm', CT_DM], ['rIdLo', CT_LO], ['rIdQs', CT_QS], ['rIdCs', CT_CS]]) {
            expect(reached(pkg, id).contentType).toBe(ct);
        }
        expect([...reached(pkg, 'rIdP').bytes]).toEqual([...png(7)]);
    });

    test('the OLE object keeps rId1; the styles part takes another id', () => {
        const pkg = opc.read(writeBack(docx.read(SRC)));
        const docRels = pkg.rels['/word/document.xml'];
        expect(docRels.find((x) => x.Id === 'rId1').Type).toBe(T.oleObject);
        expect(docRels.filter((x) => x.Type === T.styles)).toHaveLength(1);
    });

    test('content removed from the model: its parts are not written', () => {
        const r = docx.read(SRC);
        const p = r.document.body[0];
        p.children = p.children.filter((c) => c.type === 'run' && !(c.children || []).some((k) => k.type !== 'text'));
        const pkg = opc.read(writeBack(r));
        for (const name of Object.keys(r.document._relationships.package.parts)) expect([name, pkg.parts[name]]).toEqual([name, undefined]);
        expect(pkg.rels['/word/document.xml'].some((x) => x.Type === T.oleObject || x.Type === T.control)).toBe(false);
    });

    test('a read of the written package keeps the same relationships again', () => {
        const once = writeBack(docx.read(SRC));
        const twice = opc.read(writeBack(docx.read(once)));
        for (const [id, rel, target] of named(twice, '/word/document.xml')) {
            expect([id, rel !== undefined]).toEqual([id, true]);
            if (target) expect([id, twice.parts[target] !== undefined]).toEqual([id, true]);
        }
    });
});

describe('save-back with carry: a group\'s picture', () => {
    const GROUP = '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/>'
        + '<wp:docPr id="7" name="Group 7"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">'
        + '<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/>'
        + '<a:chOff x="0" y="0"/><a:chExt cx="914400" cy="914400"/></a:xfrm></wpg:grpSpPr>'
        + '<pic:pic><pic:nvPicPr><pic:cNvPr id="8" name="Picture 8"/><pic:cNvPicPr/></pic:nvPicPr>'
        + '<pic:blipFill><a:blip r:embed="rIdG"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        + '</pic:pic></wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

    function groupSource() {
        const pkg = opc.read(docx.write({ type: 'document', body: [para(docx.run('body'))] }, { styles: stylesMod.defaults() }));
        pkg.parts['/word/media/group1.png'] = png(9);
        pkg.contentTypes.defaults.png = 'image/png';
        pkg.rels['/word/document.xml'].push({ Id: 'rIdG', Type: T.image, Target: 'media/group1.png' });
        withRunXml(pkg, GROUP);
        return opc.write(pkg);
    }

    test('the drawing is written from its source, its picture\'s relationship held', () => {
        const src = groupSource();
        const r = docx.read(src, { alternateContent: 'keep' });
        const out = opc.read(docx.write(r.document, { styles: r.styles, settings: r.settings, hyperlinks: r.hyperlinks,
            images: r.images, danglingNumbering: 'keep', carry: r }));
        const body = dec.decode(out.parts['/word/document.xml']);
        expect(body).toContain('<pic:cNvPr id="8" name="Picture 8"/>');
        const embed = /<a:blip r:embed="([^"]+)"/.exec(body)[1];
        expect([...reached(out, embed).bytes]).toEqual([...png(9)]);
    });
});

// T40 (b): the same for the headers, footers, notes, comments and numbering.
describe('story parts: their relationships kept and written back', () => {
    const VML = (id) => `<w:r><w:pict><v:shape id="p${id}" style="width:20pt;height:20pt"><v:imagedata r:id="${id}" o:title=""/></v:shape></w:pict></w:r>`;
    const HEAD_OLE = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 5, 5]);

    /** Insert `runs` before the first `</w:p>` after `marker` in `part`. */
    function insertRuns(pkg, part, marker, runs) {
        const s = dec.decode(pkg.parts[part]);
        const at = s.indexOf('</w:p>', s.indexOf(marker));
        expect(at).toBeGreaterThan(0);
        pkg.parts[part] = enc.encode(s.slice(0, at) + runs + s.slice(at));
    }

    /**
     * A header holding a VML picture and an OLE object, a footnote holding
     * a VML picture, a picture bullet in the numbering; each part's
     * relationships its own, the header's object on `rId1`.
     */
    function storySource() {
        const numbering = { abstractNums: [{ abstractNumId: 0, levels: [{ ilvl: 0, numFmt: 'bullet', lvlText: '•' }] }],
            nums: [{ numId: 1, abstractNumId: 0 }] };
        const pkg = opc.read(docx.write({ type: 'document', body: [para(docx.run('body'))] }, {
            styles: stylesMod.defaults(), numbering,
            headers: { rIdH: { type: 'header', body: [para(docx.run('head'))] } },
            footnotes: { notes: [{ id: 1, body: [para(docx.run('note'))] }] }
        }));
        const add = (name, bytes) => { pkg.parts[name] = bytes; };
        add('/word/media/head.png', png(11));
        add('/word/media/note.png', png(12));
        add('/word/media/bullet.png', png(13));
        add('/word/embeddings/head.bin', HEAD_OLE);
        pkg.contentTypes.defaults.png = 'image/png';
        pkg.contentTypes.defaults.bin = 'application/vnd.openxmlformats-officedocument.oleObject';
        const rel = (part, list) => { pkg.rels[part] = (pkg.rels[part] || []).concat(list); };
        rel('/word/header1.xml', [{ Id: 'rIdHv', Type: T.image, Target: 'media/head.png' },
            { Id: 'rId1', Type: T.oleObject, Target: 'embeddings/head.bin' }]);
        rel('/word/footnotes.xml', [{ Id: 'rIdN', Type: T.image, Target: 'media/note.png' }]);
        rel('/word/numbering.xml', [{ Id: 'rIdB', Type: T.image, Target: 'media/bullet.png' }]);
        insertRuns(pkg, '/word/header1.xml', '<w:p', VML('rIdHv')
            + '<w:r><w:object><o:OLEObject Type="Embed" ProgID="Package" r:id="rId1"/></w:object></w:r>');
        insertRuns(pkg, '/word/footnotes.xml', 'w:id="1"', VML('rIdN'));
        const n = dec.decode(pkg.parts['/word/numbering.xml']);
        const open = n.indexOf('>', n.indexOf('<w:numbering')) + 1;
        pkg.parts['/word/numbering.xml'] = enc.encode(n.slice(0, open)
            + '<w:numPicBullet w:numPicBulletId="0"><w:pict xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" '
            + `xmlns:r="${R}"><v:shape id="b0" style="width:9pt;height:9pt"><v:imagedata r:id="rIdB" o:title=""/></v:shape></w:pict></w:numPicBullet>`
            + n.slice(open));
        return opc.write(pkg);
    }

    const STORY = storySource();
    const writeStory = (r) => docx.write(r.document, { styles: r.styles, numbering: r.numbering, headers: r.headers,
        footers: r.footers, footnotes: r.footnotes, endnotes: r.endnotes, comments: r.comments, hyperlinks: r.hyperlinks, images: r.images });
    const at = (pkg, part, id) => {
        const rel = (pkg.rels[part] || []).find((x) => x.Id === id);
        expect([part, id, rel !== undefined]).toEqual([part, id, true]);
        return { rel, bytes: pkg.parts[relsMod.resolveTarget(part, rel.Target)] };
    };

    test('read: each part\'s slice, from its own relationships', () => {
        const r = docx.read(STORY);
        const ids = (m) => m._relationships.package.rels[m._relationships.part].map((x) => x.Id).sort();
        expect(ids(r.headers.rIdH)).toEqual(['rId1', 'rIdHv']);
        expect(ids(r.footnotes)).toEqual(['rIdN']);
        expect(ids(r.numbering)).toEqual(['rIdB']);
        expect(r.headers.rIdH._relationships.part).toBe('/word/header1.xml');
    });

    test('written without carry, every id each part names resolves to the source bytes', () => {
        const pkg = opc.read(writeStory(docx.read(STORY)));
        for (const part of ['/word/header1.xml', '/word/footnotes.xml', '/word/numbering.xml']) {
            for (const [id, rel, target] of named(pkg, part)) {
                expect([part, id, rel !== undefined]).toEqual([part, id, true]);
                if (target) expect([part, id, pkg.parts[target] !== undefined]).toEqual([part, id, true]);
            }
        }
        expect([...at(pkg, '/word/header1.xml', 'rIdHv').bytes]).toEqual([...png(11)]);
        expect(at(pkg, '/word/header1.xml', 'rId1').rel.Type).toBe(T.oleObject);
        expect([...at(pkg, '/word/header1.xml', 'rId1').bytes]).toEqual([...HEAD_OLE]);
        expect([...at(pkg, '/word/footnotes.xml', 'rIdN').bytes]).toEqual([...png(12)]);
        expect([...at(pkg, '/word/numbering.xml', 'rIdB').bytes]).toEqual([...png(13)]);
    });

    test('a picture added to the header takes an id clear of the kept ones', () => {
        const r = docx.read(STORY);
        r.headers.rIdH.body.push(para(docx.imageRun(png(14), { cx: 914400, cy: 914400 })));
        const pkg = opc.read(writeStory(r));
        const rels = pkg.rels['/word/header1.xml'];
        expect(rels.find((x) => x.Id === 'rId1').Type).toBe(T.oleObject);
        const pics = rels.filter((x) => x.Type === T.image).map((x) => [x.Id, [...pkg.parts[relsMod.resolveTarget('/word/header1.xml', x.Target)]].at(-1)]);
        expect(pics.sort()).toEqual([['rIdHv', 11], [pics.find((p) => p[1] === 14)[0], 14]].sort());
        expect(['rId1', 'rIdHv']).not.toContain(pics.find((p) => p[1] === 14)[0]);
    });

    test('the header\'s content removed: its parts are not written', () => {
        const r = docx.read(STORY);
        r.headers.rIdH.body = [para(docx.run('head'))];
        const pkg = opc.read(writeStory(r));
        expect(pkg.parts['/word/media/head.png']).toBeUndefined();
        expect(pkg.parts['/word/embeddings/head.bin']).toBeUndefined();
        expect(pkg.rels['/word/header1.xml'] || []).toEqual([]);
    });
});

// T40 (c): the settings' relationships.
describe('settings: an attached template and a mail-merge source kept', () => {
    const TEMPLATE = 'file:///C:/Templates/Letter.dotx';
    const SOURCE = 'file:///C:/Data/Recipients.xlsx';

    function settingsSource() {
        const pkg = opc.read(docx.write({ type: 'document', body: [para(docx.run('body'))] },
            { styles: stylesMod.defaults(), settings: { defaultTabStop: 720 } }));
        const s = dec.decode(pkg.parts['/word/settings.xml']);
        const open = s.indexOf('>', s.indexOf('<w:settings')) + 1;
        pkg.parts['/word/settings.xml'] = enc.encode(s.slice(0, open)
            + `<w:attachedTemplate xmlns:r="${R}" r:id="rIdT"/>`
            + `<w:mailMerge><w:mainDocumentType w:val="formLetters"/><w:dataSource xmlns:r="${R}" r:id="rIdD"/></w:mailMerge>`
            + s.slice(open));
        pkg.rels['/word/settings.xml'] = [
            { Id: 'rIdT', Type: `${R}/attachedTemplate`, Target: TEMPLATE, TargetMode: 'External' },
            { Id: 'rIdD', Type: `${R}/mailMergeSource`, Target: SOURCE, TargetMode: 'External' }];
        return opc.write(pkg);
    }

    const check = (mod) => {
        const r = mod.read(settingsSource());
        expect(r.settings._relationships.package.rels[r.settings._relationships.part].map((x) => x.Id).sort()).toEqual(['rIdD', 'rIdT']);
        const pkg = opc.read(mod.write(r.document, { styles: r.styles, settings: r.settings }));
        const rels = pkg.rels['/word/settings.xml'] || [];
        expect(rels.find((x) => x.Id === 'rIdT')).toEqual({ Id: 'rIdT', Type: `${R}/attachedTemplate`, Target: TEMPLATE, TargetMode: 'External' });
        expect(rels.find((x) => x.Id === 'rIdD')).toEqual({ Id: 'rIdD', Type: `${R}/mailMergeSource`, Target: SOURCE, TargetMode: 'External' });
    };

    test('written without carry, both ids resolve as in the source', () => check(docx));

    test('through docxLargeBundle (its settings hook copies the object)', () => {
        const big = new ModuleRuntime();
        big.registerDeep(ooxmlMods.docxLargeBundle);
        check(big.resolve('docxLargeBundle'));
    });
});

// T40 (d): a chart part's embedded workbook.
describe('chart parts: the embedded workbook kept', () => {
    const chartMod = runtime.resolve('drawingmlChart');
    const BODY_BOOK = new Uint8Array([0x50, 0x4B, 3, 4, 1]);
    const HEAD_BOOK = new Uint8Array([0x50, 0x4B, 3, 4, 2]);
    const spec = () => chartMod.barChart({ series: [{ name: 's', categories: ['a'], values: [1] }] });

    /** A body chart and a header chart, each naming its own embedded workbook. */
    function chartSource() {
        const pkg = opc.read(docx.write(
            { type: 'document', body: [para(docx.chartRun(spec(), { cx: '2in', cy: '1in' }))] },
            { styles: stylesMod.defaults(), headers: { rIdH: { type: 'header', body: [para(docx.chartRun(spec(), { cx: '2in', cy: '1in' }))] } } }));
        const charts = Object.keys(pkg.parts).filter((n) => /\/word\/charts\/chart\d+\.xml$/.test(n)).sort();
        expect(charts).toHaveLength(2);
        pkg.contentTypes.defaults.xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        charts.forEach((name, i) => {
            const s = dec.decode(pkg.parts[name]);
            // `c:date1904` is not typed by the chart model: a chart written
            // from its model loses it, one written as read keeps it.
            pkg.parts[name] = enc.encode(s.replace('<c:chart>', '<c:date1904 val="0"/><c:chart>')
                .replace('</c:chartSpace>', '<c:externalData r:id="rIdE"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>'));
            pkg.parts[`/word/embeddings/book${i + 1}.xlsx`] = i === 0 ? BODY_BOOK : HEAD_BOOK;
            pkg.rels[name] = [{ Id: 'rIdE', Type: `${R}/package`, Target: `../embeddings/book${i + 1}.xlsx` }];
        });
        return opc.write(pkg);
    }

    test('written without carry, each chart part\'s workbook id resolves to its bytes', () => {
        const r = docx.read(chartSource());
        const pkg = opc.read(docx.write(r.document, { styles: r.styles, headers: r.headers, hyperlinks: r.hyperlinks, images: r.images }));
        const charts = Object.keys(pkg.parts).filter((n) => /\/word\/charts\/chart\d+\.xml$/.test(n));
        expect(charts).toHaveLength(2);
        const books = charts.map((name) => {
            const id = /<c:externalData r:id="([^"]+)"/.exec(dec.decode(pkg.parts[name]))[1];
            const rel = (pkg.rels[name] || []).find((x) => x.Id === id);
            expect([name, id, rel !== undefined]).toEqual([name, id, true]);
            const target = relsMod.resolveTarget(name, rel.Target);
            expect(pkg.contentTypes.overrides[target] || pkg.contentTypes.defaults.xlsx).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            return [...pkg.parts[target]].at(-1);
        });
        expect(books.sort()).toEqual([1, 2]);
    });

    test('with carry, an unedited chart naming its workbook is still written as read', () => {
        const src = chartSource();
        const srcPkg = opc.read(src);
        const r = docx.read(src, { alternateContent: 'keep' });
        const out = opc.read(docx.write(r.document, { styles: r.styles, headers: r.headers, hyperlinks: r.hyperlinks,
            images: r.images, danglingNumbering: 'keep', carry: r }));
        const charts = (pkg) => Object.keys(pkg.parts).filter((n) => /\/word\/charts\/chart\d+\.xml$/.test(n))
            .map((n) => dec.decode(pkg.parts[n])).sort();
        expect(charts(out)).toEqual(charts(srcPkg));
    });
});
