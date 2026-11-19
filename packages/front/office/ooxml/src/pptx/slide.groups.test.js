// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — pptx group shapes typed with the `typedGroups` read option (T24,
 * BL-2888): a `p:grpSp` as `{ type: 'group', shapes, _extras }` at any
 * depth, a picture inside with its image, written back in place; the
 * default read unchanged.
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const xml = rt.resolve('xml');
const opc = rt.resolve('opcPackage');
const pptx = rt.resolve('pptx');
const { createWalker } = rt.resolve('pptxWalker');
const enc = new TextEncoder();
const dec = new TextDecoder();

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SLIDE = '/ppt/slides/slide1.xml';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const sp = (id, text) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="S${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>`
    + `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const grpHead = (id) => `<p:nvGrpSpPr><p:cNvPr id="${id}" name="G${id}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
    + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="10" cy="10"/><a:chOff x="0" y="0"/><a:chExt cx="10" cy="10"/></a:xfrm></p:grpSpPr>';
const PIC = '<p:pic><p:nvPicPr><p:cNvPr id="9" name="P9" descr="logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
    + '<p:blipFill><a:blip r:embed="rIdG"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
const GROUP = `<p:grpSp>${grpHead(4)}${sp(5, 'inner')}<p:grpSp>${grpHead(6)}${PIC}</p:grpSp></p:grpSp>`;

/** A one-slide deck: a shape, a group (a shape, a nested group with a picture), a shape. */
function deck() {
    const pkg = opc.read(pptx.write({ slides: [{ shapes: [] }] }));
    const text = dec.decode(pkg.parts[SLIDE]).replace('</p:spTree>', `${sp(2, 'before')}${GROUP}${sp(3, 'after')}</p:spTree>`);
    pkg.parts[SLIDE] = enc.encode(text);
    opc.setPart(pkg, '/ppt/media/imageG.png', PNG, 'image/png');
    pkg.contentTypes.defaults.png = 'image/png';
    pkg.rels[SLIDE].push({ Id: 'rIdG', Type: R + '/image', Target: '../media/imageG.png' });
    return opc.write(pkg);
}
const texts = (shapes) => shapes.flatMap(s => (s.type === 'group' ? texts(s.shapes)
    : s.txBody ? s.txBody.paragraphs.flatMap(p => p.runs.map(r => r.value)) : []));
const kids = (node) => node.children.filter(c => c.type === 'element').map(c => c.name);
const treeOf = (bytes) => {
    const root = xml.parse(dec.decode(opc.read(bytes).parts[SLIDE]));
    return root.children.find(c => c.name === 'p:cSld').children.find(c => c.name === 'p:spTree');
};

describe('typedGroups — the read', () => {
    test('the default read keeps a group verbatim (unchanged)', () => {
        const s = pptx.read(deck()).presentation.slides[0];
        expect(s.shapes.map(x => x.type)).toEqual(['shape', 'shape']);
        expect(s.spTreeExtras.map(e => e.name)).toContain('p:grpSp');
    });
    test('a group, nested, in its place, its shapes typed as the tree\'s', () => {
        const s = pptx.read(deck(), { typedGroups: true }).presentation.slides[0];
        expect(s.shapes.map(x => x.type)).toEqual(['shape', 'group', 'shape']);
        const g = s.shapes[1];
        expect(g.shapes.map(x => x.type)).toEqual(['shape', 'group']);
        expect(g._extras.map(e => e.name)).toEqual(['p:nvGrpSpPr', 'p:grpSpPr']);
        expect(texts(s.shapes)).toEqual(['before', 'inner', 'after']);
        expect((s.spTreeExtras || []).map(e => e.name)).not.toContain('p:grpSp');
    });
    test('a picture inside a group gets its image', () => {
        const pic = pptx.read(deck(), { typedGroups: true }).presentation.slides[0].shapes[1].shapes[1].shapes[0];
        expect(pic.type).toBe('picture');
        expect(pic.image.data).toEqual(PNG);
    });
});

describe('typedGroups — the write', () => {
    test('a group is written as a p:grpSp in its place; its picture\'s image is written and named', () => {
        const bytes = pptx.write(pptx.read(deck(), { typedGroups: true }).presentation);
        const tree = treeOf(bytes);
        expect(kids(tree)).toEqual(['p:nvGrpSpPr', 'p:grpSpPr', 'p:sp', 'p:grpSp', 'p:sp']);
        const out = opc.read(bytes);
        const blip = xml.serialize(tree).match(/r:embed="([^"]+)"/)[1];
        const rel = out.rels[SLIDE].find(r => r.Id === blip);
        expect(rel && rel.Type).toBe(R + '/image');
        expect(out.parts['/ppt/' + rel.Target.replace('../', '')]).toEqual(PNG);
        const again = pptx.read(bytes, { typedGroups: true }).presentation.slides[0];
        expect(texts(again.shapes)).toEqual(['before', 'inner', 'after']);
    });
});

describe('the pptx walker reaches a group\'s shapes', () => {
    test('a run inside a nested group gets the run hook', () => {
        const seen = [];
        const w = createWalker();
        w.use({ hydrateRunProperties(r) { seen.push(r.lang); return r; } });
        const p = pptx.read(deck(), { typedGroups: true }).presentation;
        w.applyHydrate(p);
        expect(seen).toEqual(['en-US', 'en-US', 'en-US']);
    });
});
