// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * A read through `pptxFullBundle` models the parts the core leaves
 * unmodelled (T60 (e2), `pmlPackageParts`): the slide layouts no slide
 * uses (one slide master), the notes slides, the notes and handout masters
 * with their themes. Each is read only when it is written back as read;
 * the write rebuilds them, their relationships and the presentation's
 * lists. The pptx walker's package hooks and its reach into the notes
 * parts. `pptxLargeBundle` reads as before.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as ooxmlMods from '../main.js';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const props = rt.resolve('docxProperties');
const { createWalker } = rt.resolve('pptxWalker');
const resolveIn = (desc, name) => { const r = new ModuleRuntime(); r.registerDeep(desc); return r.resolve(name); };
const full = resolveIn(ooxmlMods.pptxFullBundle, 'pptxFullBundle');
const large = resolveIn(ooxmlMods.pptxLargeBundle, 'pptxLargeBundle');
const core = resolveIn(ooxmlMods.pptx, 'pptx');
const enc = new TextEncoder();
const dec = new TextDecoder();

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = { notesSlide: R + '/notesSlide', notesMaster: R + '/notesMaster', handoutMaster: R + '/handoutMaster', slide: R + '/slide', theme: R + '/theme', image: R + '/image', slideMaster: R + '/slideMaster' };
const CTP = 'application/vnd.openxmlformats-officedocument.presentationml.';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + R + '" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const body = (text) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>`
    + `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const CLRMAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
const NOTES = (text) => `<p:notes ${NS}><p:cSld><p:spTree>${GRP}${body(text)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
const NOTES_MASTER = `<p:notesMaster ${NS}><p:cSld><p:spTree>${GRP}${body('master')}</p:spTree></p:cSld>${CLRMAP}<p:hf hdr="0"/>`
    + '<p:notesStyle><a:lvl1pPr marL="0"><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>';
const HANDOUT_MASTER = `<p:handoutMaster ${NS}><p:cSld><p:spTree>${GRP}</p:spTree></p:cSld>${CLRMAP}</p:handoutMaster>`;
const layout = (name, type) => ({ type: 'slideLayout', layoutType: type, cSldName: name, shapes: [] });

/**
 * A deck the core writes (two slides, the second on layout B of A, B, C),
 * then given notes and masters by hand. `opts.imageOnNotes`: the first
 * notes slide also names an image; `opts.imageOnLayout`: layout C does.
 */
function deck(opts = {}) {
    const pkg = opc.read(core.write({
        slides: [{ title: 'one', layoutRef: 1 }, { title: 'two', layoutRef: 1 }],
        slideLayouts: [layout('A', 'title'), layout('B', 'obj'), layout('C', 'blank')]
    }));
    const theme = pkg.parts['/ppt/theme/theme1.xml'];
    const put = (name, text, ct, rels) => {
        opc.setPart(pkg, name, typeof text === 'string' ? enc.encode(text) : text, ct);
        if (rels) opc.setRels(pkg, name, rels);
    };
    put('/ppt/theme/theme2.xml', theme, 'application/vnd.openxmlformats-officedocument.theme+xml');
    put('/ppt/theme/theme3.xml', theme, 'application/vnd.openxmlformats-officedocument.theme+xml');
    put('/ppt/notesMasters/notesMaster1.xml', NOTES_MASTER, CTP + 'notesMaster+xml',
        [{ Id: 'rId1', Type: REL.theme, Target: '../theme/theme2.xml' }]);
    put('/ppt/handoutMasters/handoutMaster1.xml', HANDOUT_MASTER, CTP + 'handoutMaster+xml',
        [{ Id: 'rId1', Type: REL.theme, Target: '../theme/theme3.xml' }]);
    const notesRels = [{ Id: 'rId1', Type: REL.notesMaster, Target: '../notesMasters/notesMaster1.xml' },
        { Id: 'rId2', Type: REL.slide, Target: '../slides/slide1.xml' }];
    if (opts.imageOnNotes) notesRels.push({ Id: 'rId3', Type: REL.image, Target: '../media/x.png' });
    put('/ppt/notesSlides/notesSlide1.xml', NOTES('speaker notes'), CTP + 'notesSlide+xml', notesRels);
    pkg.rels['/ppt/slides/slide1.xml'].push({ Id: 'rId9', Type: REL.notesSlide, Target: '../notesSlides/notesSlide1.xml' });
    if (opts.imageOnLayout) pkg.rels['/ppt/slideLayouts/slideLayout3.xml'].push({ Id: 'rId2', Type: REL.image, Target: '../media/x.png' });
    const presPart = '/ppt/presentation.xml';
    const pres = dec.decode(pkg.parts[presPart]).replace('</p:sldMasterIdLst>',
        '</p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rIdN"/></p:notesMasterIdLst>'
        + '<p:handoutMasterIdLst><p:handoutMasterId r:id="rIdH"/></p:handoutMasterIdLst>');
    pkg.parts[presPart] = enc.encode(pres);
    pkg.rels[presPart].push({ Id: 'rIdN', Type: REL.notesMaster, Target: 'notesMasters/notesMaster1.xml' },
        { Id: 'rIdH', Type: REL.handoutMaster, Target: 'handoutMasters/handoutMaster1.xml' });
    return opc.write(pkg);
}
const text = (part) => part.shapes[0].txBody.paragraphs[0].runs[0].value;
const unmodelled = (r) => r.unmodelledParts.map(u => u.partName);
const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {}).filter(([k]) => !k.startsWith('xmlns'))) });
const sameXml = (a, b) => props.sameElement(noNs(xml.parse(dec.decode(a))), noNs(xml.parse(dec.decode(b))));

