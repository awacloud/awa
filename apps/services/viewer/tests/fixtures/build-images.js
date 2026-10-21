// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Builds the viewer's image fixtures — every image path of
 * every painter, one labelled cell per case:
 *
 * - `images.pdf` (`@awacloud/pdf` parser + writer): JPEG RGB / grey / CMYK
 *   (Adobe-inverted, and plain with an inverting `/Decode`), Flate grey at
 *   1, 2, 4, 8 bits, RGB at 8 and 16 bits, Indexed, `/Decode` arrays,
 *   colour-key masks, soft masks, explicit masks, stencil masks, an inline
 *   image, rotation, mirror and flip, interpolation, a shrunk detailed
 *   image and one over the 16-Mpx memory guard;
 * - `images.docx` / `images.pptx` (`@awacloud/ooxml` writers): PNG, JPEG,
 *   GIF, SVG, EMF (a placeholder), alternative text, a crop (`a:srcRect`),
 *   floating pictures (square wrapping, behind the text);
 * - `images.odt` / `images.odp` (fw `zip`, hand-written ODF): PNG, JPEG,
 *   SVG, WMF placeholder, alternative text (`svg:title`).
 *
 * Every pixel is generated (`image-sources.js`, `image-encoders.js`):
 * nothing is copied from elsewhere. Run:
 * `bun apps/services/viewer/tests/fixtures/build-images.js` (the outputs
 * are committed).
 *
 * @module viewer/tests/fixtures/build-images
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { zlib as zlibModule } from '@awacloud/fw/io/compress/zlib.js';
import { zip as zipModule } from '@awacloud/fw/io/compress/zip.js';
import { docx as docxModule, pptx as pptxModule } from '@awacloud/ooxml';
import { pdfParser, pdfWriter } from '@awacloud/pdf';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeJpeg, encodePng } from './image-encoders.js';
import {
    grayRamp, minimalEmf, pack, quadrantsCmyk, quadrantsGif, quadrantsIndexed, quadrantsRgb, QUADRANTS_SVG, rings, to16
} from './image-sources.js';

const rt = new ModuleRuntime();
rt.registerAllDeep([zlibModule, zipModule, docxModule, pptxModule, pdfParser, pdfWriter]);
const flate = (b) => rt.resolve('zlib').zlibSync(b);
const parser = rt.resolve('pdfParser');
const te = new TextEncoder();
const here = (name) => fileURLToPath(new URL(name, import.meta.url));

// ── PDF ──────────────────────────────────────────────────────────────────

/** A PDF document assembled from object source text. */
function pdfDoc() {
    /** @type {{num: number, gen: number, value: any}[]} */
    const objs = [];
    const add = (value) => { objs.push({ num: objs.length + 1, gen: 0, value }); return objs.length; };
    const obj = (src) => parser.parseFromBytes(te.encode(src));
    return {
        /** @param {string} src */
        dict: (src) => add(obj(src)),
        /** @param {string} dictSrc @param {Uint8Array} raw */
        stream: (dictSrc, raw) => add({ type: 'stream', dict: obj(dictSrc), raw }),
        reserve: () => add({ type: 'null' }),
        set: (num, src) => { objs[num - 1].value = obj(src); },
        bytes: (root) => rt.resolve('pdfWriter').writeDocument({ indirects: objs, root: { num: root, gen: 0 }, version: '1.7' })
    };
}

