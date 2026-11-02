// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `docx.write(document, { carry })`: the parts `read()` listed in
 * `unmodelledParts` written back with their bytes, their relationships and
 * their content types.
 *
 * Every source package is built here: a document written by `docx.write`,
 * opened with `opcPackage.read`, given extra parts and relationships, and
 * zipped again with `opcPackage.write` — the shapes Word writes (theme,
 * document properties, font table, web settings, a glossary document with
 * its own parts, a picture a VML shape references, an embedded object).
 * Raw assertions go through `opcPackage.read`, independent of the reader.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';

const runtime = new ModuleRuntime();
for (const m of [...ooxmlMods.fw_require, ...ooxmlMods.modules]) runtime.register(m);
const docx = runtime.resolve('docx');
const opc = runtime.resolve('opcPackage');
const rels = runtime.resolve('opcRelationships');
const stylesMod = runtime.resolve('docxStyles');
const { ContractError } = runtime.resolve('ooxmlErrors');
const enc = new TextEncoder();
const dec = new TextDecoder();

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const T = {
    theme: `${R}/theme`,
    fontTable: `${R}/fontTable`,
    webSettings: `${R}/webSettings`,
    glossary: `${R}/glossaryDocument`,
    styles: `${R}/styles`,
    image: `${R}/image`,
    oleObject: `${R}/oleObject`,
    core: `${PR}/metadata/core-properties`,
    app: `${R}/extended-properties`
};
const CT = {
    theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
    fontTable: 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml',
    webSettings: 'application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml',
    glossary: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml',
    styles: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
    core: 'application/vnd.openxmlformats-package.core-properties+xml',
    app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml'
};

const png = (tag) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, tag]);
const xmlPart = (s) => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
const para = (...children) => ({ type: 'paragraph', children });

const THEME = xmlPart('<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"/>');
const FONTS = xmlPart('<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="Calibri"/></w:fonts>');
const WEB = xmlPart('<w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');
const CORE = xmlPart('<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">T</dc:title></cp:coreProperties>');
const APP = xmlPart('<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>1</Pages></Properties>');
const GLOSSARY = xmlPart('<w:glossaryDocument xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docParts/></w:glossaryDocument>');
const GLOSSARY_STYLES = xmlPart('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');
const OLE = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 1, 2, 3]);
const HEADER_OLE = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 9, 9]);
const ORPHAN = xmlPart('<x:orphan xmlns:x="urn:example"/>');
const CT_ORPHAN = 'application/vnd.example.orphan+xml';

/** Run `fn`, return the error it throws (or `null`). */
function thrown(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
}

/** Insert `xml` as the first run of the document body's first paragraph. */
function withRunXml(pkg, xml) {
    const s = dec.decode(pkg.parts['/word/document.xml']);
    const at = s.indexOf('<w:p>') >= 0 ? s.indexOf('<w:p>') + 5 : s.indexOf('<w:p ') ;
    expect(at).toBeGreaterThan(4);
    const end = s.indexOf('>', at - 1) + 1;
    pkg.parts['/word/document.xml'] = enc.encode(s.slice(0, end) + xml + s.slice(end));
}

/**
 * A Word-like source: styles, a picture and a header holding text (all
 * modelled), and the parts the model does not read. The source header is
 * `/word/header2.xml`, its own relationships add an embedded object; the
 * source also holds a part named `/word/header1.xml` that is not a header —
 * the name the writer gives the header it writes. Theme takes `rId1`, which
 * the writer would claim for its styles part; the package relationship to
 * the document is `rId3`.
 */