describe('pmlPackageParts through pptxFullBundle — the read', () => {
    const r = full.read(deck());
    const p = r.presentation;

    test('every layout of the one master is read, in its list\'s order; layoutRef and layoutIds follow', () => {
        expect(p.slideLayouts.map(l => l.name)).toEqual(['A', 'B', 'C']);
        expect(p.slideLayouts.map(l => l.layoutType)).toEqual(['title', 'obj', 'blank']);
        expect(p.slides.map(s => s.layoutRef)).toEqual([1, 1]);
        expect(p.slideMasters[0].layoutIds.map(li => li.rId)).toEqual(['rId1', 'rId2', 'rId3']);
        expect(unmodelled(r).filter(n => n.includes('slideLayout'))).toEqual([]);
    });

    test('a notes slide becomes its slide\'s notes, its shapes typed like a slide\'s', () => {
        expect(p.slides[0].notes.type).toBe('notes');
        expect(text(p.slides[0].notes)).toBe('speaker notes');
        expect(p.slides[1].notes).toBeUndefined();
        expect(unmodelled(r)).not.toContain('/ppt/notesSlides/notesSlide1.xml');
    });

    test('the notes and handout masters, each with its theme; the walker reaches them', () => {
        expect(p.notesMaster.type).toBe('notesMaster');
        expect(text(p.notesMaster)).toBe('master');
        expect(p.notesMaster.theme.name).toBe(p.theme.name);
        expect(p.notesMaster.hf).toEqual({ kind: 'hf', attrs: { hdr: '0' } });
        expect(p.handoutMaster.type).toBe('handoutMaster');
        expect(p.handoutMaster.theme).toBeDefined();
        expect(r.unmodelledParts).toEqual([]);
    });
});

describe('pmlPackageParts through pptxFullBundle — the write', () => {
    const src = opc.read(deck());
    const out = opc.read(full.write(full.read(deck()).presentation));

    test('the notes parts, their relationships and the presentation\'s lists are written', () => {
        for (const n of ['/ppt/notesSlides/notesSlide1.xml', '/ppt/notesMasters/notesMaster1.xml', '/ppt/handoutMasters/handoutMaster1.xml']) {
            expect(out.parts[n]).toBeDefined();
        }
        expect(out.contentTypes.overrides['/ppt/notesSlides/notesSlide1.xml']).toBe(CTP + 'notesSlide+xml');
        const presKids = xml.parse(dec.decode(out.parts['/ppt/presentation.xml'])).children.filter(c => c.type === 'element').map(c => c.name);
        expect(presKids.slice(0, 4)).toEqual(['p:sldMasterIdLst', 'p:notesMasterIdLst', 'p:handoutMasterIdLst', 'p:sldIdLst']);
        const sRel = out.rels['/ppt/slides/slide1.xml'].find(x => x.Type === REL.notesSlide);
        expect(sRel.Target).toBe('../notesSlides/notesSlide1.xml');
        expect(out.rels['/ppt/notesSlides/notesSlide1.xml'].map(x => x.Type).sort()).toEqual([REL.notesMaster, REL.slide].sort());
        const nmTheme = out.rels['/ppt/notesMasters/notesMaster1.xml'][0];
        expect(nmTheme.Type).toBe(REL.theme);
        expect(out.parts['/ppt/theme/' + nmTheme.Target.split('/').pop()]).toBeDefined();
        expect(nmTheme.Target).not.toBe('../theme/theme1.xml');
    });

    test('each part read for the first time is written as read', () => {
        expect(sameXml(out.parts['/ppt/notesSlides/notesSlide1.xml'], src.parts['/ppt/notesSlides/notesSlide1.xml'])).toBe(true);
        expect(sameXml(out.parts['/ppt/notesMasters/notesMaster1.xml'], src.parts['/ppt/notesMasters/notesMaster1.xml'])).toBe(true);
        expect(sameXml(out.parts['/ppt/handoutMasters/handoutMaster1.xml'], src.parts['/ppt/handoutMasters/handoutMaster1.xml'])).toBe(true);
        for (const n of [1, 2, 3]) {
            const name = `/ppt/slideLayouts/slideLayout${n}.xml`;
            expect(sameXml(out.parts[name], src.parts[name])).toBe(true);
        }
        expect(out.rels['/ppt/slides/slide1.xml'].find(x => x.Type.endsWith('/slideLayout')).Target).toBe('../slideLayouts/slideLayout2.xml');
    });

    test('a model with notes and no notesMaster gets a minimal one on the main theme', () => {
        const written = opc.read(full.write({ slides: [{ title: 'x', notes: full.read(deck()).presentation.slides[0].notes }] }));
        expect(written.parts['/ppt/notesMasters/notesMaster1.xml']).toBeDefined();
        expect(written.rels['/ppt/notesMasters/notesMaster1.xml'][0].Target).toBe('../theme/theme1.xml');
        expect(text(full.read(opc.write(written)).presentation.slides[0].notes)).toBe('speaker notes');
    });
});

