// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Pictures in the office painters, on the image fixtures
 * (`tests/fixtures/images.{docx,pptx,odt,odp}`, built by `build-images.js`):
 * formats, alternative text, crops, floating placement, and the honest,
 * named placeholder of a format the browser cannot draw.
 *
 * @module viewer/render/images.test
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { fixture, renderContext, withPart } from '../../tests/context.js';
import { renderDocx } from './docx.js';
import { renderOdt } from './odt.js';
import { renderOdp, renderPptx } from './slides.js';
import { parseClip } from './odf-style.js';

/** The first slide of a deck, drawn. */
async function firstSlide(view) {
    const host = document.createElement('div');
    host.append(Object.assign(document.createElement('div'), { className: 'awv-page-surface' }));
    await view.pages[0].draw(host, 1);
    return host;
}
const alts = (root) => [...root.querySelectorAll('img')].map((i) => i.getAttribute('alt'));

describe('docx pictures', () => {
    test('formats, alternative text, crop, floats, placeholder', async () => {
        const view = await renderDocx(fixture('images.docx'), renderContext());
        const el = /** @type {HTMLElement} */ (view.element);
        // PNG, JPEG, GIF, SVG, cropped PNG, no-alt PNG, two floating PNGs.
        expect(el.querySelectorAll('img').length).toBe(8);
        // An empty description stays empty: never the automatic "Picture 7".
        expect(alts(el)).toContain('');
        expect(alts(el).some((a) => /^Picture \d/.test(String(a)))).toBe(false);
        // a:srcRect l=50 %: the picture doubled and moved left by its width.
        const crop = /** @type {HTMLElement} */ (el.querySelector('.awv-crop img'));
        expect(crop.style.width).toBe('200.0000%');
        expect(crop.style.left).toBe('-100.0000%');
        const imgs = /** @type {HTMLElement[]} */ ([...el.querySelectorAll('img')]);
        expect(imgs[6].style.float).toBe('right');            // wrapSquare, aligned right
        expect(imgs[7].classList.contains('awv-anchor')).toBe(true);
        expect(imgs[7].style.zIndex).toBe('-1');              // behindDoc
        const placeholder = /** @type {HTMLElement} */ (el.querySelector('.awv-missing'));
        expect(placeholder.getAttribute('role')).toBe('img');
        expect(placeholder.getAttribute('aria-label')).toBe('Not shown: A metafile drawing');
        expect(view.omissions).toEqual([{ code: 'image/format', count: 1 }]);
    });
});

describe('pptx pictures', () => {
    test('formats, crop, named placeholder', async () => {
        const view = await renderPptx(fixture('images.pptx'), renderContext());
        const slide = await firstSlide(view);
        expect(slide.querySelectorAll('img').length).toBe(5);
        // a:srcRect l=50 % t=50 %: the bottom-right quadrant.
        const cropped = /** @type {HTMLElement} */ ([...slide.querySelectorAll('img')].find((i) => i.getAttribute('alt')?.includes('cropped')));
        expect([cropped.style.width, cropped.style.height, cropped.style.left, cropped.style.top]).toEqual(['200.0000%', '200.0000%', '-100.0000%', '-100.0000%']);
        expect(/** @type {HTMLElement} */ (cropped.parentElement).style.overflow).toBe('hidden');
        const placeholder = /** @type {HTMLElement} */ (slide.querySelector('.awv-missing'));
        expect(placeholder.getAttribute('aria-label')).toBe('Not shown: A metafile drawing');
        expect(view.omissions).toEqual([{ code: 'image/format', count: 1 }]);
    });
});