function source() {
    const base = docx.write(
        { type: 'document', body: [para(docx.run('body')), para(docx.imageRun(png(1), { cx: 914400, cy: 914400 }))] },
        { styles: stylesMod.defaults(), headers: { rIdH: { type: 'header', body: [para(docx.run('head'))] } } });
    const pkg = opc.read(base);
    const add = (name, bytes, ct) => { pkg.parts[name] = bytes; if (ct) pkg.contentTypes.overrides[name] = ct; };
    // the header moves to header2.xml
    pkg.parts['/word/header2.xml'] = pkg.parts['/word/header1.xml'];
    pkg.contentTypes.overrides['/word/header2.xml'] = pkg.contentTypes.overrides['/word/header1.xml'];
    delete pkg.parts['/word/header1.xml'];
    delete pkg.contentTypes.overrides['/word/header1.xml'];
    const docRels = pkg.rels['/word/document.xml'];
    for (const r of docRels) if (r.Id === 'rIdH') r.Target = 'header2.xml';
    add('/word/theme/theme1.xml', THEME, CT.theme);
    add('/word/fontTable.xml', FONTS, CT.fontTable);
    add('/word/webSettings.xml', WEB, CT.webSettings);
    add('/docProps/core.xml', CORE, CT.core);
    add('/docProps/app.xml', APP, CT.app);
    add('/word/glossary/document.xml', GLOSSARY, CT.glossary);
    add('/word/glossary/styles.xml', GLOSSARY_STYLES, CT.styles);
    add('/word/header1.xml', ORPHAN, CT_ORPHAN);         // the name the writer gives its header
    add('/word/embeddings/oleObject1.bin', OLE, null);  // content type from a bin default
    add('/word/embeddings/header.bin', HEADER_OLE, null);
    pkg.contentTypes.defaults.bin = 'application/vnd.openxmlformats-officedocument.oleObject';
    // the source numbers its own relationships: theme is rId1
    for (const r of docRels) if (r.Id === 'rId1') r.Id = 'rIdS';   // the styles relationship moves aside
    docRels.push(
        { Id: 'rId1', Type: T.theme, Target: 'theme/theme1.xml' },
        { Id: 'rId20', Type: T.fontTable, Target: 'fontTable.xml' },
        { Id: 'rId21', Type: T.webSettings, Target: 'webSettings.xml' },
        { Id: 'rId22', Type: T.glossary, Target: 'glossary/document.xml' },
        { Id: 'rIdV', Type: `${R}/package`, Target: 'header1.xml' },
        { Id: 'rIdO', Type: T.oleObject, Target: 'embeddings/oleObject1.bin' },
        { Id: 'rIdX', Type: T.oleObject, Target: 'http://example.com/x.bin', TargetMode: 'External' });
    pkg.rels['/word/glossary/document.xml'] = [{ Id: 'rId1', Type: T.styles, Target: 'styles.xml' }];
    pkg.rels['/word/header2.xml'] = [{ Id: 'rIdHp', Type: T.oleObject, Target: 'embeddings/header.bin' }];
    pkg.rels['/'] = [
        { Id: 'rId1', Type: T.core, Target: 'docProps/core.xml' },
        { Id: 'rId2', Type: T.app, Target: 'docProps/app.xml' },
        { Id: 'rId3', Type: `${R}/officeDocument`, Target: 'word/document.xml' }
    ];
    // two embedded objects the model keeps verbatim
    withRunXml(pkg, '<w:r><w:object><o:OLEObject Type="Embed" ProgID="Package" r:id="rIdV"/>'
        + '<o:OLEObject Type="Embed" ProgID="Package" r:id="rIdO"/></w:object></w:r>');
    return opc.write(pkg);
}

/** Read `bytes`, write the document back with every part the read returns. */
function roundTrip(bytes, extra = {}) {
    const r = docx.read(bytes);
    const opts = { styles: r.styles, settings: r.settings, numbering: r.numbering,
        headers: r.headers, footers: r.footers, hyperlinks: r.hyperlinks, ...extra };
    return { r, out: docx.write(r.document, typeof extra === 'function' ? extra(r, opts) : opts) };
}

const SRC = source();
const READ = docx.read(SRC);
const carried = (r) => r.unmodelledParts.map((p) => p.partName);