describe('pmlPackageParts — what stays unmodelled', () => {
    test('a notes slide naming another kind of part stays unmodelled', () => {
        const r = full.read(deck({ imageOnNotes: true }));
        expect(r.presentation.slides[0].notes).toBeUndefined();
        expect(unmodelled(r)).toContain('/ppt/notesSlides/notesSlide1.xml');
    });
    test('unused layouts are all or nothing: one naming an image leaves them all', () => {
        const r = full.read(deck({ imageOnLayout: true }));
        expect(r.presentation.slideLayouts.map(l => l.name)).toEqual(['B']);
        expect(unmodelled(r)).toContain('/ppt/slideLayouts/slideLayout1.xml');
    });
    test('two masters: the layouts are left as the core reads them', () => {
        const pkg = opc.read(deck());
        const presPart = '/ppt/presentation.xml';
        pkg.parts['/ppt/slideMasters/slideMaster2.xml'] = pkg.parts['/ppt/slideMasters/slideMaster1.xml'];
        pkg.rels['/ppt/slideMasters/slideMaster2.xml'] = pkg.rels['/ppt/slideMasters/slideMaster1.xml'];
        pkg.contentTypes.overrides['/ppt/slideMasters/slideMaster2.xml'] = CTP + 'slideMaster+xml';
        pkg.parts[presPart] = enc.encode(dec.decode(pkg.parts[presPart]).replace('</p:sldMasterIdLst>', '<p:sldMasterId id="2147483660" r:id="rIdM2"/></p:sldMasterIdLst>'));
        pkg.rels[presPart].push({ Id: 'rIdM2', Type: R + '/slideMaster', Target: 'slideMasters/slideMaster2.xml' });
        const r = full.read(opc.write(pkg));
        expect(r.presentation.slideMasters).toHaveLength(2);
        expect(r.presentation.slideLayouts.map(l => l.name)).toEqual(['B']);
    });
    test('pptxLargeBundle reads as before', () => {
        const r = large.read(deck());
        expect(r.presentation.slides[0].notes).toBeUndefined();
        expect(r.presentation.notesMaster).toBeUndefined();
        expect(r.presentation.slideLayouts).toHaveLength(1);
        expect(unmodelled(r)).toContain('/ppt/notesSlides/notesSlide1.xml');
    });
});

describe('the pptx walker — package hooks and the notes parts', () => {
    test('hydratePackage gets the context; a part it consumes leaves unmodelledParts', () => {
        const api = resolveIn(ooxmlMods.pptx, 'pptx');
        const seen = {};
        api.use({
            hydratePackage(pres, ctx) {
                seen.slideParts = ctx.slideParts;
                seen.peek = !!ctx.parts['/ppt/notesSlides/notesSlide1.xml'];
                ctx.consume('/ppt/handoutMasters/handoutMaster1.xml');
            },
            dehydratePackage(pres, ctx) { seen.written = Object.keys(ctx.package.parts).includes('/ppt/presentation.xml'); }
        });
        const r = api.read(deck());
        expect(seen.slideParts).toEqual(['/ppt/slides/slide1.xml', '/ppt/slides/slide2.xml']);
        expect(seen.peek).toBe(true);
        expect(unmodelled(r)).toContain('/ppt/notesSlides/notesSlide1.xml');
        expect(unmodelled(r)).not.toContain('/ppt/handoutMasters/handoutMaster1.xml');
        api.write(r.presentation);
        expect(seen.written).toBe(true);
    });

    test('the text, part and theme hooks reach the notes slides and masters', () => {
        const calls = { runs: 0, parts: [], themes: 0 };
        const walker = createWalker();
        walker.use({
            hydrateRunProperties(rPr) { calls.runs++; return rPr; },
            hydrateSlidePart(part) { calls.parts.push(part.type); return part; },
            hydrateTheme(t) { calls.themes++; return t; }
        });
        const p = full.read(deck()).presentation;
        walker.applyHydrate(p);
        expect(calls.parts.filter(t => t === 'notes' || t === 'notesMaster' || t === 'handoutMaster').sort()).toEqual(['handoutMaster', 'notes', 'notesMaster']);
        expect(calls.themes).toBe(3);
        // The runs with an a:rPr: the notes slide's and the notes master's
        // (the slides' titles have none).
        expect(calls.runs).toBe(2);
    });
});