const doc = pdfDoc();
const catalog = doc.reserve();
const pagesNum = doc.reserve();
const font = doc.dict('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

/**
 * One image XObject.
 * @param {string} dict the image dictionary entries (without /Length)
 * @param {Uint8Array} data
 */
const image = (dict, data) => doc.stream(`<< /Type /XObject /Subtype /Image ${dict} >>`, data);

const W = 64; const H = 48;
const rgb = quadrantsRgb(W, H);
const gray = grayRamp(W, H);
const cmyk = quadrantsCmyk(W, H);
const inverted = (px) => px.map((v) => 255 - v);

/** A PDF page of up to 9 labelled cells (3 × 3), each drawing `ops`. */
const pageNums = [];
function page(title, cells) {
    const xo = [];
    let content = `BT /F1 16 Tf 40 752 Td (${title}) Tj ET\n`;
    cells.forEach((cell, i) => {
        const x = 40 + (i % 3) * 180;
        const y = 520 - Math.floor(i / 3) * 230;
        // A checkerboard under every cell shows transparency.
        content += '0.86 g ';
        for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 10; cx++) if ((cx + cy) % 2) content += `${x + cx * 15} ${y + cy * 15} 15 15 re `;
        content += 'f 0 g\n';
        content += `BT /F1 9 Tf ${x} ${y - 14} Td (${cell.label}) Tj ET\n`;
        content += `q ${cell.ops(x, y)} Q\n`;
        for (const [name, num] of Object.entries(cell.xobjects || {})) xo.push(`/${name} ${num} 0 R`);
    });
    const contents = doc.stream('<< /Filter /FlateDecode >>', flate(te.encode(content)));
    pageNums.push(doc.dict(`<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 612 792] /Contents ${contents} 0 R
        /Resources << /Font << /F1 ${font} 0 R >> /XObject << ${xo.join(' ')} >> >> >>`));
}
/** Draw XObject `name` into the 150 × 112.5 box of a cell (4:3, as the images). */
const draw = (name) => (x, y) => `150 0 0 112.5 ${x} ${y} cm /${name} Do`;
const cell = (label, name, num, ops) => ({ label, xobjects: { [name]: num }, ops: ops || draw(name) });

page('JPEG and sample depths', [
    cell('JPEG RGB', 'J1', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, encodeJpeg({ width: W, height: H, components: 3, pixels: rgb }))),
    cell('JPEG grey', 'J2', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode`, encodeJpeg({ width: W, height: H, components: 1, pixels: gray }))),
    cell('JPEG CMYK, Adobe inverted', 'J3', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /DCTDecode`, encodeJpeg({ width: W, height: H, components: 4, pixels: inverted(cmyk), adobe: true }))),
    cell('JPEG CMYK, plain + Decode 1 0', 'J4', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Decode [1 0 1 0 1 0 1 0] /Filter /DCTDecode`, encodeJpeg({ width: W, height: H, components: 4, pixels: inverted(cmyk), adobe: false }))),
    cell('Flate grey 1 bit', 'F1', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /FlateDecode`, flate(pack(gray, W, H, 1)))),
    cell('Flate grey 2 bits', 'F2', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 2 /Filter /FlateDecode`, flate(pack(gray, W, H, 2)))),
    cell('Flate grey 4 bits', 'F4', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 4 /Filter /FlateDecode`, flate(pack(gray, W, H, 4)))),
    cell('Flate grey 8 bits', 'F8', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, flate(gray))),
    cell('Flate RGB 16 bits', 'F16', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 16 /Filter /FlateDecode`, flate(to16(rgb))))
]);

const circle = (w, h, inside, outside) => {
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = Math.hypot(x - w / 2, y - h / 2) < Math.min(w, h) * 0.42 ? inside : outside;
    return px;
};
const smask = doc.stream(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode >>`,
    flate(Uint8Array.from({ length: W * H }, (_, i) => Math.round((255 * (i % W)) / (W - 1)))));
const roundMask = doc.stream(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode >>`, flate(circle(W, H, 255, 0)));
const stencilMask = doc.stream(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ImageMask true /BitsPerComponent 1 /Filter /FlateDecode >>`, flate(pack(circle(W, H, 0, 255), W, H, 1)));
const palette = '<1F3A5FE8833A2A9D8FE76F91>';
const inline = quadrantsRgb(16, 12);
const hex = [...inline].map((b) => b.toString(16).padStart(2, '0')).join('') + '>';