describe('the source package (test premise)', () => {
    test('read() lists the parts the model does not read', () => {
        expect(carried(READ)).toEqual([
            '/docProps/app.xml', '/docProps/core.xml', '/word/embeddings/header.bin',
            '/word/embeddings/oleObject1.bin', '/word/fontTable.xml', '/word/glossary/document.xml',
            '/word/glossary/styles.xml', '/word/header1.xml', '/word/theme/theme1.xml',
            '/word/webSettings.xml'
        ]);
        expect(Object.keys(READ.headers)).toEqual(['rIdH']);
    });

    test('without carry only those the body names are written back (T40 (a))', () => {
        const { out } = roundTrip(SRC);
        const pkg = opc.read(out);
        // The body's embedded objects: oleObject1.bin, and the part named
        // header1.xml under a free name (the writer's own header takes it).
        expect([...pkg.parts['/word/embeddings/oleObject1.bin']]).toEqual([...OLE]);
        expect(dec.decode(pkg.parts['/word/header1_1.xml'])).toBe(dec.decode(ORPHAN));
        for (const name of carried(READ)) {
            if (name === '/word/header1.xml' || name === '/word/embeddings/oleObject1.bin') continue;
            expect([name, pkg.parts[name]]).toEqual([name, undefined]);
        }
    });
});

