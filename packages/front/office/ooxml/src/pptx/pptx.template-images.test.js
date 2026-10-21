// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests — a picture on a slide layout or a slide master carries its image,
 * as a slide picture does: `pptx.read` resolves its `r:embed` through the
 * relationships of the part that holds it (ECMA-376 Part 1 § 19.3.1.37).
 */
import { describe, test, expect } from 'bun:test';
import { ooxmlRuntime, PNG_1X1 } from '../../tests/_helpers/written-documents.js';

const rt = ooxmlRuntime();
const p = rt.resolve('pptx');
const opc = rt.resolve('opcPackage');
const pic = rt.resolve('pptxPicture');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const LAYOUT = '/ppt/slideLayouts/slideLayout1.xml';
const MASTER = '/ppt/slideMasters/slideMaster1.xml';

/** A `p:pic` naming `rId` for its picture. */
const picture = (id, rId, descr) => `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Logo ${id}" descr="${descr}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>`
    + `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';

/** A written deck with one picture on its layout and one on its master. */
function deckWithTemplatePictures() {
    const pkg = opc.read(p.write({ slides: [{ title: 'one' }] }));
    opc.setPart(pkg, '/ppt/media/template.png', PNG_1X1, 'image/png');
    for (const [part, id] of [[LAYOUT, 70], [MASTER, 80]]) {
        const text = decoder.decode(pkg.parts[part]);
        expect(text).toContain('</p:spTree>');
        pkg.parts[part] = encoder.encode(text.replace('</p:spTree>', `${picture(id, 'rId90', `picture ${id}`)}</p:spTree>`));
        pkg.rels[part] = [...(pkg.rels[part] || []), { Id: 'rId90', Type: pic.REL_TYPE_IMAGE, Target: '../media/template.png' }];
    }
    return opc.write(pkg);
}

describe('pptx — layout and master pictures carry their image', () => {
    const deck = p.read(deckWithTemplatePictures()).presentation;
    const pictureOf = (shapes, id) => (shapes || []).find((s) => s.type === 'picture' && Number(s.id) === id);

    test('a layout picture', () => {
        const s = pictureOf(deck.slideLayouts?.[0]?.shapes, 70);
        expect(s?.description).toBe('picture 70');
        expect(Array.from(s?.image?.data || [])).toEqual(Array.from(PNG_1X1));
        expect(s?.image?.contentType).toBe('image/png');
        expect(s?.image?.rId).toBe('rId90');
    });

    test('a master picture', () => {
        const s = pictureOf(deck.slideMasters?.[0]?.shapes, 80);
        expect(Array.from(s?.image?.data || [])).toEqual(Array.from(PNG_1X1));
        expect(s?.image?.contentType).toBe('image/png');
    });

    test('a template picture whose relationship is missing stays without an image', () => {
        const pkg = opc.read(deckWithTemplatePictures());
        pkg.rels[LAYOUT] = (pkg.rels[LAYOUT] || []).filter((r) => r.Id !== 'rId90');
        const back = p.read(opc.write(pkg)).presentation;
        expect(pictureOf(back.slideLayouts?.[0]?.shapes, 70)?.image).toBeUndefined();
    });

    test('no internal marker is left on the read model', () => {
        for (const t of [...(deck.slideLayouts || []), ...(deck.slideMasters || [])]) {
            expect('_partName' in t).toBe(false);
            for (const s of t.shapes || []) expect('_chartPartName' in s).toBe(false);
        }
    });
});