describe('typed picture crops', () => {
    test('a docx header picture is cropped from its own part', async () => {
        const ctx = renderContext();
        const { docx } = await ctx.engine('docx');
        const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1]);
        const run = docx.imageRun(png, { cx: 914400, cy: 914400 });
        run.children[0].srcRect = { l: 50000 };
        const bytes = docx.write({
            type: 'document',
            body: [docx.paragraph('Body text')],
            sectPr: { headerReferences: [{ type: 'default', rId: 'rIdH1' }] }
        }, { headers: { rIdH1: { type: 'header', body: [{ type: 'paragraph', children: [run] }] } } });
        const view = await renderDocx(bytes, ctx);
        const img = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (view.element).querySelector('.awv-crop img'));
        expect(img?.style.width).toBe('200.0000%');
        expect(img?.style.left).toBe('-100.0000%');
    });
    test('a pptx layout picture is cropped', async () => {
        const pic = '<p:pic><p:nvPicPr><p:cNvPr id="7" name="Logo" descr="layout logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
            + '<p:blipFill><a:blip r:embed="rId9"/><a:srcRect t="50000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
        let bytes = withPart(fixture('images.pptx'), 'ppt/slideLayouts/slideLayout1.xml', (x) => x.replace('<p:grpSpPr/>', `<p:grpSpPr/>${pic}`));
        bytes = withPart(bytes, 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', (x) => x.replace('</Relationships>',
            '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>'));
        const slide = await firstSlide(await renderPptx(bytes, renderContext()));
        const logo = /** @type {HTMLElement} */ ([...slide.querySelectorAll('img')].find((i) => i.getAttribute('alt') === 'layout logo'));
        expect([logo?.style.height, logo?.style.top]).toEqual(['200.0000%', '-100.0000%']);
    });
});

describe('odt pictures', () => {
    test('a picture anchored as a character follows its text; clip, float, placeholder', async () => {
        const view = await renderOdt(fixture('images.odt'), renderContext());
        const el = /** @type {HTMLElement} */ (view.element);
        const png = /** @type {HTMLElement} */ ([...el.querySelectorAll('.awv-p')].find((p) => p.textContent?.startsWith('PNG:')));
        expect(png.lastElementChild?.tagName).toBe('IMG');
        expect(alts(el)).not.toContain('Image6');
        expect(el.querySelector('.awv-crop img')).not.toBe(null);
        const floated = /** @type {HTMLElement} */ ([...el.querySelectorAll('img')].find((i) => i.getAttribute('alt')?.includes('floated')));
        expect(floated.style.float).toBe('right');
        expect(el.querySelector('.awv-missing')?.getAttribute('aria-label')).toBe('Not shown: A metafile drawing');
        expect(view.omissions).toEqual([{ code: 'image/format', count: 1 }]);
    });
    test('a picture anchored as a character between two words stays between them', async () => {
        const ctx = renderContext();
        const { odt } = await ctx.engine('odt');
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const bytes = odt.write({ pictures: { 'Pictures/x.png': png }, body: [{ type: 'paragraph', runs: [
            { type: 'text', value: 'before ' },
            { type: 'image', href: 'Pictures/x.png', width: '1cm', height: '1cm' },
            { type: 'text', value: ' after' }
        ] }] });
        const view = await renderOdt(bytes, ctx);
        const p = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (view.element).querySelector('.awv-p'));
        expect([...p.childNodes].map((n) => n.nodeName === 'IMG' ? 'IMG' : n.textContent)).toEqual(['before ', 'IMG', ' after']);
    });
    test('fo:clip is read as lengths cut from each edge', () => {
        expect(parseClip('rect(0cm, 0cm, 0cm, 0.8467cm)')?.l).toBeCloseTo(32, 0);
        expect(parseClip('rect(1mm 2mm 3mm 4mm)')?.t).toBeCloseTo(3.78, 1);
        expect(parseClip('auto')).toBe(null);
        expect(parseClip('rect(0cm, 0cm, 0cm, 0cm)')).toBe(null);
    });
});

describe('odp pictures', () => {
    test('formats and a named placeholder', async () => {
        const view = await renderOdp(fixture('images.odp'), renderContext());
        const slide = await firstSlide(view);
        expect(slide.querySelectorAll('img').length).toBe(4);
        expect(slide.querySelector('.awv-missing')?.getAttribute('role')).toBe('img');
        expect(view.omissions).toEqual([{ code: 'image/format', count: 1 }]);
    });
});