describe('docx.write carry', () => {
    const { r, out } = roundTrip(SRC, (rr, opts) => ({ ...opts, carry: rr }));
    const pkg = opc.read(out);

    test('every listed part is written with its bytes', () => {
        for (const name of carried(r)) {
            if (name === '/word/header1.xml') continue; // renamed, below
            expect(Array.from(pkg.parts[name])).toEqual(Array.from(r.package.parts[name]));
        }
    });

    test('the package relationships to carried parts keep their ids; the document gets a free one', () => {
        const root = pkg.rels['/'];
        expect(root.find((x) => x.Id === 'rId1')).toEqual({ Id: 'rId1', Type: T.core, Target: 'docProps/core.xml' });
        expect(root.find((x) => x.Id === 'rId2')).toEqual({ Id: 'rId2', Type: T.app, Target: 'docProps/app.xml' });
        const main = root.filter((x) => x.Type === `${R}/officeDocument`);
        expect(main.length).toBe(1);
        expect(['rId1', 'rId2']).not.toContain(main[0].Id);
        expect(main[0].Target).toBe('word/document.xml');
    });

    test('the document relationships to carried parts keep their source ids; the writer allocates around them', () => {
        const dr = pkg.rels['/word/document.xml'];
        const byId = new Map(dr.map((x) => [x.Id, x]));
        expect(byId.get('rId1')).toEqual({ Id: 'rId1', Type: T.theme, Target: 'theme/theme1.xml' });
        expect(byId.get('rId20')).toEqual({ Id: 'rId20', Type: T.fontTable, Target: 'fontTable.xml' });
        expect(byId.get('rId21')).toEqual({ Id: 'rId21', Type: T.webSettings, Target: 'webSettings.xml' });
        expect(byId.get('rId22')).toEqual({ Id: 'rId22', Type: T.glossary, Target: 'glossary/document.xml' });
        expect(byId.get('rIdO')).toEqual({ Id: 'rIdO', Type: T.oleObject, Target: 'embeddings/oleObject1.bin' });
        expect(dr.map((x) => x.Id).length).toBe(new Set(dr.map((x) => x.Id)).size);
        const styles = dr.filter((x) => x.Type === T.styles);
        expect(styles.length).toBe(1);
        expect(styles[0].Id).not.toBe('rId1');
    });

    test('an external relationship other than a hyperlink is carried with its id', () => {
        expect(pkg.rels['/word/document.xml'].find((x) => x.Id === 'rIdX')).toEqual(
            { Id: 'rIdX', Type: T.oleObject, Target: 'http://example.com/x.bin', TargetMode: 'External' });
    });

    test('an external hyperlink is the model\'s: not carried when the caller drops it', () => {
        const p = opc.read(SRC);
        p.rels['/word/document.xml'].push({ Id: 'rIdL', Type: `${R}/hyperlink`, Target: 'https://example.org/', TargetMode: 'External' });
        const res = roundTrip(opc.write(p), (rr, opts) => ({ ...opts, carry: rr, hyperlinks: {} }));
        expect(opc.read(res.out).rels['/word/document.xml'].find((x) => x.Id === 'rIdL')).toBeUndefined();
    });

    test('a carried part takes another name when the writer uses its name; its relationship and type follow', () => {
        // the writer's own header keeps /word/header1.xml
        const hdr = pkg.rels['/word/document.xml'].find((x) => x.Id === 'rIdH');
        expect(hdr.Target).toBe('header1.xml');
        expect(dec.decode(pkg.parts['/word/header1.xml'])).toContain('head');
        const v = pkg.rels['/word/document.xml'].find((x) => x.Id === 'rIdV');
        expect(v.Type).toBe(`${R}/package`);
        const target = rels.resolveTarget('/word/document.xml', v.Target);
        expect(target).not.toBe('/word/header1.xml');
        expect(target.startsWith('/word/')).toBe(true);
        expect(Array.from(pkg.parts[target])).toEqual(Array.from(ORPHAN));
        expect(pkg.contentTypes.overrides[target]).toBe(CT_ORPHAN);
        expect(pkg.contentTypes.overrides['/word/header1.xml']).not.toBe(CT_ORPHAN);
    });

    test('the r:id kept verbatim in the body resolves to the carried parts', () => {
        const body = dec.decode(pkg.parts['/word/document.xml']);
        expect(body).toContain('r:id="rIdV"');
        expect(body).toContain('r:id="rIdO"');
    });

    test('a carried part keeps its own relationships', () => {
        expect(pkg.rels['/word/glossary/document.xml']).toEqual([{ Id: 'rId1', Type: T.styles, Target: 'styles.xml' }]);
    });

    test('a header relationship to a carried part is written from the header the writer writes', () => {
        const hdr = pkg.rels['/word/document.xml'].find((x) => x.Id === 'rIdH');
        const hdrPart = rels.resolveTarget('/word/document.xml', hdr.Target);
        const hp = (pkg.rels[hdrPart] || []).find((x) => x.Id === 'rIdHp');
        expect(hp).toEqual({ Id: 'rIdHp', Type: T.oleObject, Target: 'embeddings/header.bin' });
        expect(Array.from(pkg.parts[rels.resolveTarget(hdrPart, hp.Target)])).toEqual(Array.from(HEADER_OLE));
    });

    test('content types: overrides as read; a default added when the written package has none', () => {
        const ct = pkg.contentTypes;
        expect(ct.overrides['/word/theme/theme1.xml']).toBe(CT.theme);
        expect(ct.overrides['/docProps/core.xml']).toBe(CT.core);
        expect(ct.overrides['/word/glossary/document.xml']).toBe(CT.glossary);
        expect(ct.defaults.bin).toBe('application/vnd.openxmlformats-officedocument.oleObject');
        expect(ct.overrides['/word/embeddings/oleObject1.bin']).toBeUndefined();
    });

    test('a source default that differs from the written one becomes an override for the part', () => {
        const p = opc.read(SRC);
        p.parts['/custom/data.xml'] = xmlPart('<data/>');
        p.contentTypes.defaults.xml = 'text/xml';
        p.rels['/word/document.xml'].push({ Id: 'rIdD', Type: `${R}/customData`, Target: '../custom/data.xml' });
        const res = roundTrip(opc.write(p), (rr, opts) => ({ ...opts, carry: rr }));
        const o = opc.read(res.out);
        expect(o.contentTypes.defaults.xml).toBe('application/xml');
        expect(o.contentTypes.overrides['/custom/data.xml']).toBe('text/xml');
    });

    test('a caller id that takes a carried id gives the carried relationship a fresh one', () => {
        const res = roundTrip(SRC, (rr, opts) => ({ ...opts, carry: rr,
            hyperlinks: { ...opts.hyperlinks, rId20: { target: 'https://example.com/' } } }));
        const dr = opc.read(res.out).rels['/word/document.xml'];
        expect(dr.find((x) => x.Id === 'rId20').Type).toBe(`${R}/hyperlink`);
        const fonts = dr.filter((x) => x.Type === T.fontTable);
        expect(fonts.length).toBe(1);
        expect(fonts[0].Id).not.toBe('rId20');
        expect(dr.map((x) => x.Id).length).toBe(new Set(dr.map((x) => x.Id)).size);
    });

    test('a fresh id never takes the source id of another carried relationship', () => {
        // the caller takes rId1 (the theme's); web settings is rId3 in this
        // source, the lowest id free in the written table: the theme's fresh
        // id must skip it
        const p = opc.read(SRC);
        for (const x of p.rels['/word/document.xml']) if (x.Type === T.webSettings) x.Id = 'rId3';
        const res = roundTrip(opc.write(p), (rr, opts) => ({ ...opts, carry: rr,
            hyperlinks: { ...opts.hyperlinks, rId1: { target: 'https://example.com/' } } }));
        const dr = opc.read(res.out).rels['/word/document.xml'];
        expect(dr.find((x) => x.Id === 'rId3').Type).toBe(T.webSettings);
        expect(dr.find((x) => x.Id === 'rId1').Type).toBe(`${R}/hyperlink`);
        expect(['rId1', 'rId3']).not.toContain(dr.find((x) => x.Type === T.theme).Id);
        expect(dr.map((x) => x.Id).length).toBe(new Set(dr.map((x) => x.Id)).size);
    });

    test('an external picture read() returned in images: carried as is, no part written for it', () => {
        const p = opc.read(SRC);
        p.rels['/word/document.xml'].push({ Id: 'rIdE', Type: T.image, Target: 'logo.png', TargetMode: 'External' });
        const res = roundTrip(opc.write(p), (rr, opts) => ({ ...opts, carry: rr, images: rr.images }));
        const o = opc.read(res.out);
        const e = o.rels['/word/document.xml'].filter((x) => x.Target === 'logo.png' || x.Id === 'rIdE');
        expect(e).toEqual([{ Id: 'rIdE', Type: T.image, Target: 'logo.png', TargetMode: 'External' }]);
        for (const r of o.rels['/word/document.xml']) {
            if (r.TargetMode === 'External') continue;
            expect(o.parts[rels.resolveTarget('/word/document.xml', r.Target)]).toBeDefined();
        }
    });

    test('the output reads back with the carried parts still listed and the model unchanged', () => {
        const back = docx.read(out);
        const names = carried(back);
        for (const n of ['/docProps/core.xml', '/word/theme/theme1.xml', '/word/glossary/styles.xml',
            '/word/embeddings/oleObject1.bin', '/word/embeddings/header.bin']) expect(names).toContain(n);
        expect(names.length).toBe(carried(r).length);
        expect(back.headers.rIdH).toBeDefined();
        expect(back.styles.styles.length).toBe(r.styles.styles.length);
    });

    test('writing twice gives the same bytes', () => {
        const again = roundTrip(SRC, (rr, opts) => ({ ...opts, carry: rr })).out;
        expect(Array.from(again)).toEqual(Array.from(out));
    });

    test('carry: undefined writes what no option writes', () => {
        const a = roundTrip(SRC).out;
        const b = roundTrip(SRC, (rr, opts) => ({ ...opts, carry: undefined })).out;
        expect(Array.from(b)).toEqual(Array.from(a));
    });
});