page('Colour spaces and masks', [
    cell('Indexed 8 bits', 'I8', image(`/Width ${W} /Height ${H} /ColorSpace [/Indexed /DeviceRGB 3 ${palette}] /BitsPerComponent 8 /Filter /FlateDecode`, flate(quadrantsIndexed(W, H)))),
    cell('Indexed 1 bit, Decode 1 0', 'I1', image(`/Width ${W} /Height ${H} /ColorSpace [/Indexed /DeviceRGB 1 <F4F1E8B02030>] /BitsPerComponent 1 /Decode [1 0] /Filter /FlateDecode`, flate(pack(circle(W, H, 255, 0), W, H, 1)))),
    cell('Grey, Decode 1 0 (inverted)', 'G1', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Decode [1 0] /Filter /FlateDecode`, flate(gray))),
    cell('Colour key: red masked out', 'K1', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Mask [200 240 20 60 20 60] /Filter /FlateDecode`, flate(rgb))),
    cell('Soft mask: fades in from the left', 'S1', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${smask} 0 R /Filter /FlateDecode`, flate(rgb))),
    cell('Explicit mask: a disc', 'M1', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Mask ${stencilMask} 0 R /Filter /FlateDecode`, flate(rgb))),
    cell('Stencil mask, painted red', 'ST', doc.stream(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ImageMask true /BitsPerComponent 1 /Filter /FlateDecode >>`, flate(pack(circle(W, H, 0, 255), W, H, 1))), (x, y) => `0.8 0.1 0.1 rg ${draw('ST')(x, y)}`),
    { label: 'Inline image (BI, ASCIIHex)', ops: (x, y) => `150 0 0 112.5 ${x} ${y} cm BI /W 16 /H 12 /CS /RGB /BPC 8 /F /AHx ID ${hex} EI` },
    cell('JPEG + round soft mask', 'JS', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${roundMask} 0 R /Filter /DCTDecode`, encodeJpeg({ width: W, height: H, components: 3, pixels: rgb })))
]);

const ref = image(`/Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, flate(rgb));
const tiny = quadrantsRgb(8, 6);
const big = 1200;
const huge = { w: 5000, h: 4000 };
page('Transforms and resampling', [
    { label: 'Reference', xobjects: { R: ref }, ops: draw('R') },
    { label: 'Rotated 30 degrees', xobjects: { R: ref }, ops: (x, y) => `1 0 0 1 ${x + 85} ${y + 6} cm 0.866 0.5 -0.5 0.866 0 0 cm 120 0 0 90 0 0 cm /R Do` },
    { label: 'Mirrored (left-right)', xobjects: { R: ref }, ops: (x, y) => `-150 0 0 112.5 ${x + 150} ${y} cm /R Do` },
    { label: 'Flipped (upside down)', xobjects: { R: ref }, ops: (x, y) => `150 0 0 -112.5 ${x} ${y + 112.5} cm /R Do` },
    cell('8 x 6 pixels, enlarged', 'T1', image('/Width 8 /Height 6 /ColorSpace /DeviceRGB /BitsPerComponent 8', tiny)),
    cell('8 x 6, /Interpolate true', 'T2', image('/Width 8 /Height 6 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate true', tiny)),
    cell('1200 x 1200 rings, shrunk', 'B1', image(`/Width ${big} /Height ${big} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, flate(rings(big, big))), (x, y) => `112.5 0 0 112.5 ${x} ${y} cm /B1 Do`),
    cell('JPEG grey, Decode 1 0 (inverted)', 'JD', image(`/Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Decode [1 0] /Filter /DCTDecode`, encodeJpeg({ width: W, height: H, components: 1, pixels: gray }))),
    cell('5000 x 4000 (over 16 Mpx)', 'B2', image(`/Width ${huge.w} /Height ${huge.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, flate(grayRamp(huge.w, huge.h))))
]);

doc.set(pagesNum, `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`);
doc.set(catalog, `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);
const written = doc.bytes(catalog);
writeFileSync(here('images.pdf'), written.bytes ?? written);

// ── Office documents ─────────────────────────────────────────────────────

const zip = rt.resolve('zip');
const td = new TextDecoder();
const PNG = encodePng(W, H, rgb);
const JPEG = encodeJpeg({ width: W, height: H, components: 3, pixels: rgb });
const GIF = quadrantsGif(W, H);
const SVG = te.encode(QUADRANTS_SVG);
const EMF = minimalEmf();
/** A long paragraph for text to flow round floating pictures. */
const LOREM = 'The text of this paragraph flows round the floating picture, as a word processor lays it out: '
    + 'the picture keeps its place and its size, the lines make room for it. '.repeat(4);

/** Rewrite parts of a ZIP package (the writers' XML, completed by hand). */
function repack(bytes, edits) {
    const files = zip.unzipSync(bytes);
    for (const [part, edit] of Object.entries(edits)) files[part] = te.encode(edit(td.decode(files[part])));
    return zip.zipSync(files);
}

// DOCX: the writer emits inline pictures; anchors and the crop are written
// over its XML (the typed model carries neither). The writer declares
// `xmlns:wp` on the root itself (reported to the office writer).
const EMU = 914400 / 96;
const run = (children) => ({ type: 'run', children });
const para = (...children) => ({ type: 'paragraph', children });
const text = (value) => run([{ type: 'text', value }]);
let docId = 0;
/** @param {Uint8Array} data @param {string} contentType @param {string} alt */
const pic = (data, contentType, alt, w = 192, h = 144) => run([{
    type: 'drawing', mode: 'inline', cx: Math.round(w * EMU), cy: Math.round(h * EMU), docId: ++docId,
    docName: `Picture ${docId}`, description: alt, image: { data, contentType }
}]);
const docxBytes = rt.resolve('docx').write({
    body: [
        para(text('Images in a Word document. Each picture is 2 × 1.5 inches.')),
        para(text('PNG: '), pic(PNG, 'image/png', 'Four coloured quadrants, PNG')),
        para(text('JPEG: '), pic(JPEG, 'image/jpeg', 'Four coloured quadrants, JPEG')),
        para(text('GIF, yellow quadrant transparent: '), pic(GIF, 'image/gif', 'Four coloured quadrants, GIF')),
        para(text('SVG: '), pic(SVG, 'image/svg+xml', 'Four coloured quadrants, SVG')),
        para(text('EMF (a vector metafile the browser cannot draw): '), pic(EMF, 'image/x-emf', 'A metafile drawing')),
        para(text('PNG cropped to its right half (a:srcRect l=50%): '), pic(PNG, 'image/png', 'The right half of the quadrants', 96, 144)),
        para(text('No alternative text: '), pic(PNG, 'image/png', '', 96, 72)),
        para(pic(PNG, 'image/png', 'A picture floated right, text wrapped round it', 144, 108), text(LOREM)),
        para(pic(PNG, 'image/png', 'A picture behind the text', 288, 72), text(LOREM))
    ],
    sectPr: { pageSize: { w: 11906, h: 16838 }, pageMargin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
});
const anchorOf = (inline, { h, v = 0, wrap, behind = false }) => inline
    .replace(/<wp:inline([^>]*)>/, `<wp:anchor$1 simplePos="0" relativeHeight="1" behindDoc="${behind ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">`
        + '<wp:simplePos x="0" y="0"/>'
        + `<wp:positionH relativeFrom="column">${h === 'right' ? '<wp:align>right</wp:align>' : `<wp:posOffset>${Math.round(h * EMU)}</wp:posOffset>`}</wp:positionH>`
        + `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${Math.round(v * EMU)}</wp:posOffset></wp:positionV>`)
    .replace(/(<wp:effectExtent[^>]*\/>)/, `$1${wrap}`)
    .replace('</wp:inline>', '</wp:anchor>');
writeFileSync(here('images.docx'), repack(docxBytes, {
    'word/document.xml': (x) => x
        // Picture 6: keep the right half.
        .replace(/(<wp:docPr id="6"[\s\S]*?<a:blip [^>]*\/>)/, '$1<a:srcRect l="50000"/>')
        .replace(/<wp:inline[^>]*>(?:(?!<\/wp:inline>)[\s\S])*?<wp:docPr id="8"[\s\S]*?<\/wp:inline>/, (m) => anchorOf(m, { h: 'right', wrap: '<wp:wrapSquare wrapText="bothSides"/>' }))
        .replace(/<wp:inline[^>]*>(?:(?!<\/wp:inline>)[\s\S])*?<wp:docPr id="9"[\s\S]*?<\/wp:inline>/, (m) => anchorOf(m, { h: 96, v: 12, wrap: '<wp:wrapNone/>', behind: true }))
}));

// PPTX: the writer's default master and layout; the crop written over its XML.
const P = (id, x, y, data, contentType, alt) => ({
    type: 'picture', id, name: `Picture ${id}`, description: alt, prstGeom: 'rect',
    offsetX: Math.round(x * EMU), offsetY: Math.round(y * EMU), cx: Math.round(256 * EMU), cy: Math.round(192 * EMU),
    image: { data, contentType }
});
const pptxBytes = rt.resolve('pptx').write({
    slides: [
        { type: 'slide', shapes: [
            P(2, 64, 64, PNG, 'image/png', 'Four coloured quadrants, PNG'),
            P(3, 512, 64, JPEG, 'image/jpeg', 'Four coloured quadrants, JPEG'),
            P(4, 960, 64, GIF, 'image/gif', 'Four coloured quadrants, GIF'),
            P(5, 64, 384, SVG, 'image/svg+xml', 'Four coloured quadrants, SVG'),
            P(6, 512, 384, EMF, 'image/x-emf', 'A metafile drawing'),
            P(7, 960, 384, PNG, 'image/png', 'The bottom-right quadrant, cropped')
        ] }
    ]
});
writeFileSync(here('images.pptx'), repack(pptxBytes, {
    'ppt/slides/slide1.xml': (x) => x.replace(/(<p:cNvPr id="7"[\s\S]*?<a:blip [^>]*\/>)/, '$1<a:srcRect l="50000" t="50000"/>')
}));

// ODT / ODP: hand-written ODF (the odf package reads, its writers do not
// place pictures), packed with fw zip like build-odf.js.
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
    + 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
    + 'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" '
    + 'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" '
    + 'office:version="1.3"';
const PICTURES = { 'Pictures/q.png': PNG, 'Pictures/q.jpg': JPEG, 'Pictures/q.svg': SVG, 'Pictures/q.wmf': new Uint8Array([0xd7, 0xcd, 0xc6, 0x9a, 0, 0, 0, 0, 0, 0, 64, 0, 48, 0, 96, 0, 0, 0, 0, 0, 0, 0]) };
function odfPack(mime, content, styles) {
    const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>${Object.keys(PICTURES).map((k) => `<manifest:file-entry manifest:full-path="${k}" manifest:media-type=""/>`).join('')}</manifest:manifest>`;
    return zip.zipSync({
        mimetype: [te.encode(mime), { level: 0 }],
        'content.xml': te.encode(content),
        'styles.xml': te.encode(styles),
        'META-INF/manifest.xml': te.encode(manifest),
        ...Object.fromEntries(Object.entries(PICTURES).map(([k, v]) => [k, [v, { level: 0 }]]))
    });
}
const frame = (name, href, alt, { w = '5.08cm', h = '3.81cm', anchor = 'as-char', style = 'fr1', x = '', y = '' } = {}) =>
    `<draw:frame draw:style-name="${style}" draw:name="${name}" text:anchor-type="${anchor}"${x ? ` svg:x="${x}" svg:y="${y}"` : ''} svg:width="${w}" svg:height="${h}">`
    + `<draw:image xlink:href="${href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${alt ? `<svg:title>${alt}</svg:title>` : ''}</draw:frame>`;
const odtContent = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}><office:automatic-styles>
<style:style style:name="fr1" style:family="graphic"><style:graphic-properties style:wrap="none"/></style:style>
<style:style style:name="frClip" style:family="graphic"><style:graphic-properties style:wrap="none" fo:clip="rect(0cm, 0cm, 0cm, 0.8467cm)"/></style:style>
<style:style style:name="frRight" style:family="graphic"><style:graphic-properties style:wrap="parallel" style:horizontal-pos="right" style:horizontal-rel="paragraph"/></style:style>
</office:automatic-styles><office:body><office:text>
<text:p>Images in an OpenDocument text. Each picture is 5.08 × 3.81 cm.</text:p>
<text:p>PNG: ${frame('Image1', 'Pictures/q.png', 'Four coloured quadrants, PNG')}</text:p>
<text:p>JPEG: ${frame('Image2', 'Pictures/q.jpg', 'Four coloured quadrants, JPEG')}</text:p>
<text:p>SVG: ${frame('Image3', 'Pictures/q.svg', 'Four coloured quadrants, SVG')}</text:p>
<text:p>WMF (a vector metafile the browser cannot draw): ${frame('Image4', 'Pictures/q.wmf', 'A metafile drawing')}</text:p>
<text:p>PNG cropped to its right half (fo:clip): ${frame('Image5', 'Pictures/q.png', 'The right half of the quadrants', { w: '0.8467cm', h: '1.27cm', style: 'frClip' })}</text:p>
<text:p>No alternative text: ${frame('Image6', 'Pictures/q.png', '', { w: '2.54cm', h: '1.905cm' })}</text:p>
<text:p>${frame('Image7', 'Pictures/q.png', 'A picture floated right, text wrapped round it', { w: '3.81cm', h: '2.86cm', anchor: 'paragraph', style: 'frRight', x: '12cm', y: '0cm' })}${LOREM}</text:p>
</office:text></office:body></office:document-content>`;
const odtStyles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS}><office:styles/><office:automatic-styles>
<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout>
</office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>`;
writeFileSync(here('images.odt'), odfPack('application/vnd.oasis.opendocument.text', odtContent, odtStyles));

const slideFrame = (name, href, alt, x, y, extra = '') => `<draw:frame draw:name="${name}" svg:x="${x}" svg:y="${y}" svg:width="7cm" svg:height="5.25cm"${extra}>`
    + `<draw:image xlink:href="${href}"/>${alt ? `<svg:title>${alt}</svg:title>` : ''}</draw:frame>`;
const odpContent = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}><office:automatic-styles/><office:body><office:presentation>
<draw:page draw:name="Images" draw:master-page-name="Default">
${slideFrame('Image1', 'Pictures/q.png', 'Four coloured quadrants, PNG', '1cm', '1cm')}
${slideFrame('Image2', 'Pictures/q.jpg', 'Four coloured quadrants, JPEG', '10cm', '1cm')}
${slideFrame('Image3', 'Pictures/q.svg', 'Four coloured quadrants, SVG', '19cm', '1cm')}
${slideFrame('Image4', 'Pictures/q.wmf', 'A metafile drawing', '1cm', '8cm')}
${slideFrame('Image5', 'Pictures/q.png', '', '10cm', '8cm')}
</draw:page></office:presentation></office:body></office:document-content>`;
const odpStyles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS}><office:styles/><office:automatic-styles>
<style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm"/></style:page-layout>
</office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`;
writeFileSync(here('images.odp'), odfPack('application/vnd.oasis.opendocument.presentation', odpContent, odpStyles));