describe('docx.write carry — refusals', () => {
    const doc = { type: 'document', body: [para(docx.run('x'))] };
    for (const [label, carry] of [
        ['a number', 5],
        ['null', null],
        ['no package', { unmodelledParts: [] }],
        ['no unmodelledParts', { package: READ.package }],
        ['package without rels', { package: { parts: {}, contentTypes: { defaults: {}, overrides: {} } }, unmodelledParts: [] }],
        ['unmodelledParts not an array', { package: READ.package, unmodelledParts: {} }]
    ]) {
        test(`${label} throws docx/invalid-carry`, () => {
            const e = thrown(() => docx.write(doc, { carry }));
            expect(e).toBeInstanceOf(ContractError);
            expect(e.code).toBe('docx/invalid-carry');
        });
    }

    test('a listed part absent from the package is skipped', () => {
        const out = docx.write(doc, { carry: { package: READ.package,
            unmodelledParts: [{ partName: '/nope.xml', contentType: null }, { partName: '/word/fontTable.xml', contentType: CT.fontTable }] } });
        const pkg = opc.read(out);
        expect(pkg.parts['/nope.xml']).toBeUndefined();
        expect(Array.from(pkg.parts['/word/fontTable.xml'])).toEqual(Array.from(FONTS));
    });
});
